"use client";

import { useState, useCallback, useMemo } from "react";
import { useSWRConfig } from "swr";
import type { Instruction } from "@solana/kit";
import { createClient } from "@solana/kit-client-rpc";
import {
  findSetComputeUnitLimitInstructionIndexAndUnits,
  getSetComputeUnitLimitInstruction,
} from "@solana-program/compute-budget";
import { useWallet } from "../wallet/context";
import { useCluster } from "../../components/cluster-context";
import { getClusterUrl, getClusterWsConfig } from "../solana-client";

/**
 * Default compute unit ceiling for client-initiated GhostTip transactions.
 *
 * The kit executor's default behaviour is to simulate the transaction and
 * set the CU limit to `estimatedUnits * 1.1` — a 10 % buffer. For simple
 * transactions (a plain System Program transfer consumes ~150 CU) that
 * margin can be eaten by real-slot drift versus the simulation slot and
 * the tx fails with "Computational budget exceeded (instruction #N)" —
 * which was the regression reported with "0.1 SOL → warm recipient".
 *
 * Setting an explicit, comfortable ceiling makes the executor skip its
 * estimator entirely (see `needsComputeUnitEstimation` in
 * `@solana/kit-plugin-rpc` — it only estimates when no limit is set, or
 * when the set value is the provisory 0 or the max 1_400_000).
 *
 * 400_000 is more than enough for every ix GhostTip sends client-side:
 *   - System Program Transfer    ≈ 150 CU
 *   - Anchor `deposit_tip`       ≈ 8–12 k CU (init + system CPI)
 *   - Anchor `cancel_tip`        ≈ 5 k CU
 * With no priority fee configured, setting 400_000 costs the user nothing
 * and gives the validator plenty of headroom for future runtime changes.
 */
const DEFAULT_COMPUTE_UNIT_LIMIT = 400_000;

export interface SendOptions {
  instructions: readonly Instruction[];
  /**
   * Override the default CU ceiling. Callers can opt out by passing
   * a value that matches the executor's "needs estimation" signal
   * (0 or 1_400_000), but there's rarely a reason to.
   */
  computeUnits?: number;
}

export function useSendTransaction() {
  const { signer } = useWallet();
  const { cluster } = useCluster();
  const { mutate } = useSWRConfig();
  const [isSending, setIsSending] = useState(false);

  const txClient = useMemo(
    () =>
      signer
        ? createClient({
            url: getClusterUrl(cluster),
            rpcSubscriptionsConfig: getClusterWsConfig(cluster),
            payer: signer,
          })
        : null,
    [cluster, signer]
  );

  const send = useCallback(
    async ({ instructions, computeUnits }: SendOptions) => {
      if (!txClient) throw new Error("Wallet not connected");

      setIsSending(true);
      try {
        const withBudget = ensureComputeUnitLimit(
          instructions,
          computeUnits ?? DEFAULT_COMPUTE_UNIT_LIMIT
        );
        const result = await txClient.sendTransaction(withBudget);
        mutate((key: unknown) => Array.isArray(key) && key[0] === "balance");
        return result.context.signature;
      } finally {
        setIsSending(false);
      }
    },
    [txClient, mutate]
  );

  return { send, isSending };
}

/**
 * Prepend a `SetComputeUnitLimit` instruction iff the caller hasn't already
 * provided one. We use the generated builder from `@solana-program/compute-
 * budget` so the instruction is byte-identical to what kit itself emits.
 *
 * Implementation note: the kit planner's `findSetComputeUnitLimitInstruction
 * IndexAndUnits` works on a `TransactionMessage`, not on a raw instruction
 * array — so we do a cheap program-address scan here instead.
 */
function ensureComputeUnitLimit(
  instructions: readonly Instruction[],
  units: number
): Instruction[] {
  if (hasComputeUnitLimit(instructions)) {
    return [...instructions];
  }
  return [getSetComputeUnitLimitInstruction({ units }), ...instructions];
}

// Compute-budget program ID. Matches the constant the kit planner uses via
// `findSetComputeUnitLimitInstructionIndexAndUnits`; kept inline so we don't
// have to import the whole module for one string compare.
const COMPUTE_BUDGET_PROGRAM_ID =
  "ComputeBudget111111111111111111111111111111";
// Discriminator for SetComputeUnitLimit (u8 variant index `2`).
const SET_COMPUTE_UNIT_LIMIT_DISC = 2;

function hasComputeUnitLimit(instructions: readonly Instruction[]): boolean {
  for (const ix of instructions) {
    if (
      (ix.programAddress as string) === COMPUTE_BUDGET_PROGRAM_ID &&
      ix.data &&
      ix.data.length > 0 &&
      ix.data[0] === SET_COMPUTE_UNIT_LIMIT_DISC
    ) {
      return true;
    }
  }
  return false;
}

// Keep the kit helper reachable in case callers want to introspect an
// already-planned message without re-running the logic above.
export { findSetComputeUnitLimitInstructionIndexAndUnits };
