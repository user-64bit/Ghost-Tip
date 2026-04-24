import { NextResponse, type NextRequest } from "next/server";
import type { ApiError, ApiSuccess, ErrorCode } from "../../types/tip";
import { errorMessage } from "../../types/tip";

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  const body: ApiSuccess<T> = { success: true, data };
  return NextResponse.json(body, init);
}

export function fail(
  code: ErrorCode,
  message?: string,
  status = 400
): NextResponse {
  const body: ApiError = {
    success: false,
    error: { code, message: message ?? errorMessage(code) },
  };
  return NextResponse.json(body, { status });
}

export function parseBigIntAmount(raw: unknown, max = 10n ** 15n): bigint {
  if (raw == null) throw new Error("amount required");
  const s = String(raw).trim();
  if (!/^\d+$/.test(s)) throw new Error("amount must be a positive integer");
  const n = BigInt(s);
  if (n <= 0n) throw new Error("amount must be > 0");
  if (n > max) throw new Error("amount too large");
  return n;
}

/** Serialise Prisma BigInt fields to strings for JSON response. */
export function serialise<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_k, v) =>
      typeof v === "bigint" ? v.toString() : v
    )
  ) as T;
}

/**
 * Wrap a Next.js App Router handler so any thrown error is converted to
 * our `{success:false,error:{...}}` envelope. Without this, unhandled
 * throws (e.g. Prisma connection failures) surface as HTTP 500 with an
 * empty body, which breaks `await res.json()` on the client with the
 * confusing "Unexpected end of JSON input" error.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler<TCtx = any> = (
  req: NextRequest,
  ctx: TCtx
) => Promise<NextResponse> | NextResponse;

export function handler<TCtx>(fn: Handler<TCtx>): Handler<TCtx> {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[api] ${req.method} ${req.nextUrl.pathname} failed:`, err);
      const code = inferErrorCode(message);
      // Helpful diagnostic for the most common dev-setup pitfalls.
      const hint = diagnoseMessage(message);
      return fail(code, hint ?? message.slice(0, 1200), 500);
    }
  };
}

function inferErrorCode(message: string): ErrorCode {
  const m = message.toLowerCase();
  if (
    m.includes("connect") &&
    (m.includes("ecconrefused") ||
      m.includes("econnrefused") ||
      m.includes("postgres") ||
      m.includes("database") ||
      m.includes("prisma"))
  ) {
    return "INTERNAL";
  }
  if (m.includes("prisma") || m.includes("p10") || m.includes("p20")) {
    return "INTERNAL";
  }
  return "INTERNAL";
}

function diagnoseMessage(raw: string): string | null {
  const m = raw.toLowerCase();

  // Connection / reachability
  if (
    m.includes("can't reach database server") ||
    m.includes("econnrefused") ||
    m.includes("connect etimedout") ||
    m.includes("enotfound")
  ) {
    return "Can't reach Postgres. Check DATABASE_URL and that the server is running.";
  }

  // Auth
  if (
    m.includes("authentication failed") ||
    m.includes("password authentication failed")
  ) {
    return "Postgres auth failed — check the user / password in DATABASE_URL.";
  }

  // Database doesn't exist
  if (
    m.includes("database") &&
    m.includes("does not exist on the database server")
  ) {
    return "Database doesn't exist. Create it, then run `bunx prisma migrate dev`.";
  }

  // Schema not applied
  if (
    m.includes("does not exist in the current database") ||
    (m.includes("relation") && m.includes("does not exist")) ||
    m.includes("p2021") ||
    m.includes("p2022")
  ) {
    return "Database schema not applied. Run `bunx prisma migrate dev`.";
  }

  // DATABASE_URL missing
  if (
    m.includes("environment variable not found: database_url") ||
    m.includes("database_url is not set")
  ) {
    return "DATABASE_URL is not set. Copy .env.example → .env.local and point it at Postgres.";
  }

  if (m.includes("prismaclientinitializationerror")) {
    return "Prisma can't initialise — verify DATABASE_URL and that migrations have been applied.";
  }

  // Generic Prisma invocation wrap — bubble up the next meaningful line.
  if (m.includes("invalid `") && m.includes("prisma")) {
    const reason = extractPrismaReason(raw);
    if (reason) return reason;
  }

  return null;
}

/** Pulls the human-readable reason out of a noisy Prisma error message. */
function extractPrismaReason(raw: string): string | null {
  // Prisma errors typically embed a line like:
  //   "Error occurred during query execution: ..."
  //   "... at the database server: ..."
  // We surface the last non-empty content line after the code excerpt.
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  // Prefer a line that looks like an explanation, not code.
  const explanation = lines
    .reverse()
    .find(
      (l) =>
        !l.startsWith("at ") &&
        !l.startsWith(">") &&
        !/^\d+\s+const\b/.test(l) &&
        !/^\d+\s+if\b/.test(l) &&
        !l.includes("invocation in") &&
        l.length < 220
    );
  return explanation ?? null;
}
