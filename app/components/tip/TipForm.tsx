"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import type { Address } from "@solana/kit";
import { useWallet } from "../../lib/wallet/context";
import { useBalance } from "../../lib/hooks/use-balance";
import { useSendTransaction } from "../../lib/hooks/use-send-transaction";
import { lamportsFromSol, lamportsToSolString } from "../../lib/lamports";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import { buildDepositTipInstruction } from "../../lib/anchor-client";
import { useTipStore, mapCreateResponseToStored } from "../../store/tipStore";
import type {
  CreateTipResponse,
  CreateTipRequest,
  HandleType,
} from "../../types/tip";
import { useRouter } from "next/navigation";
import { parseTransactionError } from "../../lib/errors";
import { useCluster } from "../cluster-context";
import { fetchJson, ApiCallError } from "../../lib/fetcher";

// Rent-exempt minimum for the TipEscrow PDA (202 bytes with discriminator)
// + a tx-fee cushion. Solana's rent formula is ~6960 lamports per byte-year
// × 2 years; for our PDA this lands around 2.04M lamports. Leave a round
// 0.003 SOL buffer so users don't hit a confusing on-chain InsufficientFunds
// error right after passing the client-side check.
const BUFFER_LAMPORTS = 3_000_000n;

const EXPIRY_OPTIONS: { label: string; hours: number }[] = [
  { label: "1 hour", hours: 1 },
  { label: "1 day", hours: 24 },
  { label: "7 days", hours: 24 * 7 },
  { label: "30 days", hours: 24 * 30 },
];

export function TipForm() {
  const router = useRouter();
  const { wallet, signer, status: walletStatus } = useWallet();
  const { send, isSending } = useSendTransaction();
  const { cluster } = useCluster();
  const address = wallet?.account.address;
  const { lamports, error: balanceError } = useBalance(address);
  const addTip = useTipStore((s) => s.addTip);

  const [handle, setHandle] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [expiryHours, setExpiryHours] = useState<number>(24 * 7);
  const [submitting, setSubmitting] = useState(false);

  const normalisedHandle = useMemo(() => handle.trim().replace(/^@+/, ""), [handle]);
  const amountNumber = Number(amount);
  const amountLamports = useMemo(() => {
    if (!amount || Number.isNaN(amountNumber) || amountNumber <= 0) return null;
    try {
      return lamportsFromSol(amountNumber);
    } catch {
      return null;
    }
  }, [amount, amountNumber]);

  const handleValid = /^[a-zA-Z0-9_]{1,15}$/.test(normalisedHandle);
  const walletConnected = walletStatus === "connected" && !!address;

  // Balance check: need amount + escrow rent + tx-fee cushion.
  // Compare as BigInt so we're agnostic about whether the RPC returned a
  // branded Lamports bigint or a plain number.
  const required =
    amountLamports != null ? BigInt(amountLamports) + BUFFER_LAMPORTS : null;
  const balanceBig = lamports != null ? BigInt(lamports) : null;
  const hasBalance =
    balanceBig != null && required != null && balanceBig >= required;

  const balanceErrorText = (() => {
    if (!amount || amountLamports == null) return undefined;
    if (balanceBig == null) return undefined; // still loading
    if (hasBalance) return undefined;
    const haveSol = lamportsToSolString(balanceBig, 4);
    const needSol = lamportsToSolString(required!, 4);
    const zeroHint =
      balanceBig === 0n && cluster !== "mainnet"
        ? ` — your balance on ${cluster} is 0 SOL. Switch to Mainnet in the header?`
        : "";
    return `You have ${haveSol} SOL, need ~${needSol} (includes rent + fee).${zeroHint}`;
  })();

  const formReady =
    walletConnected &&
    handleValid &&
    amountLamports != null &&
    amountLamports > 0n &&
    hasBalance;

  const preview = {
    handle: normalisedHandle || "handle",
    amount: amount || "0.00",
  };

  async function handleSubmit() {
    if (!formReady || !address || !signer) return;
    setSubmitting(true);
    try {
      const body: CreateTipRequest = {
        senderWallet: address,
        recipientHandle: normalisedHandle,
        handleType: "x" as HandleType,
        amount: amountLamports!.toString(),
        memo: memo.trim() || undefined,
        expiryHours,
      };

      let tip: CreateTipResponse;
      try {
        tip = await fetchJson<CreateTipResponse>("/api/tips", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
      } catch (err) {
        toast.error(
          err instanceof ApiCallError
            ? err.message
            : "Couldn't create tip. Check the server logs."
        );
        return;
      }

      // Build & send the on-chain deposit instruction.
      const ix = buildDepositTipInstruction({
        sender: address as Address,
        payload: tip.depositPayload,
      });

      let signature: string;
      try {
        signature = await send({ instructions: [ix] });
      } catch (err) {
        console.error(err);
        toast.error(parseTransactionError(err));
        return;
      }

      // Notify backend of confirmed tx → flips tip to CLAIMABLE.
      try {
        await fetchJson(`/api/tips/${tip.tipIntentId}/submit`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ txSignature: signature }),
        });
      } catch (err) {
        toast.error(
          err instanceof ApiCallError
            ? err.message
            : "Tip sent on-chain but backend confirmation failed."
        );
        return;
      }

      addTip({
        ...mapCreateResponseToStored(tip, {
          recipientHandle: normalisedHandle,
          recipientHandleType: "x",
        }),
        txSignature: signature,
        status: "CLAIMABLE",
      });

      toast.success("Tip escrowed. Claim link is live.");
      router.push(`/tip/${tip.tipIntentId}`);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to send tip.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-col gap-4">
        <Input
          label="Recipient"
          placeholder="elonmusk"
          prefix={<span className="font-mono">@</span>}
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          suffix={
            <span className="inline-flex items-center gap-1 text-subtle">
              <XIcon />
              X handle
            </span>
          }
          maxLength={20}
          autoComplete="off"
          spellCheck={false}
          error={
            handle && !handleValid
              ? "Letters, numbers, underscore. Max 15 chars."
              : undefined
          }
        />
        <Input
          label="Amount"
          placeholder="0.10"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          suffix={<span className="font-mono text-foreground">SOL</span>}
          hint={
            lamports != null
              ? `Balance on ${cluster}: ${lamportsToSolString(
                  BigInt(lamports),
                  4
                )} SOL`
              : balanceError
                ? undefined
                : walletConnected
                  ? `Loading balance on ${cluster}…`
                  : "Connect wallet to see balance"
          }
          error={
            amount && amountLamports == null
              ? "Enter a positive amount"
              : balanceError
                ? `Couldn't reach the ${cluster} RPC — ${
                    balanceError instanceof Error
                      ? balanceError.message.slice(0, 140)
                      : "check NEXT_PUBLIC_SOLANA_RPC_URL or switch clusters."
                  }`
                : balanceErrorText
          }
        />
        <Input
          label="Message (optional)"
          placeholder="Great work."
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          maxLength={140}
          hint="Revealed only after the recipient verifies with X."
        />
        <ExpirySelector value={expiryHours} onChange={setExpiryHours} />
      </div>

      <GhostPreview
        solid={formReady}
        handle={preview.handle}
        amount={preview.amount}
      />

      <Button
        size="lg"
        onClick={handleSubmit}
        disabled={!formReady}
        loading={submitting || isSending}
        fullWidth
      >
        {walletConnected
          ? formReady
            ? `Send ${preview.amount} SOL to @${preview.handle}`
            : "Complete the form to send"
          : "Connect wallet to send"}
      </Button>

      <p className="text-center text-[11px] text-subtle">
        Routed privately · auto-refund if unclaimed
      </p>
    </div>
  );
}

function ExpirySelector({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium uppercase tracking-widest text-subtle">
        Claim window
      </label>
      <div className="grid grid-cols-4 gap-2">
        {EXPIRY_OPTIONS.map((opt) => {
          const active = value === opt.hours;
          return (
            <button
              key={opt.hours}
              type="button"
              onClick={() => onChange(opt.hours)}
              className={[
                "h-10 rounded-lg border text-xs font-medium transition-colors",
                active
                  ? "border-primary/60 bg-[rgba(124,106,247,0.12)] text-[#B6A9FF]"
                  : "border-border bg-surface text-muted hover:text-foreground",
              ].join(" ")}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function GhostPreview({
  solid,
  handle,
  amount,
}: {
  solid: boolean;
  handle: string;
  amount: string;
}) {
  return (
    <motion.div
      animate={{
        opacity: solid ? 1 : 0.45,
        filter: solid ? "blur(0px)" : "blur(4px)",
        scale: solid ? 1 : 0.98,
      }}
      transition={{ duration: 0.25 }}
      className="relative rounded-2xl border border-border bg-surface p-4"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[rgba(124,106,247,0.12)]">
            <XIcon />
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-subtle">
              To
            </p>
            <p className="font-mono text-sm text-foreground">@{handle}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-widest text-subtle">
            Amount
          </p>
          <p className="font-mono text-lg font-semibold tabular-nums">
            {amount}{" "}
            <span className="text-xs font-normal text-muted">SOL</span>
          </p>
        </div>
      </div>
      <AnimatePresence>
        {!solid && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl"
          >
            <p className="text-[11px] uppercase tracking-[0.2em] text-subtle">
              ghost preview
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function XIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      aria-hidden="true"
      className="text-muted"
    >
      <path
        d="M18.244 2H21.5l-7.6 8.67L22.5 22h-6.66l-5.2-6.82L4.58 22H1.32l8.12-9.28L1.5 2h6.83l4.7 6.2L18.24 2Zm-1.16 18h1.82L7.01 4H5.09l12 16Z"
        fill="currentColor"
      />
    </svg>
  );
}
