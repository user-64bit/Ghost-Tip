"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import bs58 from "bs58";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { CountdownTimer } from "../ui/CountdownTimer";
import { Button } from "../ui/Button";
import { GhostWalletButton } from "../ui/GhostWalletButton";
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
          lockedLabel={preview.memo}
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
  lockedLabel,
  memo,
}: {
  locked: boolean;
  lockedLabel: string | null;
  memo: string | null;
}) {
  if (!locked && !memo) return null;
  return (
    <div className="mt-4 rounded-xl border border-border bg-background px-4 py-3">
      <p className="text-xs uppercase tracking-widest text-subtle">Message</p>
      <AnimatePresence mode="wait" initial={false}>
        {locked ? (
          <motion.p
            key="locked"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mt-1 select-none font-mono text-sm text-subtle blur-[3px]"
          >
            {lockedLabel ?? "— — — — —"}
          </motion.p>
        ) : (
          <motion.p
            key="revealed"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-1 text-sm text-foreground"
          >
            {memo ?? (
              <span className="text-subtle italic">No message included</span>
            )}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
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
            "radial-gradient(circle at 50% -10%, rgba(78,205,196,0.35), transparent 55%)",
        }}
      />
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 18 }}
        className="relative mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[rgba(78,205,196,0.15)]"
      >
        <svg viewBox="0 0 24 24" width="28" height="28" fill="none">
          <motion.path
            d="M20 6 9 17l-5-5"
            stroke="#4ECDC4"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.45, delay: 0.1 }}
          />
        </svg>
      </motion.div>
      <p className="relative mt-5 text-xs uppercase tracking-[0.2em] text-subtle">
        Claimed
      </p>
      <p className="relative mt-2 font-mono text-4xl font-semibold tabular-nums">
        {sol} <span className="text-lg font-normal text-muted">SOL</span>
      </p>
      <p className="relative mt-2 text-sm text-muted">
        Funds are in your wallet now.
      </p>
      <p className="relative mt-4 break-all font-mono text-[10px] text-subtle">
        tx: {txSignature}
      </p>
    </motion.div>
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
