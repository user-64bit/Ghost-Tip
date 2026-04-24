"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { motion } from "framer-motion";
import { PageWrapper } from "../../components/layout/PageWrapper";
import { TipStatusCard } from "../../components/tip/TipStatusCard";
import { useTipStore } from "../../store/tipStore";
import { useWallet } from "../../lib/wallet/context";
import { fetchJson } from "../../lib/fetcher";
import type { TipIntent } from "../../types/tip";

const fetcher = (url: string) => fetchJson<TipIntent>(url);

export default function TipStatusPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { wallet } = useWallet();
  const stored = useTipStore((s) =>
    id ? s.tips.find((t) => t.tipIntentId === id) : undefined
  );
  const updateTip = useTipStore((s) => s.updateTip);

  const { data: tip, error, isLoading, mutate } = useSWR(
    id ? `/api/tips/${id}` : null,
    fetcher,
    { refreshInterval: 4000 }
  );

  useEffect(() => {
    if (tip && stored && tip.status !== stored.status) {
      updateTip(tip.id, { status: tip.status });
    }
  }, [tip, stored, updateTip]);

  const isOwner =
    !!tip && !!wallet?.account.address && wallet.account.address === tip.senderWallet;

  return (
    <PageWrapper narrow>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mb-4"
      >
        <p className="text-xs uppercase tracking-[0.24em] text-subtle">
          Tip status
        </p>
      </motion.div>

      {isLoading && !tip && <Skeleton />}
      {error && (
        <div className="rounded-2xl border border-border bg-surface p-6 text-sm text-danger">
          {(error as Error).message}
        </div>
      )}

      {tip && (
        <TipStatusCard
          tip={tip}
          claimLink={stored?.claimLink ?? null}
          isOwner={isOwner}
          onUpdated={() => mutate()}
        />
      )}
    </PageWrapper>
  );
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-3 rounded-2xl border border-border bg-surface p-6">
      <div className="h-3 w-24 rounded bg-surface-raised" />
      <div className="h-12 w-48 rounded bg-surface-raised" />
      <div className="h-10 w-full rounded bg-surface-raised" />
      <div className="h-20 w-full rounded bg-surface-raised" />
    </div>
  );
}
