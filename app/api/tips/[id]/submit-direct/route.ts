import { fail, handler, ok } from "../../../../lib/server/api";
import { prisma } from "../../../../lib/server/prisma";
import { emitAuditEvent } from "../../../../lib/server/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/tips/[id]/submit-direct
 *
 * Called after the sender's wallet has signed + sent the direct-send
 * transaction(s). Accepts the final on-chain signature (or the last one
 * in the case of multi-step Loyal shield dances) and flips the tip to
 * CLAIMED — direct sends have no claim step, the recipient's username
 * deposit already holds the funds (for rail=loyal) or the recipient
 * wallet already received them (for rail=native).
 *
 * Body:
 *   { txSignature: string, usernameDepositPda?: string }
 */
export const POST = handler(
  async (req, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    let body: { txSignature?: string; usernameDepositPda?: string };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return fail("INVALID_INPUT", "Body must be JSON", 400);
    }
    const txSignature = String(body.txSignature ?? "").trim();
    if (txSignature.length < 20)
      return fail("INVALID_INPUT", "Missing tx signature", 400);

    const tip = await prisma.tipIntent.findUnique({ where: { id } });
    if (!tip) return fail("TIP_NOT_FOUND", undefined, 404);
    if (tip.mode !== "DIRECT_SEND")
      return fail(
        "TIP_INVALID_STATE",
        "Use /submit for escrow tips",
        409
      );
    if (tip.status !== "DRAFT" && tip.status !== "PENDING")
      return fail("TIP_INVALID_STATE", undefined, 409);

    const updated = await prisma.tipIntent.update({
      where: { id },
      data: {
        status: "CLAIMED",
        txSignature,
        claimTxSignature: txSignature,
        claimedAt: new Date(),
        usernameDepositPda: body.usernameDepositPda ?? null,
      },
    });

    await emitAuditEvent({
      actor: tip.senderWallet,
      eventType: "direct_send_confirmed",
      refId: tip.id,
      metadata: {
        rail: tip.rail,
        txSignature,
        usernameDepositPda: body.usernameDepositPda ?? null,
      },
    });

    return ok({
      status: updated.status,
      rail: updated.rail,
      txSignature,
    });
  }
);
