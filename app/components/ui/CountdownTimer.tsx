"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

function diff(target: number): {
  expired: boolean;
  d: number;
  h: number;
  m: number;
  s: number;
  totalMs: number;
} {
  const delta = target - Date.now();
  if (delta <= 0)
    return { expired: true, d: 0, h: 0, m: 0, s: 0, totalMs: 0 };
  const s = Math.floor(delta / 1000) % 60;
  const m = Math.floor(delta / 60000) % 60;
  const h = Math.floor(delta / 3600000) % 24;
  const d = Math.floor(delta / 86400000);
  return { expired: false, d, h, m, s, totalMs: delta };
}

export interface CountdownTimerProps {
  expiryAt: string | Date;
  compact?: boolean;
  onExpire?: () => void;
}

export function CountdownTimer({
  expiryAt,
  compact = false,
  onExpire,
}: CountdownTimerProps) {
  const target = useMemo(() => new Date(expiryAt).getTime(), [expiryAt]);
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const state = useMemo(() => diff(target), [target, now]);

  useEffect(() => {
    if (state.expired && onExpire) onExpire();
  }, [state.expired, onExpire]);

  const tone =
    state.totalMs < 60 * 60 * 1000
      ? "danger"
      : state.totalMs < 24 * 60 * 60 * 1000
        ? "warning"
        : "primary";

  const toneClasses: Record<string, string> = {
    primary: "text-foreground",
    warning: "text-[#F4B942]",
    danger: "text-[#FF8E8E]",
  };

  if (state.expired) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className={`font-display ${compact ? "text-sm" : "text-lg"} text-muted`}
      >
        Expired
      </motion.div>
    );
  }

  if (compact) {
    return (
      <span
        className={`font-mono text-xs tabular-nums ${toneClasses[tone]}`}
        aria-label="Time remaining"
      >
        {state.d > 0 ? `${state.d}d ` : ""}
        {pad(state.h)}:{pad(state.m)}:{pad(state.s)}
      </span>
    );
  }

  return (
    <div
      className="flex items-baseline gap-3 font-mono tabular-nums"
      aria-label="Time remaining"
    >
      {state.d > 0 && <Unit value={state.d} label="d" tone={tone} />}
      <Unit value={state.h} label="h" tone={tone} />
      <Unit value={state.m} label="m" tone={tone} />
      <Unit value={state.s} label="s" tone={tone} />
    </div>
  );
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function Unit({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone: "primary" | "warning" | "danger";
}) {
  const toneClass =
    tone === "danger"
      ? "text-[#FF8E8E]"
      : tone === "warning"
        ? "text-[#F4B942]"
        : "text-foreground";
  return (
    <div className="flex items-baseline gap-1">
      <span
        className="relative inline-block min-w-[2ch] overflow-hidden"
        style={{ perspective: "400px" }}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={value}
            initial={{ rotateX: -90, opacity: 0 }}
            animate={{ rotateX: 0, opacity: 1 }}
            exit={{ rotateX: 90, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            className={`inline-block text-3xl font-semibold ${toneClass}`}
            style={{ transformStyle: "preserve-3d" }}
          >
            {pad(value)}
          </motion.span>
        </AnimatePresence>
      </span>
      <span className="text-xs uppercase tracking-widest text-subtle">
        {label}
      </span>
    </div>
  );
}
