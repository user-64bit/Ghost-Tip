"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import type { Address } from "@solana/kit";
import { useWallet } from "../../lib/wallet/context";
import { useBalance } from "../../lib/hooks/use-balance";
import { useSendTransaction } from "../../lib/hooks/use-send-transaction";
import { lamportsFromSol, lamportsToSolString } from "../../lib/lamports";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import {
  buildDepositTipInstruction,
  buildNativeTransferInstruction,
} from "../../lib/anchor-client";
import { useTipStore, mapCreateResponseToStored } from "../../store/tipStore";
import type {
  Cluster,
  CreateTipResponse,
  CreateTipRequest,
  HandleType,
  DirectSendCreateTipResponse,
  EscrowCreateTipResponse,
} from "../../types/tip";
import { useRouter } from "next/navigation";
import { parseTransactionError } from "../../lib/errors";
import { useCluster } from "../cluster-context";
import { fetchJson, ApiCallError } from "../../lib/fetcher";
import { SPL_MINTS, isLoyalSupportedCluster } from "../../lib/loyal";
// Loyal + web3.js + spl-token are lazy-loaded inside submitDirect so the
// send page and its SSR prerender don't pull a 500KB bundle they may
// never need. Only users hitting the direct private-send path load them.

const BUFFER_LAMPORTS = 3_000_000n;

const EXPIRY_OPTIONS: { label: string; hours: number }[] = [
  { label: "1 hour", hours: 1 },
  { label: "1 day", hours: 24 },
  { label: "7 days", hours: 24 * 7 },
  { label: "30 days", hours: 24 * 30 },
];

type TokenChoice =
  | { kind: "sol"; symbol: "SOL"; mint: string; decimals: 9 }
  | { kind: "spl"; symbol: string; mint: string; decimals: number };

function availableTokens(cluster: Cluster): TokenChoice[] {
  const sol: TokenChoice = {
    kind: "sol",
    symbol: "SOL",
    mint: "So11111111111111111111111111111111111111112",
    decimals: 9,
  };
  const spl: TokenChoice[] = isLoyalSupportedCluster(cluster)
    ? SPL_MINTS[cluster].map((t) => ({
        kind: "spl" as const,
        symbol: t.symbol,
        mint: t.address,
        decimals: t.decimals,
      }))
    : [];
  return [sol, ...spl];
}

interface WarmResult {
  warm: true;
  handle: string;
  handleType: HandleType;
  wallet: string;
}
interface ColdResult {
  warm: false;
}
type ResolveResult = WarmResult | ColdResult;

export function TipForm() {
  const router = useRouter();
  const { wallet, signer, status: walletStatus } = useWallet();
  const { send, isSending } = useSendTransaction();
  const { cluster } = useCluster();
  const address = wallet?.account.address;
  const { lamports, error: balanceError } = useBalance(address);
  const addTip = useTipStore((s) => s.addTip);

  const tokens = useMemo(() => availableTokens(cluster), [cluster]);
  const [tokenMint, setTokenMint] = useState<string>(tokens[0].mint);
  const token = useMemo(
    () => tokens.find((t) => t.mint === tokenMint) ?? tokens[0],
    [tokens, tokenMint]
  );
  // Reset token when cluster changes (SPL lists differ).
  useEffect(() => {
    setTokenMint(availableTokens(cluster)[0].mint);
  }, [cluster]);

  const [handle, setHandle] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [expiryHours, setExpiryHours] = useState<number>(24 * 7);
  const [submitting, setSubmitting] = useState(false);
  const [submitStage, setSubmitStage] = useState<string | null>(null);

  const normalisedHandle = useMemo(
    () => handle.trim().replace(/^@+/, "").toLowerCase(),
    [handle]
  );
  const handleValid = /^[a-zA-Z0-9_]{1,15}$/.test(normalisedHandle);

  // Warm-handle probe. Debounced so we don't hammer the DB on each keystroke.
  const [resolveResult, setResolveResult] = useState<ResolveResult | null>(null);
  const resolveReq = useRef(0);
  useEffect(() => {
    if (!handleValid) {
      setResolveResult(null);
      return;
    }
    const seq = ++resolveReq.current;
    const timer = setTimeout(async () => {
      try {
        const r = await fetchJson<ResolveResult>(
          `/api/handles/resolve?type=x&value=${encodeURIComponent(
            normalisedHandle
          )}`
        );
        if (seq === resolveReq.current) setResolveResult(r);
      } catch {
        if (seq === resolveReq.current) setResolveResult({ warm: false });
      }
    }, 220);
    return () => clearTimeout(timer);
  }, [normalisedHandle, handleValid]);

  const isWarm = resolveResult?.warm === true;

  const amountNumber = Number(amount);
  const amountRaw = useMemo(() => {
    if (!amount || Number.isNaN(amountNumber) || amountNumber <= 0) return null;
    try {
      if (token.kind === "sol") return lamportsFromSol(amountNumber);
      const scaled = BigInt(
        Math.round(amountNumber * 10 ** token.decimals)
      );
      return scaled;
    } catch {
      return null;
    }
  }, [amount, amountNumber, token]);

  const walletConnected = walletStatus === "connected" && !!address;

  // Native-SOL balance check (also used as a proxy "can you pay fees?" for
  // SPL tips — SPL balances themselves aren't polled in this form).
  const required =
    amountRaw != null && token.kind === "sol"
      ? BigInt(amountRaw) + BUFFER_LAMPORTS
      : BUFFER_LAMPORTS;
  const balanceBig = lamports != null ? BigInt(lamports) : null;
  const hasBalance =
    balanceBig != null && required != null && balanceBig >= required;

  const balanceErrorText = (() => {
    if (!amount || amountRaw == null) return undefined;
    if (balanceBig == null) return undefined;
    if (hasBalance) return undefined;
    const haveSol = lamportsToSolString(balanceBig, 4);
    const needSol = lamportsToSolString(required, 4);
    const zeroHint =
      balanceBig === 0n && cluster !== "mainnet"
        ? ` — your balance on ${cluster} is 0 SOL. Switch to Mainnet in the header?`
        : "";
    if (token.kind === "sol") {
      return `You have ${haveSol} SOL, need ~${needSol} (includes rent + fee).${zeroHint}`;
    }
    return `You have ${haveSol} SOL for fees, need ~${needSol} for tx costs.${zeroHint}`;
  })();

  const formReady =
    walletConnected &&
    handleValid &&
    amountRaw != null &&
    amountRaw > 0n &&
    hasBalance;

  const preview = {
    handle: normalisedHandle || "handle",
    amount: amount || "0.00",
  };

  async function handleSubmit() {
    if (!formReady || !address || !signer || !wallet) return;
    setSubmitting(true);
    setSubmitStage(null);
    try {
      const body: CreateTipRequest = {
        senderWallet: address,
        recipientHandle: normalisedHandle,
        handleType: "x" as HandleType,
        cluster,
        amount: amountRaw!.toString(),
        tokenMint: token.mint,
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

      if (tip.mode === "DIRECT_SEND") {
        await submitDirect({
          tip,
          token,
        });
      } else {
        await submitEscrow(tip);
      }
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to send tip.");
    } finally {
      setSubmitting(false);
      setSubmitStage(null);
    }
  }

  async function submitEscrow(tip: EscrowCreateTipResponse) {
    const ix = buildDepositTipInstruction({
      sender: address as Address,
      payload: tip.depositPayload,
    });

    let signature: string;
    try {
      setSubmitStage("Confirm in wallet…");
      signature = await send({ instructions: [ix] });
    } catch (err) {
      console.error(err);
      toast.error(parseTransactionError(err));
      return;
    }

    try {
      setSubmitStage("Finalising…");
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
  }

  async function submitDirect(args: {
    tip: DirectSendCreateTipResponse;
    token: TokenChoice;
  }) {
    const { tip, token } = args;

    if (tip.rail === "native" && tip.nativeSendPayload) {
      // Public native transfer — warm recipient, SOL.
      const ix = buildNativeTransferInstruction({
        from: address as Address,
        to: tip.nativeSendPayload.recipientWallet as Address,
        lamports: BigInt(tip.nativeSendPayload.amountLamports),
      });
      let signature: string;
      try {
        setSubmitStage("Confirm in wallet…");
        signature = await send({ instructions: [ix] });
      } catch (err) {
        console.error(err);
        toast.error(parseTransactionError(err));
        return;
      }
      try {
        setSubmitStage("Finalising…");
        await fetchJson(`/api/tips/${tip.tipIntentId}/submit-direct`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ txSignature: signature }),
        });
      } catch (err) {
        toast.error(
          err instanceof ApiCallError
            ? err.message
            : "Sent on-chain but backend confirmation failed."
        );
        return;
      }
      addTip({
        ...mapCreateResponseToStored(tip, {
          recipientHandle: normalisedHandle,
          recipientHandleType: "x",
        }),
        txSignature: signature,
        status: "CLAIMED",
      });
      toast.success(
        `${amount} SOL sent to @${normalisedHandle} · direct transfer.`
      );
      router.push(`/tip/${tip.tipIntentId}`);
      return;
    }

    if (tip.rail === "loyal" && tip.privateSendPayload) {
      if (!isLoyalSupportedCluster(cluster)) {
        toast.error("Loyal's private rail is mainnet/devnet only.");
        return;
      }
      if (token.kind !== "spl") {
        toast.error("Private rail needs an SPL token.");
        return;
      }
      try {
        setSubmitStage("Connecting to Loyal rail…");
        const [
          { walletSessionToLoyalWalletLike },
          {
            createBrowserLoyalClient,
            privateSendToUsername,
          },
          { PublicKey },
          { getAssociatedTokenAddressSync },
        ] = await Promise.all([
          import("../../lib/loyal-wallet-adapter"),
          import("../../lib/loyal-client"),
          import("@solana/web3.js"),
          import("@solana/spl-token"),
        ]);

        const loyalWallet = walletSessionToLoyalWalletLike(
          wallet!,
          `solana:${cluster}`
        );
        const client = await createBrowserLoyalClient({
          wallet: loyalWallet,
          cluster,
        });
        const sender = new PublicKey(address as string);
        const mint = new PublicKey(token.mint);
        const senderAta = getAssociatedTokenAddressSync(mint, sender);

        const step2Label = {
          "init-deposit": "Creating shielded deposit…",
          shield: `Shielding ${amount} ${token.symbol}…`,
          permission: "Granting PER permission…",
          delegate: "Delegating to Loyal validator…",
          transfer: "Sending privately on Loyal rail…",
        } as const;

        const result = await privateSendToUsername({
          client,
          cluster,
          sender,
          senderTokenAccount: senderAta,
          recipientUsername: normalisedHandle,
          tokenMint: mint,
          amount: BigInt(tip.privateSendPayload.amount),
          onStep: (s) => setSubmitStage(step2Label[s]),
        });

        setSubmitStage("Finalising…");
        await fetchJson(`/api/tips/${tip.tipIntentId}/submit-direct`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            txSignature: result.transferSignature,
          }),
        });
        addTip({
          ...mapCreateResponseToStored(tip, {
            recipientHandle: normalisedHandle,
            recipientHandleType: "x",
          }),
          txSignature: result.transferSignature,
          status: "CLAIMED",
        });
        toast.success(
          result.shieldedFirstTime
            ? `First-time shield done. ${amount} ${token.symbol} sent privately.`
            : `${amount} ${token.symbol} sent privately to @${normalisedHandle}.`
        );
        router.push(`/tip/${tip.tipIntentId}`);
      } catch (err) {
        console.error(err);
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(`Loyal transfer failed — ${msg.slice(0, 160)}`);
      }
      return;
    }

    toast.error("Don't know how to settle this direct send.");
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-col gap-4">
        <TokenPicker
          tokens={tokens}
          value={token.mint}
          onChange={setTokenMint}
        />
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
          hint={
            handleValid && isWarm
              ? `Warm: @${normalisedHandle} is on GhostTip — this will route privately.`
              : handleValid && resolveResult
                ? `@${normalisedHandle} isn't on GhostTip yet — you'll get a claim link.`
                : undefined
          }
        />
        <Input
          label="Amount"
          placeholder={token.kind === "sol" ? "0.10" : "1.00"}
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          suffix={<span className="font-mono text-foreground">{token.symbol}</span>}
          hint={
            token.kind === "sol" && lamports != null
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
            amount && amountRaw == null
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
          hint={
            isWarm
              ? "Sent alongside the transfer."
              : "Revealed only after the recipient verifies with X."
          }
        />
        {!isWarm && (
          <ExpirySelector value={expiryHours} onChange={setExpiryHours} />
        )}
      </div>

      <GhostPreview
        solid={formReady}
        handle={preview.handle}
        amount={preview.amount}
        warm={isWarm}
        tokenSymbol={token.symbol}
      />

      <Button
        size="lg"
        onClick={handleSubmit}
        disabled={!formReady}
        loading={submitting || isSending}
        fullWidth
      >
        {submitStage && (submitting || isSending)
          ? submitStage
          : walletConnected
            ? formReady
              ? isWarm
                ? `Send ${preview.amount} ${token.symbol} to @${preview.handle} · private`
                : `Send ${preview.amount} ${token.symbol} to @${preview.handle}`
              : "Complete the form to send"
            : "Connect wallet to send"}
      </Button>

      <p className="text-center text-[11px] text-subtle">
        {isWarm
          ? "Direct to wallet · private via Loyal · no claim link needed"
          : "Routed through our escrow · auto-refund if unclaimed"}
      </p>
    </div>
  );
}

function TokenPicker({
  tokens,
  value,
  onChange,
}: {
  tokens: TokenChoice[];
  value: string;
  onChange: (mint: string) => void;
}) {
  if (tokens.length <= 1) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium uppercase tracking-widest text-subtle">
        Token
      </label>
      <div className="flex gap-2">
        {tokens.map((t) => {
          const active = value === t.mint;
          return (
            <button
              key={t.mint}
              type="button"
              onClick={() => onChange(t.mint)}
              className={[
                "h-10 flex-1 rounded-lg border text-xs font-medium transition-colors",
                active
                  ? "border-primary/60 bg-[rgba(124,106,247,0.12)] text-[#B6A9FF]"
                  : "border-border bg-surface text-muted hover:text-foreground",
              ].join(" ")}
            >
              {t.symbol}
              {t.kind === "spl" && active && (
                <span className="ml-1 text-[10px] text-[#7BE3DB]">private</span>
              )}
            </button>
          );
        })}
      </div>
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
  warm,
  tokenSymbol,
}: {
  solid: boolean;
  handle: string;
  amount: string;
  warm: boolean;
  tokenSymbol: string;
}) {
  return (
    <motion.div
      animate={{
        opacity: solid ? 1 : 0.45,
        filter: solid ? "blur(0px)" : "blur(4px)",
        scale: solid ? 1 : 0.98,
      }}
      transition={{ duration: 0.25 }}
      className={[
        "relative rounded-2xl border bg-surface p-4",
        warm ? "border-[rgba(78,205,196,0.35)]" : "border-border",
      ].join(" ")}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={[
              "flex h-9 w-9 items-center justify-center rounded-lg",
              warm
                ? "bg-[rgba(78,205,196,0.15)]"
                : "bg-[rgba(124,106,247,0.12)]",
            ].join(" ")}
          >
            <XIcon />
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-subtle">
              {warm ? "Direct to" : "Claim link for"}
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
            <span className="text-xs font-normal text-muted">{tokenSymbol}</span>
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
