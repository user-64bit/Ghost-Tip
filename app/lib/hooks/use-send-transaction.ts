"use client";

import { useState, useCallback, useMemo } from "react";
import { useSWRConfig } from "swr";
import {
  appendTransactionMessageInstructions,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createTransactionMessage,
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
            skipPreflight: skipPreflight ?? false,
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
