import { fail, handler, ok } from "../../../../lib/server/api";
import { redis } from "../../../../lib/server/redis";
import { prisma } from "../../../../lib/server/prisma";
import { hashClaimToken } from "../../../../lib/server/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Poll endpoint the claim page uses to check whether a session from the
 * OAuth callback is valid. Also exposes the unlocked memo after success.
 */
export const POST = handler(
  async (req, { params }: { params: Promise<{ token: string }> }) => {
  const { token } = await params;
  let body: { session?: string };
  try {
    body = (await req.json()) as { session?: string };
  } catch {
    return fail("INVALID_INPUT", undefined, 400);
  }
  const session = String(body.session ?? "");
  if (!session) return fail("CLAIM_SESSION_INVALID", undefined, 400);

  const raw = await redis.get(`claim_session:${session}`);
  if (!raw) return fail("CLAIM_SESSION_INVALID", undefined, 410);

  let parsed: { token: string; verifiedHandle: string; verifiedAt: string };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fail("CLAIM_SESSION_INVALID", undefined, 410);
  }
  if (parsed.token !== token)
    return fail("CLAIM_SESSION_INVALID", undefined, 403);

  const hash = hashClaimToken(token);
  const claim = await prisma.claimLink.findUnique({
    where: { secretTokenHash: hash },
    include: { tipIntent: true },
  });
  if (!claim?.tipIntent) return fail("CLAIM_TOKEN_INVALID", undefined, 404);

  const tip = claim.tipIntent;
  return ok({
    verifiedHandle: parsed.verifiedHandle,
    verifiedAt: parsed.verifiedAt,
    memo: tip.memo,
    amount: tip.amount.toString(),
    tokenMint: tip.tokenMint,
    expiryAt: tip.expiryAt.toISOString(),
    tipIntentId: tip.id,
    claimChallenge: `ghosttip-claim:${tip.id}:${token}`,
  });
  }
);
