import { fail, handler, ok } from "../../../../lib/server/api";
import { prisma } from "../../../../lib/server/prisma";
import { emitAuditEvent } from "../../../../lib/server/identity";
import { loyal } from "../../../../lib/loyal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Called after the sender signs the deposit_tip instruction on the client
 * and the tx confirms. We mark the tip CLAIMABLE and run the deposit
 * through the Loyal "private rail" wrapper — in mock mode this just echoes
 * the tx signature back with added privacy metadata.
 */
export const POST = handler(
  async (req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  let body: { txSignature?: string };
  try {
    body = (await req.json()) as { txSignature?: string };
  } catch {
    return fail("INVALID_INPUT", "Body must be JSON", 400);
  }
  const txSignature = String(body.txSignature ?? "").trim();
  if (txSignature.length < 20)
    return fail("INVALID_INPUT", "Missing tx signature", 400);

  const tip = await prisma.tipIntent.findUnique({ where: { id } });
  if (!tip) return fail("TIP_NOT_FOUND", undefined, 404);
  if (tip.status !== "DRAFT" && tip.status !== "PENDING")
    return fail("TIP_INVALID_STATE", undefined, 409);

  // Wrap the deposit through the Loyal mock so the flow is demonstrable.
  // Real Loyal SDK: this is where we'd call `loyal.privateSend()` BEFORE the
  // client submits, and the rail would perform its own settlement.
  void loyal.privateSend(
    {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sender: tip.senderWallet as any,
      recipientHint: `${tip.recipientHandleType}:${tip.recipientHandleValue}`,
      amountLamports: BigInt(tip.amount.toString()),
      tokenMint: tip.tokenMint,
      settlementInstruction: {
        programId: process.env.NEXT_PUBLIC_PROGRAM_ID ?? "",
        escrowPda: tip.tipEscrowPda ?? "",
        tipIdHex: tip.tipIdBytes,
      },
    },
    { txSignatureHint: txSignature }
  );

  const updated = await prisma.tipIntent.update({
    where: { id },
    data: {
      status: "CLAIMABLE",
      txSignature,
    },
  });

  await emitAuditEvent({
    actor: tip.senderWallet,
    eventType: "deposit_confirmed",
    refId: tip.id,
    metadata: { txSignature },
  });

    return ok({
      status: updated.status,
      txSignature,
      message: "Tip escrowed. Claim link is live.",
    });
  }
);
