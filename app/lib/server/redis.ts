import Redis from "ioredis";

/* -------------------------------------------------------------------------- */
/*                       Minimal in-memory fallback                           */
/* -------------------------------------------------------------------------- */
/**
 * Mimics the subset of ioredis we use: get/set/setex/del/expire.
 * Absolutely NOT for production — only so a dev without Redis can demo.
 */
class MemoryRedis {
  private store = new Map<string, { v: string; exp: number | null }>();

  private isLive(entry: { v: string; exp: number | null }): boolean {
    if (entry.exp === null) return true;
    if (entry.exp > Date.now()) return true;
    return false;
  }

  async get(key: string): Promise<string | null> {
    const e = this.store.get(key);
    if (!e) return null;
    if (!this.isLive(e)) {
      this.store.delete(key);
      return null;
    }
    return e.v;
  }

  async set(
    key: string,
    value: string,
    ...args: unknown[]
  ): Promise<"OK" | null> {
    let exp: number | null = null;
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (typeof a === "string" && a.toUpperCase() === "EX") {
        const secs = Number(args[i + 1]);
        if (!Number.isNaN(secs)) exp = Date.now() + secs * 1000;
      }
      if (typeof a === "string" && a.toUpperCase() === "PX") {
        const ms = Number(args[i + 1]);
        if (!Number.isNaN(ms)) exp = Date.now() + ms;
      }
    }
    this.store.set(key, { v: value, exp });
    return "OK";
  }

  async setex(key: string, seconds: number, value: string): Promise<"OK"> {
    this.store.set(key, { v: value, exp: Date.now() + seconds * 1000 });
    return "OK";
  }

  async del(key: string): Promise<number> {
    return this.store.delete(key) ? 1 : 0;
  }

  async expire(key: string, seconds: number): Promise<number> {
    const e = this.store.get(key);
    if (!e) return 0;
    e.exp = Date.now() + seconds * 1000;
    return 1;
  }

  async exists(key: string): Promise<number> {
    const v = await this.get(key);
    return v == null ? 0 : 1;
  }

  async zadd(key: string, score: number, member: string): Promise<number> {
    const existing = this.store.get(key);
    const zset: Array<[number, string]> = existing ? JSON.parse(existing.v) : [];
    const idx = zset.findIndex(([, m]) => m === member);
    if (idx >= 0) zset[idx] = [score, member];
    else zset.push([score, member]);
    this.store.set(key, { v: JSON.stringify(zset), exp: null });
    return 1;
  }

  async zrangebyscore(
    key: string,
    min: number,
    max: number
  ): Promise<string[]> {
    const e = this.store.get(key);
    if (!e) return [];
    const zset: Array<[number, string]> = JSON.parse(e.v);
    return zset
      .filter(([s]) => s >= min && s <= max)
      .sort((a, b) => a[0] - b[0])
      .map(([, m]) => m);
  }
}

declare global {
  var __ghosttipRedis: Redis | undefined;
}

function createRedis(): Redis {
  const url = process.env.REDIS_URL;
  if (!url) {
    // In-memory fallback so local demos work without Redis installed.
    return new MemoryRedis() as unknown as Redis;
  }
  return new Redis(url, {
    maxRetriesPerRequest: 3,
    lazyConnect: false,
  });
}

export const redis = globalThis.__ghosttipRedis ?? createRedis();

if (process.env.NODE_ENV !== "production") {
  globalThis.__ghosttipRedis = redis;
}
