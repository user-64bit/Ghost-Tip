import { fail, handler, ok, serialise } from "../../../lib/server/api";
import { prisma } from "../../../lib/server/prisma";
import type { TipIntent as TipIntentResponse } from "../../../types/tip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handler(
  async (_req, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
  const tip = await prisma.tipIntent.findUnique({
    where: { id },
    include: { claimLink: true },
  });
  if (!tip) return fail("TIP_NOT_FOUND", undefined, 404);

  // Opportunistic state transition — if DB says CLAIMABLE but expiry has
  // already passed, the expiry cron will refund; surface an EXPIRED read.
  let status = tip.status;
  if (status === "CLAIMABLE" && tip.expiryAt.getTime() < Date.now()) {
    status = "EXPIRED";
  }

  const body: TipIntentResponse = serialise({
    id: tip.id,
    senderWallet: tip.senderWallet,
    cluster: tip.cluster,
    recipientHandleType: tip.recipientHandleType,
    recipientHandleValue: tip.recipientHandleValue,
    resolvedRecipientWallet: tip.resolvedRecipientWallet,
    amount: tip.amount.toString(),
    tokenMint: tip.tokenMint,
    memo: tip.memo,
    status,
    expiryAt: tip.expiryAt.toISOString(),
    createdAt: tip.createdAt.toISOString(),
    updatedAt: tip.updatedAt.toISOString(),
    claimLinkId: tip.claimLinkId,
    txSignature: tip.txSignature,
    refundTxSignature: tip.refundTxSignature,
    claimTxSignature: tip.claimTxSignature,
    claimedAt: tip.claimedAt?.toISOString() ?? null,
    refundedAt: tip.refundedAt?.toISOString() ?? null,
    cancelledAt: tip.cancelledAt?.toISOString() ?? null,
    tipEscrowPda: tip.tipEscrowPda,
    tipIdBytes: tip.tipIdBytes,
    errorCode: tip.errorCode,
    errorMessage: tip.errorMessage,
  } as unknown as TipIntentResponse);

    return ok(body);
  }
);
