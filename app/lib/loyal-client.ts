"use client";

/**
 * Browser-side Loyal client for GhostTip's DIRECT_SEND rail.
 *
 * High-level flow for a warm-handle private send (SPL token path):
 *   1. Ensure the sender's base-chain Deposit PDA exists (initializeDeposit).
 *   2. Ensure the desired amount is shielded into it (modifyBalance +
 *      createPermission + delegateDeposit if not yet delegated).
 *   3. Ensure the recipient's username deposit exists + is delegated. If
 *      not, the server kicks that off using the backend authority; we just
 *      wait here.
 *   4. transferToUsernameDeposit — the actual private move on PER.
 *
 * Each SDK call is its own on-chain tx (they target different accounts /
 * programs), so the user may sign multiple prompts the very first time
 * they use a token. On subsequent sends steps (1)–(2) are no-ops and it's
 * a single prompt for the transfer.
 */

import {
  LoyalPrivateTransactionsClient,
  ER_VALIDATOR,
  ER_VALIDATOR_MAINNET,
  type ClientConfig,
  type WalletLike,
} from "@loyal-labs/private-transactions";
import { PublicKey } from "@solana/web3.js";
import type { ClusterMoniker } from "./solana-client";
import { baseRpcEndpoint, perEndpoint } from "./loyal";

export async function createBrowserLoyalClient(args: {
  wallet: WalletLike;
  cluster: ClusterMoniker;
}): Promise<LoyalPrivateTransactionsClient> {
  const per = perEndpoint(args.cluster);
  const config: ClientConfig = {
    signer: args.wallet,
    baseRpcEndpoint: baseRpcEndpoint(args.cluster),
    ephemeralRpcEndpoint: per.rpc,
    ephemeralWsEndpoint: per.ws,
    commitment: "confirmed",
  };
  return LoyalPrivateTransactionsClient.fromConfig(config);
}

export function validatorFor(cluster: ClusterMoniker): PublicKey {
  return cluster === "mainnet" ? ER_VALIDATOR_MAINNET : ER_VALIDATOR;
}

export interface PrivateSendArgs {
  client: LoyalPrivateTransactionsClient;
  cluster: ClusterMoniker;
  sender: PublicKey;
  senderTokenAccount: PublicKey;
  recipientUsername: string;
  tokenMint: PublicKey;
  /** Raw token amount (already scaled to mint decimals). */
  amount: bigint;
  /** Called before each SDK step so the UI can show "Signing 1 of N…" */
  onStep?: (step: PrivateSendStep) => void;
}

export type PrivateSendStep =
  | "init-deposit"
  | "shield"
  | "permission"
  | "delegate"
  | "transfer";

export interface PrivateSendResult {
  transferSignature: string;
  shieldedFirstTime: boolean;
  steps: PrivateSendStep[];
}

/**
 * Runs the full shield-then-transfer flow. Idempotent by construction —
 * the SDK's init / permission / delegate calls short-circuit when state
 * is already present.
 */
export async function privateSendToUsername(
  args: PrivateSendArgs
): Promise<PrivateSendResult> {
  const {
    client,
    cluster,
    sender,
    senderTokenAccount,
    recipientUsername,
    tokenMint,
    amount,
    onStep,
  } = args;

  const steps: PrivateSendStep[] = [];
  const validator = validatorFor(cluster);

  // 1. Ensure sender's base deposit exists. Safe to call unconditionally —
  // the SDK returns a no-op signature when the account is already there.
  const existingBase = await client.getBaseDeposit(sender, tokenMint);
  const alreadyShielded =
    existingBase !== null && existingBase.amount >= amount;

  if (!existingBase) {
    onStep?.("init-deposit");
    steps.push("init-deposit");
    await client.initializeDeposit({
      user: sender,
      tokenMint,
      payer: sender,
    });
  }

  // 2. Shield enough tokens to cover the send if we're short. If the
  // deposit is already delegated on PER, modifyBalance would fail — so
  // top-ups to a delegated deposit aren't supported by this helper.
  // That's fine: a user who has sent once has a permanent delegated
  // balance that they keep topped up off-flow.
  if (!alreadyShielded && !existingBase) {
    onStep?.("shield");
    steps.push("shield");
    await client.modifyBalance({
      user: sender,
      tokenMint,
      userTokenAccount: senderTokenAccount,
      amount,
      increase: true,
      payer: sender,
    });
  }

  // 3. Ensure the deposit has a permission record. createPermission is
  // idempotent via the SDK's internal permissionAccountExists check.
  onStep?.("permission");
  steps.push("permission");
  await client.createPermission({
    user: sender,
    tokenMint,
    payer: sender,
  });

  // 4. Delegate to PER if not yet delegated. The SDK will early-return
  // when already delegated.
  const delegStatus = await client
    .getAccountDelegationStatus(
      // Use the user's deposit PDA as the key. The SDK's findDepositPda
      // helper is re-exported in the package.
      (await import("@loyal-labs/private-transactions")).findDepositPda(
        client.getProgramId(),
        sender,
        tokenMint
      )[0]
    )
    .catch(() => null);

  if (!delegStatus?.result.isDelegated) {
    onStep?.("delegate");
    steps.push("delegate");
    await client.delegateDeposit({
      user: sender,
      tokenMint,
      payer: sender,
      validator,
    });
  }

  // 5. Transfer on PER. This is the step that's actually private.
  onStep?.("transfer");
  steps.push("transfer");
  const transferSignature = await client.transferToUsernameDeposit({
    username: recipientUsername,
    tokenMint,
    amount,
    user: sender,
    payer: sender,
    sessionToken: null,
  });

  return {
    transferSignature,
    shieldedFirstTime: !existingBase,
    steps,
  };
}
