import { fail, handler, ok } from "../../../../lib/server/api";
import { prisma } from "../../../../lib/server/prisma";
import { emitAuditEvent } from "../../../../lib/server/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Called after the sender signs the deposit_tip instruction on the client
 * and the tx confirms. Flips DRAFT → CLAIMABLE and records the on-chain
 * signature. For ESCROW_CLAIM tips only — DIRECT_SEND tips use
 * /submit-direct.
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
  if (tip.mode !== "ESCROW_CLAIM")
    return fail(
      "TIP_INVALID_STATE",
      "DIRECT_SEND tips use /submit-direct",
      409
    );
  if (tip.status !== "DRAFT" && tip.status !== "PENDING")
    return fail("TIP_INVALID_STATE", undefined, 409);

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
