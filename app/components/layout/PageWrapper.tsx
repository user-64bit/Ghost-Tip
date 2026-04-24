"use client";

import { motion } from "framer-motion";
import type { PropsWithChildren } from "react";
import Link from "next/link";
import { Header } from "./Header";
import { GhostTipGlyph } from "../ui/GhostTipLogo";
import { useCluster } from "../cluster-context";

export function PageWrapper({
  children,
  narrow = false,
}: PropsWithChildren<{ narrow?: boolean }>) {
  return (
    <div className="relative min-h-screen">
      <AmbientBackdrop />
      <Header />
      <motion.main
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
        className={`relative z-10 mx-auto w-full px-6 pb-16 ${
          narrow ? "max-w-lg" : "max-w-6xl"
        }`}
      >
        {children}
      </motion.main>
      <Footer />
    </div>
  );
}

function AmbientBackdrop() {
  return (
    <>
      <div className="pointer-events-none fixed inset-0 z-0 [mask-image:linear-gradient(to_bottom,black,transparent_80%)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_-10%,rgba(124,106,247,0.18),transparent_45%),radial-gradient(circle_at_110%_10%,rgba(78,205,196,0.08),transparent_55%)]" />
        <div
          className="absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
            backgroundSize: "64px 64px",
          }}
        />
      </div>
    </>
  );
}

function Footer() {
  const { cluster } = useCluster();
  const clusterLabel = {
    mainnet: "Mainnet",
    devnet: "Devnet",
    testnet: "Testnet",
    localnet: "Localnet",
  }[cluster];
  const clusterDot = {
    mainnet: "#4ECDC4",
    devnet: "#7C6AF7",
    testnet: "#F4B942",
    localnet: "#6B6B8A",
  }[cluster];
  return (
    <footer className="relative z-10 mt-16 border-t border-border/60">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[rgba(124,106,247,0.35)] to-transparent" />
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 pb-10 pt-8 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5">
            <GhostTipGlyph size={22} />
          </div>
          <div>
            <p className="font-display text-sm font-semibold tracking-tight text-foreground">
              GhostTip
            </p>
            <p className="mt-1 max-w-xs text-[11px] leading-relaxed text-muted">
              Privacy-first social tipping on Solana. Send by X handle — funds
              auto-refund if unclaimed, so money never sits unclaimed forever.
            </p>
          </div>
        </div>

        <div className="flex flex-col items-start gap-3 md:items-end">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
            <span
              aria-hidden
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: clusterDot }}
            />
            <span>{clusterLabel}</span>
            <span className="text-border-strong">·</span>
            <span className="text-subtle">Loyal rail</span>
          </div>
          <div className="flex items-center gap-4 text-[11px] uppercase tracking-[0.16em] text-subtle">
            <Link
              href="/"
              className="transition-colors hover:text-foreground"
            >
              Send
            </Link>
            <Link
              href="/profile"
              className="transition-colors hover:text-foreground"
            >
              History
            </Link>
            <a
              href="https://docs.askloyal.com"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-foreground"
            >
              Loyal ↗
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
