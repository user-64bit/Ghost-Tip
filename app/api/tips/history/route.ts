import { fail, handler, ok, serialise } from "../../../lib/server/api";
import { prisma } from "../../../lib/server/prisma";
import type { Cluster } from "../../../types/tip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_CLUSTERS: Cluster[] = ["devnet", "testnet", "mainnet", "localnet"];

export const GET = handler(async (req) => {
  const url = new URL(req.url);
  const wallet = url.searchParams.get("wallet")?.trim();
  if (!wallet) return fail("INVALID_INPUT", "wallet query param required", 400);

  // Optional cluster filter — the profile page passes the active cluster
  // so senders only see history scoped to the network they're currently on.
  const clusterParam = url.searchParams.get("cluster")?.trim();
  const cluster =
    clusterParam && VALID_CLUSTERS.includes(clusterParam as Cluster)
      ? (clusterParam as Cluster)
      : undefined;

  const tips = await prisma.tipIntent.findMany({
    where: {
      senderWallet: wallet,
      ...(cluster ? { cluster } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return ok(
    serialise(
      tips.map((t) => ({
        id: t.id,
        senderWallet: t.senderWallet,
        cluster: t.cluster,
        mode: t.mode,
        rail: t.rail,
        recipientHandleType: t.recipientHandleType,
        recipientHandleValue: t.recipientHandleValue,
        resolvedRecipientWallet: t.resolvedRecipientWallet,
        amount: t.amount.toString(),
        tokenMint: t.tokenMint,
        tokenSymbol: t.tokenSymbol,
        tokenDecimals: t.tokenDecimals,
        memo: t.memo,
        status: t.status,
        expiryAt: t.expiryAt.toISOString(),
        createdAt: t.createdAt.toISOString(),
        claimedAt: t.claimedAt?.toISOString() ?? null,
        refundedAt: t.refundedAt?.toISOString() ?? null,
        cancelledAt: t.cancelledAt?.toISOString() ?? null,
        txSignature: t.txSignature,
        claimTxSignature: t.claimTxSignature,
      }))
    )
  );
});
