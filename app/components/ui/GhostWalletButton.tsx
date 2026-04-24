"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useWallet } from "../../lib/wallet/context";
import { useBalance } from "../../lib/hooks/use-balance";
import { lamportsToSolString } from "../../lib/lamports";
import { ellipsify } from "../../lib/explorer";
import { useCluster } from "../cluster-context";
import { Button } from "./Button";

export function GhostWalletButton({ compact = false }: { compact?: boolean }) {
  const { connectors, connect, disconnect, wallet, status, error } =
    useWallet();
  const { getExplorerUrl } = useCluster();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const address = wallet?.account.address;
  const balance = useBalance(address);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  if (status !== "connected") {
    return (
      <div ref={ref} className="relative">
        <Button
          size={compact ? "sm" : "md"}
          onClick={() => setOpen((v) => !v)}
          loading={status === "connecting"}
        >
          Connect wallet
        </Button>
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-border bg-surface p-3 shadow-[0_20px_80px_-20px_rgba(0,0,0,0.9)]"
            >
              <p className="mb-2 px-2 text-xs font-medium uppercase tracking-widest text-subtle">
                Choose a wallet
              </p>
              {connectors.length === 0 && (
                <p className="px-2 py-3 text-xs text-muted">
                  No Solana wallets detected. Install Phantom, Backpack or
                  Solflare.
                </p>
              )}
              <div className="space-y-1">
                {connectors.map((c) => (
                  <button
                    key={c.id}
                    onClick={async () => {
                      try {
                        await connect(c.id);
                        setOpen(false);
                      } catch {
                        /* surfaced via error state */
                      }
                    }}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition hover:bg-surface-raised"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {c.icon && (
                      <img src={c.icon} alt="" className="h-5 w-5 rounded" />
                    )}
                    {c.name}
                  </button>
                ))}
              </div>
              {error != null && (
                <p className="mt-2 px-2 text-xs text-danger">
                  {error instanceof Error ? error.message : String(error)}
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-11 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm font-medium transition hover:border-border-strong"
      >
        <span className="relative flex h-2 w-2">
          <span className="absolute inset-0 animate-ping rounded-full bg-[#4ECDC4] opacity-60" />
          <span className="relative inline-block h-2 w-2 rounded-full bg-[#4ECDC4]" />
        </span>
        <span className="font-mono text-xs">
          {address ? ellipsify(address, 4) : "—"}
        </span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full z-50 mt-2 w-80 rounded-xl border border-border bg-surface p-4 shadow-[0_20px_80px_-20px_rgba(0,0,0,0.9)]"
          >
            <p className="text-xs uppercase tracking-widest text-subtle">Balance</p>
            <p className="mt-1 font-mono text-2xl font-semibold tabular-nums">
              {balance.lamports != null
                ? lamportsToSolString(balance.lamports)
                : "—"}{" "}
              <span className="text-sm font-normal text-muted">SOL</span>
            </p>
            <div className="mt-3 rounded-lg border border-border bg-background px-3 py-2">
              <p className="break-all font-mono text-[11px] text-muted">
                {address}
              </p>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                onClick={async () => {
                  if (!address) return;
                  await navigator.clipboard.writeText(address);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1400);
                }}
                className="flex-1 rounded-lg border border-border bg-surface-raised px-3 py-2 text-xs font-medium transition hover:border-border-strong"
              >
                {copied ? "Copied" : "Copy"}
              </button>
              {address && (
                <a
                  href={getExplorerUrl(`/address/${address}`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 rounded-lg border border-border bg-surface-raised px-3 py-2 text-center text-xs font-medium transition hover:border-border-strong"
                >
                  Explorer
                </a>
              )}
            </div>
            <button
              onClick={() => {
                disconnect();
                setOpen(false);
              }}
              className="mt-2 w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-xs font-medium text-danger transition hover:border-[rgba(255,107,107,0.4)]"
            >
              Disconnect
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
