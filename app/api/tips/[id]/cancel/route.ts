import { fail, handler, ok } from "../../../../lib/server/api";
import { prisma } from "../../../../lib/server/prisma";
import { emitAuditEvent } from "../../../../lib/server/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sender-driven cancel. The Anchor program gates this so only the sender
 * can sign. The client submits the cancel_tip instruction directly, then
 * calls this endpoint with the on-chain signature so we can update DB
 * state. (Authority isn't involved — sender signs their own cancel.)
 */
export const POST = handler(
  async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  let body: { txSignature?: string; senderWallet?: string };
  try {
    body = (await req.json()) as { txSignature?: string; senderWallet?: string };
  } catch {
    return fail("INVALID_INPUT", "Body must be JSON", 400);
  }

  const tip = await prisma.tipIntent.findUnique({ where: { id } });
  if (!tip) return fail("TIP_NOT_FOUND", undefined, 404);
  if (tip.status !== "CLAIMABLE")
    return fail("TIP_INVALID_STATE", "Tip is not cancellable", 409);
  if (body.senderWallet && body.senderWallet !== tip.senderWallet)
    return fail("UNAUTHORIZED", "Only the sender can cancel", 403);

  const cancelled = await prisma.tipIntent.update({
    where: { id, status: "CLAIMABLE" },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      refundTxSignature: body.txSignature ?? null,
    },
  });

  await prisma.claimLink.updateMany({
    where: { tipIntent: { id } },
    data: { revokedAt: new Date() },
  });

  await emitAuditEvent({
    actor: tip.senderWallet,
    eventType: "tip_cancelled",
    refId: tip.id,
    metadata: { txSignature: body.txSignature },
  });

    return ok({ status: cancelled.status });
  }
);
