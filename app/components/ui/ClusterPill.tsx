"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CLUSTERS, useCluster } from "../cluster-context";
import type { ClusterMoniker } from "../../lib/solana-client";

const DOT: Record<ClusterMoniker, string> = {
  mainnet: "#4ECDC4",
  devnet: "#7C6AF7",
  testnet: "#F4B942",
  localnet: "#6B6B8A",
};

const LABEL: Record<ClusterMoniker, string> = {
  mainnet: "Mainnet",
  devnet: "Devnet",
  testnet: "Testnet",
  localnet: "Localnet",
};

export function ClusterPill() {
  const { cluster, setCluster } = useCluster();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-11 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-xs font-medium uppercase tracking-[0.14em] text-muted transition hover:border-border-strong hover:text-foreground"
      >
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ backgroundColor: DOT[cluster] }}
        />
        {LABEL[cluster]}
        <svg
          viewBox="0 0 20 20"
          width="12"
          height="12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          className="opacity-70"
        >
          <path d="m5 8 5 5 5-5" />
        </svg>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full z-50 mt-2 w-44 rounded-xl border border-border bg-surface p-1.5 shadow-[0_20px_80px_-20px_rgba(0,0,0,0.9)]"
          >
            {CLUSTERS.map((c) => {
              const active = c === cluster;
              return (
                <button
                  key={c}
                  onClick={() => {
                    setCluster(c);
                    setOpen(false);
                  }}
                  className={[
                    "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition",
                    active
                      ? "bg-surface-raised text-foreground"
                      : "text-muted hover:bg-surface-raised hover:text-foreground",
                  ].join(" ")}
                >
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: DOT[c] }}
                  />
                  {LABEL[c]}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
