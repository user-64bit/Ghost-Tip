"use client";

import { useState, useCallback, useMemo } from "react";
import { useSWRConfig } from "swr";
import {
  appendTransactionMessageInstructions,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  pipe,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Instruction,
} from "@solana/kit";
import { getSetComputeUnitLimitInstruction } from "@solana-program/compute-budget";
import { useWallet } from "../wallet/context";
import { useCluster } from "../../components/cluster-context";
import { getClusterUrl, getClusterWsConfig } from "../solana-client";

/**
 * Compute unit ceiling applied to every client-submitted transaction.
 *
 * Prior versions leaned on `@solana/kit-client-rpc`'s planner, which
 * auto-simulates + estimates CU and adds only a 10 % buffer. Two failure
 * modes we saw on devnet:
 *   1. "Computational budget exceeded (instruction #N)" — the 10 % margin
 *      was eaten by slot-to-slot runtime drift vs the simulation slot.
 *   2. "Failed to estimate the compute unit consumption …" — the
 *      estimation simulation itself failed for unrelated reasons (ATA not
 *      yet on-chain at the simulation slot, recent blockhash races, etc).
 *
 * Both go away when we set an explicit ceiling and skip the estimator
 * altogether. 400_000 is well above anything we emit client-side:
 *   System Transfer     ≈ 150 CU
 *   Anchor deposit_tip  ≈ 8–12 k CU (account init + system CPI)
 *   Anchor cancel_tip   ≈ 5 k CU
 * With no priority fee configured, a higher ceiling costs the user
 * nothing — it just raises the transaction's CU cap.
 */
const DEFAULT_COMPUTE_UNIT_LIMIT = 400_000;

export interface SendOptions {
  instructions: readonly Instruction[];
  /**
   * Override the default CU ceiling. Pass `null` to skip the prepend
   * (useful when the caller has already prepared their own budget ixs).
   */
  computeUnits?: number | null;
  /**
   * `true` asks the validator to bypass preflight simulation. We default
   * to `false` so surfaces like "insufficient balance" come back with a
   * readable error instead of `TransactionExpiredBlockheightExceededError`.
   */
  skipPreflight?: boolean;
}

export function useSendTransaction() {
  const { signer } = useWallet();
  const { cluster } = useCluster();
  const { mutate } = useSWRConfig();
  const [isSending, setIsSending] = useState(false);

  // rpc / rpcSubscriptions are light objects but keying them on the
  // cluster keeps the instances stable across renders and lets kit's
  // subscriptions dedupe their upstream connections.
  const rpcBundle = useMemo(() => {
    const url = getClusterUrl(cluster);
    const wsCfg = getClusterWsConfig(cluster);
    const wsUrl = wsCfg?.url ?? toWs(url);
    return {
      rpc: createSolanaRpc(url),
      rpcSubscriptions: createSolanaRpcSubscriptions(wsUrl),
    };
  }, [cluster]);

  const send = useCallback(
    async ({ instructions, computeUnits, skipPreflight }: SendOptions) => {
      if (!signer) throw new Error("Wallet not connected");

      setIsSending(true);
      try {
        const ixs: Instruction[] = [...instructions];
        const withBudget =
          computeUnits === null
            ? ixs
            : [
                getSetComputeUnitLimitInstruction({
                  units: computeUnits ?? DEFAULT_COMPUTE_UNIT_LIMIT,
                }),
                ...ixs,
              ];

        const { rpc, rpcSubscriptions } = rpcBundle;
        const { value: latestBlockhash } = await rpc
          .getLatestBlockhash({ commitment: "confirmed" })
          .send();

        const message = pipe(
          createTransactionMessage({ version: 0 }),
          (m) => setTransactionMessageFeePayerSigner(signer, m),
          (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
          (m) => appendTransactionMessageInstructions(withBudget, m)
        );

        const signedTx = await signTransactionMessageWithSigners(message);
        const signature = getSignatureFromTransaction(signedTx);

        // Proactive simulation — surfaces the failing instruction's logs
        // before we ever hit the slower sendAndConfirm path, so a user
        // sees "Not enough SOL for fee" instead of the opaque
        // "Transaction simulation failed" the RPC returns on preflight.
        if (!(skipPreflight ?? false)) {
          const wire = getBase64EncodedWireTransaction(signedTx);
          const sim = await rpc
            .simulateTransaction(wire, {
              commitment: "confirmed",
              encoding: "base64",
              replaceRecentBlockhash: false,
              sigVerify: false,
            })
            .send();
          if (sim.value.err) {
            if (sim.value.logs) {
              // eslint-disable-next-line no-console
              console.warn(
                "[simulate] failed — logs:\n" + sim.value.logs.join("\n")
              );
            }
            throw buildSimulationError(sim.value.err, sim.value.logs ?? null);
          }
        }

        const sendAndConfirm = sendAndConfirmTransactionFactory({
          rpc,
          rpcSubscriptions,
        });
        // `signTransactionMessageWithSigners` widens the lifetime type to a
        // union; we built the message with a blockhash lifetime so the cast
        // is safe. Mirrors the server-side authority submission helper.
        await sendAndConfirm(
          signedTx as Parameters<typeof sendAndConfirm>[0],
          {
            commitment: "confirmed",
            // We already simulated above, so skipPreflight here avoids
            // a redundant server-side simulation on the happy path.
            skipPreflight: true,
          }
        );

        // Nudge the balance SWR key so the wallet button reflects the spend.
        mutate((key: unknown) => Array.isArray(key) && key[0] === "balance");

        return signature;
      } finally {
        setIsSending(false);
      }
    },
    [signer, rpcBundle, mutate]
  );

  return { send, isSending };
}

function toWs(url: string): string {
  return url.replace(/^https:/i, "wss:").replace(/^http:/i, "ws:");
}

/**
 * Turn a simulation-result `err` into a regular Error whose message
 * classifies common failure modes (insufficient funds, program custom
 * error, bad instruction, etc.) so `parseTransactionError` can surface
 * something actionable to the user. The raw Solana TransactionError
 * shape is a tagged enum; we only need to read the common variants.
 */
function buildSimulationError(
  simErr: unknown,
  logs: readonly string[] | null
): Error {
  const tag = readErrorTag(simErr);
  const detail = detailFromLogs(logs);
  const base =
    tag === "InsufficientFundsForFee"
      ? "Wallet can't cover the network fee"
      : tag === "InsufficientFundsForRent"
        ? "Transfer would leave an account below rent-exempt minimum"
        : tag === "AccountNotFound"
          ? "Recipient or signer account doesn't exist on this cluster"
          : tag === "BlockhashNotFound"
            ? "Transaction expired before confirming — retry"
            : tag === "AlreadyProcessed"
              ? "This transaction was already processed"
              : tag === "SignatureFailure"
                ? "Signature verification failed — reconnect the wallet"
                : tag === "InstructionError"
                  ? extractInstructionError(simErr) ??
                    "Program rejected the instruction"
                  : "Preflight simulation failed";
  const msg = detail ? `${base} — ${detail}` : base;
  const e = new Error(msg);
  // Preserve the simulation payload as the cause so the error-classifier
  // in parseTransactionError can pick up custom program codes etc.
  (e as Error & { cause?: unknown }).cause = simErr;
  return e;
}

function readErrorTag(simErr: unknown): string | null {
  if (typeof simErr === "string") return simErr;
  if (simErr && typeof simErr === "object") {
    const keys = Object.keys(simErr as Record<string, unknown>);
    if (keys.length > 0) return keys[0];
  }
  return null;
}

function extractInstructionError(simErr: unknown): string | null {
  // Shape: { InstructionError: [ixIndex, <err>] }
  if (simErr && typeof simErr === "object" && "InstructionError" in simErr) {
    const payload = (simErr as { InstructionError: unknown }).InstructionError;
    if (Array.isArray(payload) && payload.length === 2) {
      const [idx, inner] = payload;
      if (typeof inner === "string") return `ix #${idx}: ${inner}`;
      if (inner && typeof inner === "object") {
        if ("Custom" in inner)
          return `ix #${idx}: custom error ${
            (inner as { Custom: number }).Custom
          }`;
        const tag = readErrorTag(inner);
        if (tag) return `ix #${idx}: ${tag}`;
      }
    }
  }
  return null;
}

function detailFromLogs(logs: readonly string[] | null): string | null {
  if (!logs || logs.length === 0) return null;
  // The last 1–2 lines usually carry the explanation; walk up looking for
  // "Error:" / "failed" markers, otherwise return the final program log.
  for (let i = logs.length - 1; i >= Math.max(0, logs.length - 6); i--) {
    const line = logs[i];
    if (/error|failed|insufficient|rejected/i.test(line)) {
      return line.replace(/^Program log:\s*/i, "").slice(0, 160);
    }
  }
  return logs[logs.length - 1].replace(/^Program log:\s*/i, "").slice(0, 160);
}
