import { fail, handler, ok, serialise } from "../../../lib/server/api";
import { prisma } from "../../../lib/server/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handler(async (req) => {
  const url = new URL(req.url);
  const wallet = url.searchParams.get("wallet")?.trim();
  if (!wallet) return fail("INVALID_INPUT", "wallet query param required", 400);

  const tips = await prisma.tipIntent.findMany({
    where: { senderWallet: wallet },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return ok(
    serialise(
      tips.map((t) => ({
        id: t.id,
        senderWallet: t.senderWallet,
        recipientHandleType: t.recipientHandleType,
        recipientHandleValue: t.recipientHandleValue,
        amount: t.amount.toString(),
        tokenMint: t.tokenMint,
        memo: t.memo,
        status: t.status,
        expiryAt: t.expiryAt.toISOString(),
        createdAt: t.createdAt.toISOString(),
        claimedAt: t.claimedAt?.toISOString() ?? null,
        refundedAt: t.refundedAt?.toISOString() ?? null,
        cancelledAt: t.cancelledAt?.toISOString() ?? null,
        txSignature: t.txSignature,
      }))
    )
  );
});
