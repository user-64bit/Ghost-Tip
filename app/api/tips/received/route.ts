import { fail, handler, ok, serialise } from "../../../lib/server/api";
import { prisma } from "../../../lib/server/prisma";
import type { ClusterMoniker } from "../../../lib/solana-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_CLUSTERS: ClusterMoniker[] = [
  "mainnet",
  "devnet",
  "testnet",
  "localnet",
];

/**
 * GET /api/tips/received?wallet=<addr>&cluster=<mainnet|devnet|...>
 *
 * Two sources get merged:
 *   a) tips resolved directly to this wallet
 *      (DIRECT_SEND tips where resolvedRecipientWallet = wallet)
 *   b) tips claimed by this wallet through the claim-link path
 *      (ESCROW_CLAIM tips where claimLink.claimedByWallet = wallet)
 *
 * Cluster-filtered so mainnet and devnet don't mix.
 */
export const GET = handler(async (req) => {
  const url = new URL(req.url);
  const wallet = url.searchParams.get("wallet")?.trim();
  if (!wallet) return fail("INVALID_INPUT", "wallet query param required", 400);

  const clusterParam = url.searchParams.get("cluster")?.trim();
  const cluster =
    clusterParam && VALID_CLUSTERS.includes(clusterParam as ClusterMoniker)
      ? (clusterParam as ClusterMoniker)
      : null;

  const clusterFilter = cluster ? { cluster } : {};

  const [direct, claimed] = await Promise.all([
    prisma.tipIntent.findMany({
      where: {
        resolvedRecipientWallet: wallet,
        ...clusterFilter,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.tipIntent.findMany({
      where: {
        mode: "ESCROW_CLAIM",
        claimLink: { claimedByWallet: wallet },
        ...clusterFilter,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  // Merge + de-dupe by id (a tip can match both filters if something weird
  // happened; last-write-wins is fine since both sources are the same row).
  const merged = new Map<string, (typeof direct)[number]>();
  for (const t of [...direct, ...claimed]) merged.set(t.id, t);

  // Resolve sender handles through IdentityMap so the Received UI can show
  // "from @alice" instead of a bare wallet. One query per unique sender.
  const senders = Array.from(
    new Set(Array.from(merged.values()).map((t) => t.senderWallet))
  );
  const senderHandles = senders.length
    ? await prisma.identityMap.findMany({
        where: { walletAddress: { in: senders }, revokedAt: null },
      })
    : [];
  const handleBySender = new Map(
    senderHandles.map((h) => [
      h.walletAddress,
      { type: h.handleType, value: h.handleValue },
    ])
  );

  const rows = Array.from(merged.values())
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((t) => ({
      id: t.id,
      cluster: t.cluster,
      mode: t.mode,
      rail: t.rail,
      senderWallet: t.senderWallet,
      senderHandle: handleBySender.get(t.senderWallet) ?? null,
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
      txSignature: t.txSignature,
      claimTxSignature: t.claimTxSignature,
    }));

  return ok(serialise(rows));
});
