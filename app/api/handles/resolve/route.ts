import { fail, handler, ok } from "../../../lib/server/api";
import { prisma } from "../../../lib/server/prisma";
import { normaliseHandle } from "../../../lib/server/identity";
import type { HandleType } from "../../../types/tip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/handles/resolve?type=x&value=elonmusk
 *   → { warm: true,  wallet: "...", verifiedAt: "..." }
 *   → { warm: false }
 *
 * The TipForm polls this as the user types a handle. A warm result makes
 * the send switch to the direct / private rail; a cold result falls back
 * to the claim-link escrow flow.
 *
 * Returns 200 in both cases — "not warm" isn't an error. Only real failures
 * (bad input, DB down) return !success.
 */
export const GET = handler(async (req) => {
  const url = new URL(req.url);
  const type = (url.searchParams.get("type") ?? "x") as HandleType;
  const rawValue = url.searchParams.get("value")?.trim();
  if (!rawValue) return fail("INVALID_INPUT", "value required", 400);

  const value = normaliseHandle(rawValue);
  if (!value) return fail("INVALID_INPUT", "value required", 400);

  const row = await prisma.identityMap.findUnique({
    where: { handleType_handleValue: { handleType: type, handleValue: value } },
  });

  if (!row || row.revokedAt) {
    return ok({ warm: false as const, handle: value, handleType: type });
  }

  return ok({
    warm: true as const,
    handle: value,
    handleType: type,
    wallet: row.walletAddress,
    verifiedAt: row.verifiedAt.toISOString(),
    method: row.verificationMethod,
  });
});
