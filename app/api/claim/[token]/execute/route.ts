import type { Address } from "@solana/kit";
import { fail, handler, ok } from "../../../../lib/server/api";
import { redis } from "../../../../lib/server/redis";
import { prisma } from "../../../../lib/server/prisma";
import { hashClaimToken, tipIdFromHex } from "../../../../lib/server/crypto";
import {
  claimChallengeMessage,
  verifyWalletSignature,
} from "../../../../lib/server/verify-signature";
import {
  deriveTipEscrowPda,
  submitClaimOnChain,
} from "../../../../lib/server/anchor";
import {
  emitAuditEvent,
  upsertIdentityMap,
} from "../../../../lib/server/identity";
import { loyal } from "../../../../lib/loyal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handler(
  async (req, { params }: { params: Promise<{ token: string }> }) => {
  const { token } = await params;
  let body: {
    session?: string;
    recipientWallet?: string;
    walletSignature?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return fail("INVALID_INPUT", undefined, 400);
  }
  const session = String(body.session ?? "");
  const recipientWallet = String(body.recipientWallet ?? "");
  const walletSignature = String(body.walletSignature ?? "");
  if (!session || !recipientWallet || !walletSignature)
    return fail("INVALID_INPUT", undefined, 400);

  const sessRaw = await redis.get(`claim_session:${session}`);
  if (!sessRaw) return fail("CLAIM_SESSION_INVALID", undefined, 410);
  let sess: { token: string; verifiedHandle: string };
  try {
    sess = JSON.parse(sessRaw);
  } catch {
    return fail("CLAIM_SESSION_INVALID", undefined, 410);
  }
  if (sess.token !== token) return fail("CLAIM_SESSION_INVALID", undefined, 403);

  const hash = hashClaimToken(token);
  const claim = await prisma.claimLink.findUnique({
    where: { secretTokenHash: hash },
    include: { tipIntent: true },
  });
  if (!claim?.tipIntent) return fail("CLAIM_TOKEN_INVALID", undefined, 404);

  const tip = claim.tipIntent;
  if (tip.status !== "CLAIMABLE") {
    if (tip.status === "CLAIMED")
      return fail("TIP_ALREADY_CLAIMED", undefined, 410);
    if (tip.status === "CANCELLED")
      return fail("TIP_CANCELLED", undefined, 410);
    return fail("TIP_INVALID_STATE", undefined, 409);
  }
  if (tip.expiryAt.getTime() < Date.now())
    return fail("TIP_EXPIRED", undefined, 410);

  // Verify wallet signature over the canonical challenge.
  const challenge = claimChallengeMessage({
    tipIntentId: tip.id,
    claimToken: token,
    recipientWallet,
  });
  const sigOk = verifyWalletSignature({
    message: challenge,
    signatureBase58: walletSignature,
    publicKeyBase58: recipientWallet,
  });
  if (!sigOk) return fail("WALLET_SIGNATURE_INVALID", undefined, 400);

  // Atomic claim — race-safe against concurrent requests.
  const atomic = await prisma.claimLink.updateMany({
    where: { id: claim.id, claimedAt: null, revokedAt: null },
    data: {
      claimedAt: new Date(),
      claimedByWallet: recipientWallet,
    },
  });
  if (atomic.count === 0)
    return fail("TIP_ALREADY_CLAIMED", undefined, 410);

  // Execute the on-chain claim.
  const tipIdBytes = tipIdFromHex(tip.tipIdBytes);
  const { pda: escrowPda } = await deriveTipEscrowPda(tipIdBytes);

  let txSignature: string;
  try {
    const result = await submitClaimOnChain({
      tipIdBytes,
      recipient: recipientWallet as Address,
      escrowPda,
    });
    txSignature = result.txSignature;
  } catch (err) {
    // Roll back the claim flag so the recipient can retry.
    await prisma.claimLink.updateMany({
      where: { id: claim.id },
      data: { claimedAt: null, claimedByWallet: null },
    });
    console.error("claim_tip on-chain failed", err);
    return fail(
      "PROGRAM_ERROR",
      "The on-chain claim failed. Please try again.",
      502
    );
  }

  // Mirror the settlement through the Loyal mock for parity with the send path.
  void loyal.privateSend(
    {
      sender: tip.senderWallet as Address,
      recipientHint: recipientWallet,
      amountLamports: BigInt(tip.amount.toString()),
      tokenMint: tip.tokenMint,
    },
    { txSignatureHint: txSignature }
  );

  // Update DB + identity map.
  await prisma.tipIntent.update({
    where: { id: tip.id },
    data: {
      status: "CLAIMED",
      claimedAt: new Date(),
      claimTxSignature: txSignature,
      resolvedRecipientWallet: recipientWallet,
    },
  });

  await upsertIdentityMap({
    type: "x",
    value: claim.intendedHandleValue,
    walletAddress: recipientWallet,
    method: "oauth_x",
  });

  await emitAuditEvent({
    actor: recipientWallet,
    eventType: "tip_claimed",
    refId: tip.id,
    metadata: { txSignature, handle: claim.intendedHandleValue },
  });

  // Invalidate the session now that the tip is claimed.
  await redis.del(`claim_session:${session}`);

    return ok({
      success: true,
      txSignature,
      amount: tip.amount.toString(),
      tokenMint: tip.tokenMint,
    });
  }
);
