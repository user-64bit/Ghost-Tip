import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import type { HandleType } from "../../types/tip";

/** Lowercase, strip leading "@", trim. Case-insensitive per X's rules. */
export function normaliseHandle(raw: string): string {
  return raw.trim().replace(/^@+/, "").toLowerCase();
}

/** X handle rules: 1–15 chars, alphanumeric + underscore. */
const X_HANDLE_RE = /^[a-z0-9_]{1,15}$/;
const TG_HANDLE_RE = /^[a-z0-9_]{5,32}$/;

const RESERVED = new Set([
  "admin",
  "support",
  "help",
  "ghosttip",
  "loyal",
  "twitter",
  "system",
]);

export function validateHandle(
  type: HandleType,
  value: string
): { ok: true; value: string } | { ok: false; reason: string } {
  const v = normaliseHandle(value);
  if (!v) return { ok: false, reason: "Handle is required" };
  if (RESERVED.has(v)) return { ok: false, reason: "This handle is reserved" };

  if (type === "x") {
    if (!X_HANDLE_RE.test(v))
      return { ok: false, reason: "Invalid X handle format" };
  } else if (type === "telegram") {
    if (!TG_HANDLE_RE.test(v))
      return { ok: false, reason: "Invalid Telegram handle format" };
  }
  return { ok: true, value: v };
}

/**
 * Resolve a handle to an existing wallet mapping (if any).
 * Matches on normalised (lowercased, @-stripped) handle value.
 */
export async function resolveHandle(
  type: HandleType,
  rawValue: string
): Promise<string | null> {
  const v = normaliseHandle(rawValue);
  const row = await prisma.identityMap.findUnique({
    where: {
      handleType_handleValue: { handleType: type, handleValue: v },
    },
  });
  if (!row || row.revokedAt) return null;
  return row.walletAddress;
}

export async function upsertIdentityMap(args: {
  type: HandleType;
  value: string;
  walletAddress: string;
  method: "oauth_x" | "claim_link" | "manual";
}): Promise<void> {
  const v = normaliseHandle(args.value);
  await prisma.identityMap.upsert({
    where: {
      handleType_handleValue: { handleType: args.type, handleValue: v },
    },
    create: {
      handleType: args.type,
      handleValue: v,
      walletAddress: args.walletAddress,
      verifiedAt: new Date(),
      verificationMethod: args.method,
    },
    update: {
      walletAddress: args.walletAddress,
      verifiedAt: new Date(),
      verificationMethod: args.method,
      revokedAt: null,
    },
  });
}

export async function emitAuditEvent(args: {
  actor?: string | null;
  eventType: string;
  refId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const metadata = args.metadata
      ? (JSON.parse(JSON.stringify(args.metadata)) as Prisma.InputJsonValue)
      : undefined;
    await prisma.auditEvent.create({
      data: {
        actor: args.actor ?? null,
        eventType: args.eventType,
        refId: args.refId ?? null,
        metadataJson: metadata,
      },
    });
  } catch (err) {
    // Never let audit logging fail an operation.
    console.error("[audit] failed:", err);
  }
}
