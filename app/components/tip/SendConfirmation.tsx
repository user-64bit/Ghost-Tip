"use client";

/**
 * Premium reveal screen shown after a successful send.
 *
 * Replaces the old "toast + router.push" pattern which skipped the emotional
 * peak of the flow. The sender sees: a ghost animation, the confirmed amount,
 * the claim link (for escrow) or a "sent privately" confirmation (for direct
 * sends), and share / copy / view-status CTAs.
 */

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { useMemo } from "react";
import { CopyButton } from "../ui/CopyButton";
import { CountdownTimer } from "../ui/CountdownTimer";
import { GhostTipGlyph } from "../ui/GhostTipLogo";
import { lamportsToSolString } from "../../lib/lamports";
import type {
  CreateTipResponse,
  DirectSendCreateTipResponse,
  EscrowCreateTipResponse,
} from "../../types/tip";

export interface SendConfirmationProps {
  tip: CreateTipResponse;
  recipientHandle: string;
  tokenSymbol: string;
  tokenDecimals: number;
  amountRaw: string;
  onSendAnother: () => void;
}

function amountDisplay(
  amountRaw: string,
  tokenSymbol: string,
  tokenDecimals: number
): string {
  try {
    if (tokenSymbol === "SOL" || tokenDecimals === 9) {
      return lamportsToSolString(BigInt(amountRaw) as unknown as bigint, 4);
    }
    return (Number(amountRaw) / 10 ** tokenDecimals).toFixed(
      Math.min(tokenDecimals, 4)
    );
  } catch {
    return amountRaw;
  }
}

export function SendConfirmation({
  tip,
  recipientHandle,
  tokenSymbol,
  tokenDecimals,
  amountRaw,
  onSendAnother,
}: SendConfirmationProps) {
  const amount = useMemo(
    () => amountDisplay(amountRaw, tokenSymbol, tokenDecimals),
    [amountRaw, tokenSymbol, tokenDecimals]
  );

  if (tip.mode === "ESCROW_CLAIM") {
    return (
      <EscrowConfirmation
        tip={tip}
        amount={amount}
        tokenSymbol={tokenSymbol}
        recipientHandle={recipientHandle}
        onSendAnother={onSendAnother}
      />
    );
  }
  return (
    <DirectConfirmation
      tip={tip}
      amount={amount}
      tokenSymbol={tokenSymbol}
      recipientHandle={recipientHandle}
      onSendAnother={onSendAnother}
    />
  );
}

/* -------------------------------------------------------------------------- */
/*                               ESCROW reveal                                */
/* -------------------------------------------------------------------------- */

function EscrowConfirmation({
  tip,
  amount,
  tokenSymbol,
  recipientHandle,
  onSendAnother,
}: {
  tip: EscrowCreateTipResponse;
  amount: string;
  tokenSymbol: string;
  recipientHandle: string;
  onSendAnother: () => void;
}) {
  const shareText = useMemo(
    () =>
      `Hey @${recipientHandle}, sent you ${amount} ${tokenSymbol} via @GhostTip — verify with X to claim:\n${tip.claimLink}`,
    [recipientHandle, amount, tokenSymbol, tip.claimLink]
  );
  const shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="relative overflow-hidden rounded-2xl border border-border bg-surface p-7"
    >
      <BackdropGlow tone="primary" />
      <GhostFloat />

      <motion.p
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.35 }}
        className="relative mt-2 text-center text-[11px] uppercase tracking-[0.24em] text-subtle"
      >
        Tip escrowed
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 0.3, duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
        className="relative mt-3 text-center"
      >
        <p className="font-mono text-5xl font-semibold tabular-nums">
          {amount}{" "}
          <span className="text-xl font-normal text-muted">{tokenSymbol}</span>
        </p>
        <p className="mt-2 text-sm text-muted">
          Waiting for{" "}
          <span className="font-mono text-foreground">@{recipientHandle}</span>{" "}
          to verify with X.
        </p>
      </motion.div>

      {/* Claim link */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45, duration: 0.4 }}
        className="relative mt-7 rounded-xl border border-[rgba(124,106,247,0.35)] bg-[rgba(124,106,247,0.06)] px-4 py-4"
      >
        <p className="text-[11px] uppercase tracking-widest text-subtle">
          Claim link
        </p>
        <div className="mt-2 flex items-center gap-3">
          <p className="flex-1 truncate font-mono text-xs text-foreground">
            {tip.claimLink}
          </p>
          <CopyButton value={tip.claimLink} label="Copy" />
        </div>
        <p className="mt-2 text-[11px] text-muted">
          Share only with @{recipientHandle}. They&apos;ll verify with X before
          funds unlock.
        </p>
      </motion.div>

      {/* Countdown */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6, duration: 0.4 }}
        className="relative mt-5 rounded-xl border border-border bg-background px-4 py-3"
      >
        <p className="text-[11px] uppercase tracking-widest text-subtle">
          Auto-refund window
        </p>
        <div className="mt-2">
          <CountdownTimer expiryAt={tip.expiryAt} compact />
        </div>
      </motion.div>

      {/* CTAs */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7, duration: 0.35 }}
        className="relative mt-6 flex gap-2"
      >
        <a
          href={shareUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-foreground px-4 text-sm font-medium text-background transition hover:bg-white"
        >
          <XMark /> Share on X
        </a>
        <Link
          href={`/tip/${tip.tipIntentId}`}
          className="inline-flex h-11 flex-1 items-center justify-center rounded-xl border border-border bg-surface-raised px-4 text-sm font-medium text-foreground transition hover:border-border-strong"
        >
          View status →
        </Link>
      </motion.div>

      <motion.button
        type="button"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.85, duration: 0.35 }}
        onClick={onSendAnother}
        className="relative mx-auto mt-5 block text-[11px] uppercase tracking-[0.18em] text-subtle underline-offset-4 hover:text-foreground hover:underline"
      >
        Send another
      </motion.button>
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/*                              DIRECT reveal                                 */
/* -------------------------------------------------------------------------- */

function DirectConfirmation({
  tip,
  amount,
  tokenSymbol,
  recipientHandle,
  onSendAnother,
}: {
  tip: DirectSendCreateTipResponse;
  amount: string;
  tokenSymbol: string;
  recipientHandle: string;
  onSendAnother: () => void;
}) {
  const isPrivate = tip.rail === "loyal";
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="relative overflow-hidden rounded-2xl border border-border bg-surface p-7"
    >
      <BackdropGlow tone={isPrivate ? "accent" : "primary"} />
      <GhostFloat accent={isPrivate} />

      <motion.p
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.35 }}
        className="relative mt-2 text-center text-[11px] uppercase tracking-[0.24em] text-subtle"
      >
        {isPrivate ? "Sent · private rail" : "Sent · direct transfer"}
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 0.3, duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
        className="relative mt-3 text-center"
      >
        <p className="font-mono text-5xl font-semibold tabular-nums">
          {amount}{" "}
          <span className="text-xl font-normal text-muted">{tokenSymbol}</span>
        </p>
        <p className="mt-2 text-sm text-muted">
          {isPrivate ? (
            <>
              Settled on Loyal to{" "}
              <span className="font-mono text-foreground">@{recipientHandle}</span>
              &apos;s username deposit.
            </>
          ) : (
            <>
              Transferred to{" "}
              <span className="font-mono text-foreground">@{recipientHandle}</span>
              &apos;s mapped wallet.
            </>
          )}
        </p>
      </motion.div>

      {/* CTAs */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.55, duration: 0.35 }}
        className="relative mt-7 flex gap-2"
      >
        <Link
          href={`/tip/${tip.tipIntentId}`}
          className="inline-flex h-11 flex-1 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:brightness-110"
        >
          View receipt →
        </Link>
        <button
          type="button"
          onClick={onSendAnother}
          className="inline-flex h-11 flex-1 items-center justify-center rounded-xl border border-border bg-surface-raised px-4 text-sm font-medium text-foreground transition hover:border-border-strong"
        >
          Send another
        </button>
      </motion.div>
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Effects                                   */
/* -------------------------------------------------------------------------- */

function BackdropGlow({ tone }: { tone: "primary" | "accent" }) {
  const bg =
    tone === "accent"
      ? "radial-gradient(circle at 50% -10%, rgba(78,205,196,0.35), transparent 55%)"
      : "radial-gradient(circle at 50% -10%, rgba(124,106,247,0.35), transparent 55%)";
  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{ background: bg }}
    />
  );
}

/**
 * Ghost glyph that springs in, floats, and fades — marks the "something
 * happened" moment. Respects prefers-reduced-motion.
 */
function GhostFloat({ accent = false }: { accent?: boolean }) {
  const reduce = useReducedMotion();
  if (reduce) {
    return (
      <div className="relative mx-auto mt-2 flex h-14 w-14 items-center justify-center rounded-full bg-[rgba(124,106,247,0.12)]">
        <GhostTipGlyph size={28} />
      </div>
    );
  }
  return (
    <motion.div
      initial={{ scale: 0.4, opacity: 0, y: 20 }}
      animate={{
        scale: [0.4, 1.08, 1],
        opacity: [0, 1, 1],
        y: [20, -4, 0],
      }}
      transition={{
        duration: 0.65,
        times: [0, 0.6, 1],
        ease: [0.2, 0.8, 0.2, 1],
      }}
      className="relative mx-auto mt-2 flex h-14 w-14 items-center justify-center"
    >
      <motion.div
        animate={{ y: [0, -6, 0] }}
        transition={{
          duration: 3.2,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 0.6,
        }}
        className={[
          "flex h-14 w-14 items-center justify-center rounded-full",
          accent
            ? "bg-[rgba(78,205,196,0.15)] shadow-[0_0_0_1px_rgba(78,205,196,0.35),0_20px_50px_-18px_rgba(78,205,196,0.55)]"
            : "bg-[rgba(124,106,247,0.15)] shadow-[0_0_0_1px_rgba(124,106,247,0.35),0_20px_50px_-18px_rgba(124,106,247,0.55)]",
        ].join(" ")}
      >
        <GhostTipGlyph size={30} />
      </motion.div>
    </motion.div>
  );
}

function XMark() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <path
        d="M18.244 2H21.5l-7.6 8.67L22.5 22h-6.66l-5.2-6.82L4.58 22H1.32l8.12-9.28L1.5 2h6.83l4.7 6.2L18.24 2Zm-1.16 18h1.82L7.01 4H5.09l12 16Z"
        fill="currentColor"
      />
    </svg>
  );
}
