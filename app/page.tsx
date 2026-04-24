"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { PageWrapper } from "./components/layout/PageWrapper";
import { TipForm } from "./components/tip/TipForm";
import { useTipStore } from "./store/tipStore";
import { useCluster } from "./components/cluster-context";
import { Badge, statusBadgeLabel, statusBadgeTone } from "./components/ui/Badge";
import type { TipStatus } from "./types/tip";

export default function Home() {
  const { cluster } = useCluster();
  // Only surface the "last tip" shortcut when it belongs to the active
  // cluster — otherwise a mainnet user sees a devnet card (or vice versa).
  const lastTip = useTipStore((s) => {
    if (!s.lastTipId) return null;
    const tip = s.tips.find((t) => t.tipIntentId === s.lastTipId);
    if (!tip) return null;
    if ((tip.cluster ?? cluster) !== cluster) return null;
    return tip;
  });

  return (
    <PageWrapper narrow>
      <section className="pb-8 pt-4 text-center md:pb-12 md:pt-10">
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05, duration: 0.35 }}
          className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-muted"
        >
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#4ECDC4]" />
          private tips · solana · loyal rail
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.4 }}
          className="font-display text-5xl font-bold leading-[1.05] tracking-tight text-foreground md:text-6xl"
        >
          Tip anyone.
          <br />
          <span className="bg-gradient-to-r from-[#B6A9FF] via-[#7C6AF7] to-[#4ECDC4] bg-clip-text text-transparent">
            Stay ghost.
          </span>
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.4 }}
          className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-muted"
        >
          Send SOL by X handle. Your recipient claims by verifying with X —
          if they don&apos;t claim in time, you&apos;re auto-refunded. Never
          exchanged wallet addresses.
        </motion.p>
      </section>

      {lastTip && <LastTipCard tip={lastTip} />}

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.4 }}
      >
        <TipForm />
      </motion.div>
    </PageWrapper>
  );
}

function LastTipCard({
  tip,
}: {
  tip: NonNullable<ReturnType<typeof useTipStore.getState>["tips"]>[number];
}) {
  const status = (tip.status ?? "CLAIMABLE") as TipStatus;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mb-5"
    >
      <Link
        href={`/tip/${tip.tipIntentId}`}
        className="group flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3 transition hover:border-border-strong"
      >
        <div className="flex items-center gap-3">
          <Badge tone={statusBadgeTone(status)}>{statusBadgeLabel(status)}</Badge>
          <div>
            <p className="text-sm font-medium">
              Last tip to <span className="font-mono">@{tip.recipientHandle}</span>
            </p>
            <p className="text-xs text-muted">
              Tap to view status · claim link copyable
            </p>
          </div>
        </div>
        <span className="text-muted transition group-hover:translate-x-0.5 group-hover:text-foreground">
          →
        </span>
      </Link>
    </motion.div>
  );
}
