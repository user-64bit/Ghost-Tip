"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { motion, AnimatePresence } from "framer-motion";
import { PageWrapper } from "../components/layout/PageWrapper";
import { useWallet } from "../lib/wallet/context";
import { useTipStore } from "../store/tipStore";
import { useCluster } from "../components/cluster-context";
import { useMounted } from "../lib/hooks/use-mounted";
import { Badge, statusBadgeLabel, statusBadgeTone } from "../components/ui/Badge";
import { lamportsToSolString } from "../lib/lamports";
import { fetchJson } from "../lib/fetcher";
import type { Cluster, TipMode, TipStatus } from "../types/tip";

interface SentRow {
  id: string;
  senderWallet: string;
  cluster: Cluster;
  mode: TipMode;
  rail?: "native" | "loyal" | null;
  recipientHandleType: string;
  recipientHandleValue: string;
  amount: string;
  tokenSymbol?: string;
  tokenDecimals?: number;
  status: TipStatus;
  expiryAt: string;
  createdAt: string;
  claimedAt: string | null;
  refundedAt: string | null;
  cancelledAt: string | null;
}

interface ReceivedRow {
  id: string;
  cluster: Cluster;
  mode: TipMode;
  rail: "native" | "loyal" | null;
  senderWallet: string;
  senderHandle: { type: string; value: string } | null;
  recipientHandleValue: string;
  amount: string;
  tokenSymbol: string;
  tokenDecimals: number;
  status: TipStatus;
  createdAt: string;
  claimedAt: string | null;
  txSignature: string | null;
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

const sentFetcher = (url: string) => fetchJson<SentRow[]>(url);
const receivedFetcher = (url: string) => fetchJson<ReceivedRow[]>(url);

type Tab = "sent" | "received";

export default function ProfilePage() {
  const { wallet, status } = useWallet();
  const { cluster } = useCluster();
  const address = wallet?.account.address;
  const [tab, setTab] = useState<Tab>("sent");

  const sent = useSWR<SentRow[]>(
    address ? `/api/tips/history?wallet=${address}&cluster=${cluster}` : null,
    sentFetcher,
    { refreshInterval: 10_000 }
  );
  const received = useSWR<ReceivedRow[]>(
    address ? `/api/tips/received?wallet=${address}&cluster=${cluster}` : null,
    receivedFetcher,
    { refreshInterval: 10_000 }
  );

  // Reading the full tips array keeps the selector output reference-stable
  // across renders; filtering in a useMemo yields a new array only when the
  // underlying list or the active cluster changes. The previous inline
  // `s.tips.filter(...)` returned a fresh array on every getSnapshot call,
  // which Zustand's useSyncExternalStore flagged as an unstable snapshot
  // and which then ran React into "Maximum update depth exceeded".
  const mounted = useMounted();
  const allTips = useTipStore((s) => s.tips);
  const storedTips = useMemo(
    () =>
      mounted
        ? allTips.filter((t) => (t.cluster ?? cluster) === cluster)
        : [],
    [mounted, allTips, cluster]
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
          Activity on{" "}
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

      <TabBar
        value={tab}
        onChange={setTab}
        counts={{
          sent: sent.data?.length ?? storedTips.length,
          received: received.data?.length ?? 0,
        }}
      />

      {status !== "connected" ? (
        <div className="mt-4 rounded-2xl border border-border bg-surface p-8 text-center text-sm text-muted">
          Connect a wallet to see your tip history.
        </div>
      ) : tab === "sent" ? (
        <SentList
          cluster={cluster}
          data={sent.data}
          isLoading={sent.isLoading}
          error={sent.error as Error | undefined}
          storedTips={storedTips}
        />
      ) : (
        <ReceivedList
          cluster={cluster}
          data={received.data}
          isLoading={received.isLoading}
          error={received.error as Error | undefined}
        />
      )}
    </PageWrapper>
  );
}

function TabBar({
  value,
  onChange,
  counts,
}: {
  value: Tab;
  onChange: (t: Tab) => void;
  counts: { sent: number; received: number };
}) {
  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "sent", label: "Sent", count: counts.sent },
    { id: "received", label: "Received", count: counts.received },
  ];
  return (
    <div className="relative mb-5 inline-flex rounded-xl border border-border bg-surface p-1">
      {tabs.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={[
              "relative rounded-lg px-4 py-1.5 text-xs font-medium transition-colors",
              active ? "text-foreground" : "text-muted hover:text-foreground",
            ].join(" ")}
          >
            {active && (
              <motion.span
                layoutId="profile-tab-pill"
                className="absolute inset-0 rounded-lg bg-surface-raised"
                transition={{ type: "spring", stiffness: 500, damping: 36 }}
              />
            )}
            <span className="relative">
              {t.label}
              <span className="ml-1.5 text-[10px] text-subtle">{t.count}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function SentList({
  cluster,
  data,
  isLoading,
  error,
  storedTips,
}: {
  cluster: Cluster;
  data: SentRow[] | undefined;
  isLoading: boolean;
  error?: Error;
  storedTips: ReturnType<typeof useTipStore.getState>["tips"];
}) {
  if (isLoading) return <LoadingCard />;
  if (error && storedTips.length === 0) return <DbErrorCard error={error} />;

  if (data && data.length > 0) {
    return (
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div key="sent-rows" className="space-y-2">
          {data.map((t) => (
            <TipRow
              key={t.id}
              id={t.id}
              direction="out"
              handle={t.recipientHandleValue}
              amount={t.amount}
              tokenSymbol={t.tokenSymbol ?? "SOL"}
              tokenDecimals={t.tokenDecimals ?? 9}
              status={t.status}
              createdAt={t.createdAt}
              cluster={t.cluster ?? cluster}
              mode={t.mode}
              rail={t.rail ?? null}
            />
          ))}
        </motion.div>
      </AnimatePresence>
    );
  }
  if (storedTips.length > 0) {
    return (
      <div className="space-y-2">
        {storedTips.map((t) => (
          <TipRow
            key={t.tipIntentId}
            id={t.tipIntentId}
            direction="out"
            handle={t.recipientHandle}
            amount={t.amount}
            tokenSymbol={t.tokenSymbol ?? "SOL"}
            tokenDecimals={9}
            status={(t.status as TipStatus) ?? "CLAIMABLE"}
            createdAt={t.createdAt}
            cluster={t.cluster ?? cluster}
            mode={t.mode ?? "ESCROW_CLAIM"}
            rail={t.rail ?? null}
          />
        ))}
      </div>
    );
  }
  return (
    <EmptyState
      title={`No tips sent on ${CLUSTER_LABEL[cluster]} yet.`}
      body="Send your first one — it only takes 30 seconds."
    />
  );
}

function ReceivedList({
  cluster,
  data,
  isLoading,
  error,
}: {
  cluster: Cluster;
  data: ReceivedRow[] | undefined;
  isLoading: boolean;
  error?: Error;
}) {
  if (isLoading) return <LoadingCard />;
  if (error) return <DbErrorCard error={error} />;
  if (!data || data.length === 0) {
    return (
      <EmptyState
        title={`Nothing received on ${CLUSTER_LABEL[cluster]} yet.`}
        body="Once someone tips your handle and you claim it, it'll show up here — along with direct sends if your wallet is mapped to an X handle."
      />
    );
  }
  return (
    <div className="space-y-2">
      {data.map((r) => (
        <TipRow
          key={r.id}
          id={r.id}
          direction="in"
          handle={r.senderHandle?.value ?? "Anonymous"}
          amount={r.amount}
          tokenSymbol={r.tokenSymbol}
          tokenDecimals={r.tokenDecimals}
          status={r.status}
          createdAt={r.createdAt}
          cluster={r.cluster ?? cluster}
          mode={r.mode}
          rail={r.rail}
        />
      ))}
    </div>
  );
}

function LoadingCard() {
  return (
    <div className="rounded-2xl border border-border bg-surface p-8 text-sm text-muted">
      Loading…
    </div>
  );
}

function DbErrorCard({ error }: { error: Error }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-8">
      <p className="font-display text-lg">Couldn&apos;t load.</p>
      <p className="mt-2 text-sm text-danger">{error.message}</p>
      <p className="mt-3 text-xs text-muted">
        If this is a fresh clone, run{" "}
        <span className="font-mono">bunx prisma migrate dev</span> and make
        sure <span className="font-mono">DATABASE_URL</span> is set.
      </p>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-12 text-center">
      <p className="font-display text-lg">{title}</p>
      <p className="mt-1 text-sm text-muted">{body}</p>
      <Link
        href="/"
        className="mt-4 inline-flex rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Send a tip
      </Link>
    </div>
  );
}

function TipRow({
  id,
  direction,
  handle,
  amount,
  tokenSymbol,
  tokenDecimals,
  status,
  createdAt,
  cluster,
  mode,
  rail,
}: {
  id: string;
  direction: "in" | "out";
  handle: string;
  amount: string;
  tokenSymbol: string;
  tokenDecimals: number;
  status: TipStatus;
  createdAt: string;
  cluster: Cluster;
  mode: TipMode;
  rail: "native" | "loyal" | null;
}) {
  const display = (() => {
    if (tokenSymbol === "SOL" || tokenDecimals === 9) {
      try {
        return lamportsToSolString(BigInt(amount) as unknown as bigint, 4);
      } catch {
        return amount;
      }
    }
    try {
      const n = Number(amount) / 10 ** tokenDecimals;
      return n.toFixed(Math.min(tokenDecimals, 4));
    } catch {
      return amount;
    }
  })();

  return (
    <Link
      href={`/tip/${id}`}
      className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3 transition hover:border-border-strong"
    >
      <div className="flex items-center gap-4">
        <Badge tone={statusBadgeTone(status)}>{statusBadgeLabel(status)}</Badge>
        <div>
          <p className="text-sm font-medium">
            {direction === "in" ? "from " : "to "}
            <span className="font-mono">
              {handle === "Anonymous" ? "Anonymous" : `@${handle}`}
            </span>
          </p>
          <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-subtle">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: CLUSTER_DOT[cluster] }}
              aria-hidden
            />
            <span>{CLUSTER_LABEL[cluster]}</span>
            <span className="text-border-strong">·</span>
            <ModeChip mode={mode} rail={rail} />
            <span className="text-border-strong">·</span>
            <span>{new Date(createdAt).toLocaleString()}</span>
          </p>
        </div>
      </div>
      <p className="font-mono text-sm tabular-nums">
        <span className={direction === "in" ? "text-[#7BE3DB]" : ""}>
          {direction === "in" ? "+" : ""}
          {display}
        </span>{" "}
        <span className="text-xs text-muted">{tokenSymbol}</span>
      </p>
    </Link>
  );
}

function ModeChip({
  mode,
  rail,
}: {
  mode: TipMode;
  rail: "native" | "loyal" | null;
}) {
  if (mode === "ESCROW_CLAIM")
    return <span className="text-muted">claim link</span>;
  if (rail === "loyal")
    return <span className="text-[#7BE3DB]">private · Loyal</span>;
  return <span className="text-muted">direct</span>;
}
