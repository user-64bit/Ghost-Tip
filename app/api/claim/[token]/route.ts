import { fail, handler, ok } from "../../../lib/server/api";
import { prisma } from "../../../lib/server/prisma";
import { hashClaimToken } from "../../../lib/server/crypto";
import { emitAuditEvent } from "../../../lib/server/identity";
import type { TipPreview } from "../../../types/tip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Validate a claim token and return a tip preview.
 * The memo is NOT returned here — it's revealed after OAuth verification.
 */
export const GET = handler(
  async (_req, { params }: { params: Promise<{ token: string }> }) => {
  const { token } = await params;
  if (!/^[a-f0-9]{64}$/i.test(token))
    return fail("CLAIM_TOKEN_INVALID", undefined, 400);

  const hash = hashClaimToken(token);
  const claim = await prisma.claimLink.findUnique({
    where: { secretTokenHash: hash },
    include: { tipIntent: true },
  });
  if (!claim || !claim.tipIntent)
    return fail("CLAIM_TOKEN_INVALID", undefined, 404);
  if (claim.revokedAt)
    return fail("CLAIM_TOKEN_INVALID", "This link was revoked", 410);

  const tip = claim.tipIntent;
  const now = Date.now();

  if (claim.claimedAt || tip.status === "CLAIMED")
    return fail("TIP_ALREADY_CLAIMED", undefined, 410);
  if (tip.status === "CANCELLED")
    return fail("TIP_CANCELLED", undefined, 410);
  if (
    tip.status === "EXPIRED" ||
    tip.status === "REFUNDED" ||
    claim.expiresAt.getTime() < now
  )
    return fail("TIP_EXPIRED", undefined, 410);

  await emitAuditEvent({
    actor: `anon`,
    eventType: "claim_opened",
    refId: tip.id,
  });

  const preview: TipPreview = {
    amount: tip.amount.toString(),
    tokenMint: tip.tokenMint,
    tokenSymbol: tokenSymbolFor(tip.tokenMint),
    // We don't leak the memo text — just signal whether one exists so the
    // UI can render the locked affordance. The client renders its own
    // placeholder now (prior version returned an emoji string here which
    // leaked into screenshots).
    memo: tip.memo ? "__LOCKED__" : null,
    expiryAt: tip.expiryAt.toISOString(),
    intendedHandle: claim.intendedHandleValue,
    handleType: claim.intendedHandleType as TipPreview["handleType"],
    status: tip.status as TipPreview["status"],
  };

    return ok(preview);
  }
);

function tokenSymbolFor(mint: string): string {
  if (mint === "So11111111111111111111111111111111111111112") return "SOL";
  return "TOKEN";
}
