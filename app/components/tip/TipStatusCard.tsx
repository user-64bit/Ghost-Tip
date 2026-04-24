"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import type { Address } from "@solana/kit";
import { CopyButton } from "../ui/CopyButton";
import { CountdownTimer } from "../ui/CountdownTimer";
import { Badge, statusBadgeLabel, statusBadgeTone } from "../ui/Badge";
import { Button } from "../ui/Button";
import type { TipIntent, TipStatus } from "../../types/tip";
import { fetchJson, ApiCallError } from "../../lib/fetcher";
import { useWallet } from "../../lib/wallet/context";
import { useSendTransaction } from "../../lib/hooks/use-send-transaction";
import { buildCancelTipInstruction } from "../../lib/anchor-client";
import { useTipStore } from "../../store/tipStore";
import { useCluster } from "../cluster-context";
import { lamportsToSolString } from "../../lib/lamports";
import { ellipsify } from "../../lib/explorer";

export interface TipStatusCardProps {
  tip: TipIntent;
  claimLink?: string | null;
  isOwner: boolean;
  onUpdated: () => void;
}

export function TipStatusCard({
  tip,
  claimLink,
  isOwner,
  onUpdated,
}: TipStatusCardProps) {
  const { signer, wallet } = useWallet();
  const { send } = useSendTransaction();
  const { getExplorerUrl } = useCluster();
  const updateTip = useTipStore((s) => s.updateTip);
  const [cancelling, setCancelling] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  const status = tip.status;
  const isActive = status === "CLAIMABLE";
  const isDone =
    status === "CLAIMED" ||
    status === "REFUNDED" ||
    status === "CANCELLED" ||
    status === "EXPIRED";

  const solString = useMemo(() => {
    try {
      return lamportsToSolString(BigInt(tip.amount) as unknown as bigint);
    } catch {
      return tip.amount;
    }
  }, [tip.amount]);

  async function onCancel() {
    if (!signer || !wallet?.account.address) return;
    setCancelling(true);
    try {
      const ix = buildCancelTipInstruction({
        sender: wallet.account.address as Address,
        payload: {
          tipIdBytes: tip.tipIdBytes,
          escrowPda: tip.tipEscrowPda ?? "",
          programId:
            process.env.NEXT_PUBLIC_PROGRAM_ID ??
            "GhsTipQhNGUc8vN3WtNpe6VbMTaZh6UgJcy3q8LjMXyE",
        },
      });
      const sig = await send({ instructions: [ix] });
      try {
        await fetchJson(`/api/tips/${tip.id}/cancel`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            senderWallet: wallet.account.address,
            txSignature: sig,
          }),
        });
        toast.success("Tip cancelled. Funds returned.");
        updateTip(tip.id, { status: "CANCELLED" });
        onUpdated();
      } catch (err) {
        toast.error(
          err instanceof ApiCallError ? err.message : "Cancel failed"
        );
      }
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Cancel failed");
    } finally {
      setCancelling(false);
      setConfirmingCancel(false);
    }
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-surface p-6">
      <AmbientGlow status={status} />

      {/* Header */}
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-subtle">
            Tip to
          </p>
          <p className="mt-1 font-mono text-lg">
            @{tip.recipientHandleValue}
          </p>
        </div>
        <Badge tone={statusBadgeTone(status)}>
          {statusBadgeLabel(status)}
        </Badge>
      </div>

      {/* Amount */}
      <div className="relative mt-8">
        <p className="text-xs uppercase tracking-widest text-subtle">
          Amount
        </p>
        <p className="mt-1 font-mono text-5xl font-semibold tabular-nums">
          {solString}{" "}
          <span className="text-xl font-normal text-muted">SOL</span>
        </p>
      </div>

      {/* Countdown or terminal state */}
      <div className="relative mt-6">
        {isActive ? (
          <div>
            <p className="text-xs uppercase tracking-widest text-subtle">
              Claim window
            </p>
            <div className="mt-2">
              <CountdownTimer expiryAt={tip.expiryAt} onExpire={onUpdated} />
            </div>
          </div>
        ) : (
          <TerminalStateLine tip={tip} />
        )}
      </div>

      {/* Claim link (sender view, while CLAIMABLE) */}
      {isOwner && isActive && claimLink && (
        <div className="relative mt-6 rounded-xl border border-border bg-background px-4 py-3">
          <p className="text-xs uppercase tracking-widest text-subtle">
            Claim link
          </p>
          <div className="mt-2 flex items-center gap-3">
            <p className="flex-1 truncate font-mono text-xs text-foreground">
              {claimLink}
            </p>
            <CopyButton value={claimLink} label="Copy" />
          </div>
          <p className="mt-2 text-[11px] text-muted">
            Share only with @{tip.recipientHandleValue}. They&apos;ll need to
            verify with X before funds unlock.
          </p>
        </div>
      )}

      {/* Memo */}
      {tip.memo && (
        <div className="relative mt-4 rounded-xl border border-border bg-background px-4 py-3">
          <p className="text-xs uppercase tracking-widest text-subtle">
            Message
          </p>
          <p className="mt-1 text-sm text-foreground">{tip.memo}</p>
        </div>
      )}

      {/* Tx signatures */}
      <div className="relative mt-4 flex flex-wrap gap-2 text-[11px]">
        {tip.txSignature && (
          <TxChip
            label="Deposit"
            sig={tip.txSignature}
            url={getExplorerUrl(`/tx/${tip.txSignature}`)}
          />
        )}
        {tip.claimTxSignature && (
          <TxChip
            label="Claim"
            sig={tip.claimTxSignature}
            url={getExplorerUrl(`/tx/${tip.claimTxSignature}`)}
          />
        )}
        {tip.refundTxSignature && (
          <TxChip
            label="Refund"
            sig={tip.refundTxSignature}
            url={getExplorerUrl(`/tx/${tip.refundTxSignature}`)}
          />
        )}
      </div>

      {/* Sender actions */}
      {isOwner && isActive && (
        <div className="relative mt-6 border-t border-border pt-5">
          <AnimatePresence mode="wait">
            {!confirmingCancel ? (
              <motion.button
                key="cancel"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setConfirmingCancel(true)}
                className="text-xs text-muted underline-offset-4 hover:text-danger hover:underline"
              >
                Cancel this tip
              </motion.button>
            ) : (
              <motion.div
                key="confirm"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                className="flex items-center justify-between gap-3"
              >
                <p className="text-xs text-muted">
                  You&apos;ll be refunded on-chain. Sure?
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setConfirmingCancel(false)}
                    disabled={cancelling}
                  >
                    Keep it live
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={onCancel}
                    loading={cancelling}
                  >
                    Yes, cancel
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {isDone && (
        <div className="relative mt-6 border-t border-border pt-4 text-[11px] text-muted">
          Created {new Date(tip.createdAt).toLocaleString()} · Tip ID{" "}
          <span className="font-mono">{ellipsify(tip.id, 6)}</span>
        </div>
      )}
    </div>
  );
}

function AmbientGlow({ status }: { status: TipStatus }) {
  const colors: Partial<Record<TipStatus, string>> = {
    CLAIMABLE:
      "radial-gradient(circle at 20% 0%, rgba(124,106,247,0.35), transparent 55%)",
    CLAIMED:
      "radial-gradient(circle at 20% 0%, rgba(78,205,196,0.32), transparent 55%)",
    REFUNDED:
      "radial-gradient(circle at 20% 0%, rgba(78,205,196,0.15), transparent 55%)",
    EXPIRED:
      "radial-gradient(circle at 20% 0%, rgba(255,255,255,0.05), transparent 55%)",
    CANCELLED:
      "radial-gradient(circle at 20% 0%, rgba(255,255,255,0.05), transparent 55%)",
    FAILED:
      "radial-gradient(circle at 20% 0%, rgba(255,107,107,0.2), transparent 55%)",
  };
  const bg = colors[status] ?? colors.CLAIMABLE!;
  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{ background: bg }}
    />
  );
}

function TxChip({
  label,
  sig,
  url,
}: {
  label: string;
  sig: string;
  url: string;
}) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-raised px-3 py-1 font-mono text-muted transition hover:text-foreground"
    >
      <span className="uppercase tracking-[0.12em] text-subtle">{label}</span>
      <span>{ellipsify(sig, 6)}</span>
    </a>
  );
}

function TerminalStateLine({ tip }: { tip: TipIntent }) {
  const status = tip.status;
  const when = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString() : "";
  if (status === "CLAIMED")
    return (
      <p className="text-sm text-[#7BE3DB]">
        Claimed {when(tip.claimedAt)}. Recipient now verified.
      </p>
    );
  if (status === "REFUNDED")
    return (
      <p className="text-sm text-muted">
        Auto-refunded {when(tip.refundedAt)} — recipient didn&apos;t claim.
      </p>
    );
  if (status === "EXPIRED")
    return (
      <p className="text-sm text-muted">
        Expired. Refund is queued on the next cron tick.
      </p>
    );
  if (status === "CANCELLED")
    return (
      <p className="text-sm text-muted">
        Cancelled {when(tip.cancelledAt)} · funds returned.
      </p>
    );
  if (status === "FAILED")
    return (
      <p className="text-sm text-danger">
        {tip.errorMessage ?? "Tip failed on-chain."}
      </p>
    );
  if (status === "PENDING")
    return <p className="text-sm text-muted">Awaiting on-chain confirmation…</p>;
  return null;
}
