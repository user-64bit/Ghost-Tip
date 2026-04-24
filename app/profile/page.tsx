"use client";

import Link from "next/link";
import useSWR from "swr";
import { motion } from "framer-motion";
import { PageWrapper } from "../components/layout/PageWrapper";
import { useWallet } from "../lib/wallet/context";
import { useTipStore } from "../store/tipStore";
import { useCluster } from "../components/cluster-context";
import { Badge, statusBadgeLabel, statusBadgeTone } from "../components/ui/Badge";
import { lamportsToSolString } from "../lib/lamports";
import { fetchJson } from "../lib/fetcher";
import type { Cluster, TipStatus } from "../types/tip";

interface HistoryRow {
  id: string;
  senderWallet: string;
  cluster: Cluster;
  recipientHandleType: string;
  recipientHandleValue: string;
  amount: string;
  status: TipStatus;
  expiryAt: string;
  createdAt: string;
  claimedAt: string | null;
  refundedAt: string | null;
  cancelledAt: string | null;
}

const CLUSTER_LABEL: Record<Cluster, string> = {
  mainnet: "Mainnet",
  devnet: "Devnet",
  testnet: "Testnet",
  localnet: "Localnet",
};

const CLUSTER_DOT: Record<Cluster, string> = {
  mainnet: "#4ECDC4",
  devnet: "#7C6AF7",
  testnet: "#F4B942",
  localnet: "#6B6B8A",
};

const fetcher = (url: string) => fetchJson<HistoryRow[]>(url);

export default function ProfilePage() {
  const { wallet, status } = useWallet();
  const { cluster } = useCluster();
  const address = wallet?.account.address;
  const { data, error, isLoading } = useSWR<HistoryRow[]>(
    address
      ? `/api/tips/history?wallet=${address}&cluster=${cluster}`
      : null,
    fetcher,
    { refreshInterval: 10_000 }
  );
  // Older clients stored tips before the cluster field existed — treat
  // those as belonging to the current cluster so the migration is seamless.
  const storedTips = useTipStore((s) =>
    s.tips.filter((t) => (t.cluster ?? cluster) === cluster)
  );

  return (
    <PageWrapper>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mb-6"
      >
        <h1 className="font-display text-3xl font-semibold md:text-4xl">
          Your tips
        </h1>
        <p className="mt-1 text-sm text-muted">
          Tips you&apos;ve sent on{" "}
          <span className="inline-flex items-center gap-1.5 align-middle">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: CLUSTER_DOT[cluster] }}
            />
            <span className="font-medium text-foreground">
              {CLUSTER_LABEL[cluster]}
            </span>
          </span>
          . Switch clusters in the header to see others.
        </p>
      </motion.div>

      {status !== "connected" ? (
        <div className="rounded-2xl border border-border bg-surface p-8 text-center text-sm text-muted">
          Connect a wallet to see your tip history.
        </div>
      ) : isLoading ? (
        <div className="rounded-2xl border border-border bg-surface p-8 text-sm text-muted">
          Loading…
        </div>
      ) : error && storedTips.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-8">
          <p className="font-display text-lg">Couldn&apos;t load history.</p>
          <p className="mt-2 text-sm text-danger">
            {(error as Error).message}
          </p>
          <p className="mt-3 text-xs text-muted">
            If this is a fresh clone, make sure you&apos;ve run{" "}
            <span className="font-mono">bunx prisma migrate dev</span> and
            that <span className="font-mono">DATABASE_URL</span> points at a
            running Postgres.
          </p>
        </div>
      ) : data && data.length > 0 ? (
        <div className="space-y-2">
          {data.map((t) => (
            <TipRow
              key={t.id}
              id={t.id}
              handle={t.recipientHandleValue}
              amount={t.amount}
              status={t.status}
              createdAt={t.createdAt}
              cluster={t.cluster ?? cluster}
            />
          ))}
        </div>
      ) : storedTips.length > 0 ? (
        <div className="space-y-2">
          {storedTips.map((t) => (
            <TipRow
              key={t.tipIntentId}
              id={t.tipIntentId}
              handle={t.recipientHandle}
              amount={t.amount}
              status={(t.status as TipStatus) ?? "CLAIMABLE"}
              createdAt={t.createdAt}
              cluster={t.cluster ?? cluster}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-surface p-12 text-center">
          <p className="font-display text-lg">
            No tips on {CLUSTER_LABEL[cluster]} yet.
          </p>
          <p className="mt-1 text-sm text-muted">
            Send your first one — it only takes 30 seconds.
          </p>
          <Link
            href="/"
            className="mt-4 inline-flex rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Send a tip
          </Link>
        </div>
      )}
    </PageWrapper>
  );
}

function TipRow({
  id,
  handle,
  amount,
  status,
  createdAt,
  cluster,
}: {
  id: string;
  handle: string;
  amount: string;
  status: TipStatus;
  createdAt: string;
  cluster: Cluster;
}) {
  const sol = lamportsToSolString(BigInt(amount) as unknown as bigint);
  return (
    <Link
      href={`/tip/${id}`}
      className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3 transition hover:border-border-strong"
    >
      <div className="flex items-center gap-4">
        <Badge tone={statusBadgeTone(status)}>{statusBadgeLabel(status)}</Badge>
        <div>
          <p className="text-sm font-medium">
            @<span className="font-mono">{handle}</span>
          </p>
          <p className="flex items-center gap-1.5 text-[11px] text-subtle">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: CLUSTER_DOT[cluster] }}
              aria-hidden
            />
            <span>{CLUSTER_LABEL[cluster]}</span>
            <span className="text-border-strong">·</span>
            <span>{new Date(createdAt).toLocaleString()}</span>
          </p>
        </div>
      </div>
      <p className="font-mono text-sm tabular-nums">
        {sol} <span className="text-xs text-muted">SOL</span>
      </p>
    </Link>
  );
}
