"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import bs58 from "bs58";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { CountdownTimer } from "../ui/CountdownTimer";
import { Button } from "../ui/Button";
import { GhostWalletButton } from "../ui/GhostWalletButton";
import { GhostTipGlyph } from "../ui/GhostTipLogo";
import { useWallet } from "../../lib/wallet/context";
import { lamportsToSolString } from "../../lib/lamports";
import { useClaimSessionStore } from "../../store/sessionStore";
import { fetchJson, ApiCallError } from "../../lib/fetcher";
import type { TipPreview, ErrorCode } from "../../types/tip";
import { errorMessage } from "../../types/tip";

const previewFetcher = (url: string) => fetchJson<TipPreview>(url);

interface VerifiedData {
  verifiedHandle: string;
  memo: string | null;
  amount: string;
  tipIntentId: string;
  expiryAt: string;
}

export function ClaimFlow({ token }: { token: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const sessionFromUrl = params?.get("session") ?? null;
  const errorFromUrl = params?.get("error") ?? null;

  const { wallet, status, signer } = useWallet();
  const setSession = useClaimSessionStore((s) => s.set);
  const getSession = useClaimSessionStore((s) => s.get);
  const clearSession = useClaimSessionStore((s) => s.clear);

  const storedSession = useMemo(() => getSession(token), [getSession, token]);

  const {
    data: preview,
    error: previewError,
    isLoading,
  } = useSWR<TipPreview>(`/api/claim/${token}`, previewFetcher, {
    refreshInterval: 10_000,
  });

  const [verified, setVerified] = useState<VerifiedData | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claimResult, setClaimResult] = useState<null | {
    txSignature: string;
    amount: string;
  }>(null);

  // Ingest the session from the OAuth callback on first render.
  useEffect(() => {
    if (!sessionFromUrl) return;
    (async () => {
      try {
        const data = await fetchJson<{
          verifiedHandle: string;
          memo: string | null;
          amount: string;
          expiryAt: string;
          tipIntentId: string;
        }>(`/api/claim/${token}/verify`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ session: sessionFromUrl }),
        });
        setVerified({
          verifiedHandle: data.verifiedHandle,
          memo: data.memo,
          amount: data.amount,
          expiryAt: data.expiryAt,
          tipIntentId: data.tipIntentId,
        });
        setSession(token, {
          session: sessionFromUrl,
          verifiedHandle: data.verifiedHandle,
        });
        // Strip the session query param so a page refresh doesn't re-verify.
        router.replace(`/claim/${token}`);
      } catch (err) {
        toast.error(
          err instanceof ApiCallError ? err.message : "Verification failed."
        );
      }
    })();
  }, [sessionFromUrl, token, router, setSession]);

  // Restore a persisted session if the tab was refreshed.
  useEffect(() => {
    if (verified || !storedSession) return;
    (async () => {
      try {
        const data = await fetchJson<{
          verifiedHandle: string;
          memo: string | null;
          amount: string;
          expiryAt: string;
          tipIntentId: string;
        }>(`/api/claim/${token}/verify`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ session: storedSession.session }),
        });
        setVerified({
          verifiedHandle: data.verifiedHandle,
          memo: data.memo,
          amount: data.amount,
          expiryAt: data.expiryAt,
          tipIntentId: data.tipIntentId,
        });
      } catch {
        clearSession(token);
      }
    })();
  }, [storedSession, verified, token, clearSession]);

  useEffect(() => {
    if (errorFromUrl) {
      toast.error(errorMessage(errorFromUrl as ErrorCode));
      router.replace(`/claim/${token}`);
    }
  }, [errorFromUrl, router, token]);

  const startVerify = useCallback(() => {
    window.location.href = `/api/auth/x/start?token=${token}`;
  }, [token]);

  const onClaim = useCallback(async () => {
    if (!wallet?.account.address || !signer || !verified) return;
    const session = getSession(token);
    if (!session) {
      toast.error("Verification session expired. Please verify again.");
      return;
    }
    setClaiming(true);
    try {
      const recipientWallet = wallet.account.address;
      const message = `ghosttip-claim:${verified.tipIntentId}:${token}:${recipientWallet}`;
      const msgBytes = new TextEncoder().encode(message);

      if (!wallet.signMessage) {
        toast.error("This wallet doesn't support message signing.");
        return;
      }
      const sigBytes = await wallet.signMessage(msgBytes);
      const walletSignature = bs58.encode(sigBytes);

      try {
        const data = await fetchJson<{
          success: boolean;
          txSignature: string;
          amount: string;
        }>(`/api/claim/${token}/execute`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            session: session.session,
            recipientWallet,
            walletSignature,
          }),
        });
        setClaimResult({
          txSignature: data.txSignature,
          amount: data.amount,
        });
        clearSession(token);
      } catch (err) {
        toast.error(
          err instanceof ApiCallError ? err.message : "Claim failed"
        );
        return;
      }
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Claim failed");
    } finally {
      setClaiming(false);
    }
  }, [wallet, signer, verified, token, getSession, clearSession]);

  /* ------------------------------ Terminal states ---------------------------- */
  if (claimResult) {
    return <ClaimSuccess amount={claimResult.amount} txSignature={claimResult.txSignature} />;
  }

  if (previewError) {
    const code =
      previewError instanceof ApiCallError
        ? (previewError.code as ErrorCode)
        : undefined;
    return <ClaimInvalid message={previewError.message} code={code} />;
  }

  if (isLoading || !preview) {
    return (
      <div className="animate-pulse space-y-4 rounded-2xl border border-border bg-surface p-8">
        <div className="h-3 w-24 rounded bg-surface-raised" />
        <div className="h-14 w-40 rounded bg-surface-raised" />
        <div className="h-9 w-full rounded bg-surface-raised" />
      </div>
    );
  }

  const amountSol = lamportsToSolString(BigInt(preview.amount) as unknown as bigint);
  const activeStep = !verified ? 1 : !wallet ? 2 : 3;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-surface">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 30% -10%, rgba(124,106,247,0.35), transparent 50%)",
        }}
      />
      <div className="relative p-7">
        <div className="mb-5 flex items-center justify-between">
          <p className="text-[11px] uppercase tracking-[0.22em] text-subtle">
            Someone tipped you
          </p>
          <StepPill step={activeStep} />
        </div>

        <p className="text-xs uppercase tracking-widest text-subtle">Amount</p>
        <p className="mt-1 font-mono text-5xl font-semibold tabular-nums">
          {amountSol} <span className="text-xl font-normal text-muted">SOL</span>
        </p>

        <div className="mt-6">
          <p className="text-xs uppercase tracking-widest text-subtle">
            Claim window
          </p>
          <div className="mt-2">
            <CountdownTimer expiryAt={preview.expiryAt} />
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-border bg-background px-4 py-3">
          <p className="text-xs uppercase tracking-widest text-subtle">
            Intended recipient
          </p>
          <p className="mt-1 font-mono text-sm">@{preview.intendedHandle}</p>
        </div>

        {/* Memo */}
        <MemoReveal
          locked={!verified}
          hasMemo={preview.memo != null}
          memo={verified?.memo ?? null}
        />

        {/* Action panel */}
        <div className="mt-7 border-t border-border pt-5">
          <AnimatePresence mode="wait">
            {activeStep === 1 && (
              <motion.div
                key="step-1"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="space-y-3"
              >
                <p className="text-sm text-muted">
                  Verify you&apos;re{" "}
                  <span className="font-mono text-foreground">
                    @{preview.intendedHandle}
                  </span>{" "}
                  with X to unlock this tip.
                </p>
                <Button fullWidth size="lg" onClick={startVerify}>
                  <XMark /> Verify with X
                </Button>
              </motion.div>
            )}

            {activeStep === 2 && verified && (
              <motion.div
                key="step-2"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="space-y-3"
              >
                <p className="text-sm text-muted">
                  Verified as{" "}
                  <span className="font-mono text-[#7BE3DB]">
                    @{verified.verifiedHandle}
                  </span>
                  . Connect a wallet to receive your{" "}
                  {lamportsToSolString(
                    BigInt(verified.amount) as unknown as bigint
                  )}{" "}
                  SOL.
                </p>
                <div className="flex justify-center">
                  <GhostWalletButton />
                </div>
              </motion.div>
            )}

            {activeStep === 3 && verified && wallet && (
              <motion.div
                key="step-3"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="space-y-3"
              >
                <p className="text-sm text-muted">
                  Ready to claim into{" "}
                  <span className="font-mono text-foreground">
                    {wallet.account.address.slice(0, 4)}…
                    {wallet.account.address.slice(-4)}
                  </span>
                  .
                </p>
                <Button
                  fullWidth
                  size="lg"
                  onClick={onClaim}
                  loading={claiming || status === "connecting"}
                >
                  Claim{" "}
                  {lamportsToSolString(
                    BigInt(verified.amount) as unknown as bigint
                  )}{" "}
                  SOL
                </Button>
                <p className="text-center text-[11px] text-subtle">
                  You&apos;ll sign a message to prove you control this wallet.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function StepPill({ step }: { step: 1 | 2 | 3 }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.2em] text-subtle">
      <Dot active={step >= 1} />
      <span className={step === 1 ? "text-foreground" : ""}>Verify</span>
      <span className="text-subtle">→</span>
      <Dot active={step >= 2} />
      <span className={step === 2 ? "text-foreground" : ""}>Wallet</span>
      <span className="text-subtle">→</span>
      <Dot active={step >= 3} />
      <span className={step === 3 ? "text-foreground" : ""}>Claim</span>
    </div>
  );
}

function Dot({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-block h-1.5 w-1.5 rounded-full ${
        active ? "bg-primary" : "bg-subtle"
      }`}
    />
  );
}

function MemoReveal({
  locked,
  hasMemo,
  memo,
}: {
  locked: boolean;
  /** Whether a memo exists at all — drives the locked skeleton visibility. */
  hasMemo: boolean;
  memo: string | null;
}) {
  if (!locked && !memo) return null;
  if (locked && !hasMemo) return null;
  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-border bg-background px-4 py-3">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-widest text-subtle">Message</p>
        {locked && (
          <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-subtle">
            <LockIcon />
            Verification-gated
          </span>
        )}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        {locked ? (
          <motion.div
            key="locked"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            className="mt-3"
            aria-label="Message locked until verification"
          >
            <div className="flex flex-col gap-1.5">
              <ScrambleBar width="92%" />
              <ScrambleBar width="78%" />
              <ScrambleBar width="64%" />
            </div>
          </motion.div>
        ) : (
          <motion.p
            key="revealed"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="mt-2 text-sm text-foreground"
          >
            {memo ?? (
              <span className="italic text-subtle">No message included</span>
            )}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

function ScrambleBar({ width }: { width: string }) {
  return (
    <div
      className="relative h-3 overflow-hidden rounded-sm"
      style={{ width }}
    >
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(124,106,247,0.08)_0%,rgba(124,106,247,0.18)_50%,rgba(124,106,247,0.08)_100%)]" />
      <div
        className="absolute inset-0"
        style={{
          background:
            "repeating-linear-gradient(90deg, rgba(255,255,255,0.10) 0 4px, transparent 4px 10px)",
        }}
      />
      <div
        className="absolute inset-0 shimmer"
        style={{ mixBlendMode: "overlay" }}
      />
    </div>
  );
}

function LockIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <rect x="4" y="10" width="16" height="11" rx="2.5" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" strokeLinecap="round" />
    </svg>
  );
}

function ClaimSuccess({
  amount,
  txSignature,
}: {
  amount: string;
  txSignature: string;
}) {
  const sol = lamportsToSolString(BigInt(amount) as unknown as bigint);
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="relative overflow-hidden rounded-2xl border border-border bg-surface p-8 text-center"
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% -10%, rgba(78,205,196,0.4), transparent 55%), radial-gradient(circle at 20% 100%, rgba(124,106,247,0.22), transparent 60%)",
        }}
      />

      <ConfettiBurst />

      <div className="relative mx-auto h-20 w-20">
        {/* Pulsing ring */}
        <motion.span
          aria-hidden
          initial={{ scale: 0.6, opacity: 0.6 }}
          animate={{ scale: 2.2, opacity: 0 }}
          transition={{
            duration: 1.6,
            repeat: 1,
            ease: "easeOut",
          }}
          className="absolute inset-0 rounded-full bg-[rgba(78,205,196,0.25)]"
        />
        <motion.div
          initial={{ scale: 0.5, opacity: 0, rotate: -8 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 180, damping: 16, delay: 0.1 }}
          className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[rgba(78,205,196,0.12)] shadow-[0_0_0_1px_rgba(78,205,196,0.35),0_30px_60px_-20px_rgba(78,205,196,0.55)]"
        >
          <motion.div
            animate={{ y: [0, -3, 0] }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 0.6,
            }}
          >
            <GhostTipGlyph size={36} />
          </motion.div>
          <motion.svg
            viewBox="0 0 24 24"
            width="22"
            height="22"
            fill="none"
            className="absolute -bottom-1 -right-1 rounded-full bg-background p-0.5"
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: 0.5, type: "spring", stiffness: 260, damping: 14 }}
          >
            <circle cx="12" cy="12" r="10" fill="#4ECDC4" />
            <motion.path
              d="M17 9 11 15l-3-3"
              stroke="#0A0A0F"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.35, delay: 0.65 }}
            />
          </motion.svg>
        </motion.div>
      </div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.35, duration: 0.35 }}
        className="relative mt-6 text-xs uppercase tracking-[0.22em] text-subtle"
      >
        Claimed
      </motion.p>
      <motion.p
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.4 }}
        className="relative mt-2 font-mono text-5xl font-semibold tabular-nums"
      >
        {sol} <span className="text-xl font-normal text-muted">SOL</span>
      </motion.p>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.35 }}
        className="relative mt-2 text-sm text-muted"
      >
        Funds are in your wallet now.
      </motion.p>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.65, duration: 0.35 }}
        className="relative mt-5 break-all font-mono text-[10px] text-subtle"
      >
        tx · {txSignature.slice(0, 18)}…{txSignature.slice(-6)}
      </motion.p>
    </motion.div>
  );
}

/**
 * Small confetti-style particle burst on claim. 12 particles radiating
 * outward with randomised velocity + rotation. Violet/teal mix to stay
 * on-brand; skipped entirely under prefers-reduced-motion.
 */
function ConfettiBurst() {
  const reduce = useReducedMotion();
  const particles = useMemo(() => {
    // Deterministic-ish layout so SSR matches; keyed off index.
    return Array.from({ length: 14 }).map((_, i) => {
      const angle = (i / 14) * Math.PI * 2;
      const dist = 90 + (i % 3) * 18;
      return {
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
        color:
          i % 3 === 0
            ? "#4ECDC4"
            : i % 3 === 1
              ? "#7C6AF7"
              : "#B6A9FF",
        rot: angle * 57 + (i % 2 ? 40 : -40),
        size: 5 + (i % 3) * 2,
      };
    });
  }, []);

  if (reduce) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-[72px] -translate-x-1/2"
    >
      {particles.map((p, i) => (
        <motion.span
          key={i}
          initial={{ x: 0, y: 0, opacity: 0, rotate: 0, scale: 0.6 }}
          animate={{
            x: p.x,
            y: p.y,
            opacity: [0, 1, 0],
            rotate: p.rot,
            scale: [0.6, 1, 0.8],
          }}
          transition={{
            duration: 1.1,
            delay: 0.2 + (i % 5) * 0.03,
            ease: [0.2, 0.8, 0.2, 1],
          }}
          className="absolute left-0 top-0 inline-block rounded-[2px]"
          style={{
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            boxShadow: `0 0 10px ${p.color}`,
          }}
        />
      ))}
    </div>
  );
}

function ClaimInvalid({
  message,
  code,
}: {
  message: string;
  code?: ErrorCode;
}) {
  const headline =
    code === "TIP_EXPIRED"
      ? "This tip expired"
      : code === "TIP_ALREADY_CLAIMED"
        ? "Already claimed"
        : code === "TIP_CANCELLED"
          ? "Tip was cancelled"
          : "Claim unavailable";
  return (
    <div className="rounded-2xl border border-border bg-surface p-8 text-center">
      <p className="font-display text-2xl font-semibold">{headline}</p>
      <p className="mt-2 text-sm text-muted">{message}</p>
    </div>
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
