/**
 * Server-side Loyal client. Signs with the backend authority keypair —
 * used for read queries (is this user shielded? does this username
 * deposit exist?) and for operations we run on behalf of the user when
 * it's safe to (e.g. a periodic cleanup / claim-sweep for the recipient).
 *
 * User-authored operations (shield, delegate, private send) happen in the
 * browser with the user's wallet, not here.
 */

import {
  LoyalPrivateTransactionsClient,
  type ClientConfig,
} from "@loyal-labs/private-transactions";
import { Keypair, PublicKey } from "@solana/web3.js";
import { baseRpcEndpoint, perEndpoint } from "../loyal";
import type { ClusterMoniker } from "../solana-client";

let cachedKeypair: Keypair | null = null;

function loadAuthorityKeypair(): Keypair {
  if (cachedKeypair) return cachedKeypair;
  const raw = process.env.GHOSTTIP_AUTHORITY_KEYPAIR;
  if (!raw) throw new Error("GHOSTTIP_AUTHORITY_KEYPAIR not set");
  let parsed: number[];
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("GHOSTTIP_AUTHORITY_KEYPAIR must be a JSON byte array");
  }
  if (!Array.isArray(parsed) || parsed.length !== 64) {
    throw new Error("GHOSTTIP_AUTHORITY_KEYPAIR must be 64 bytes");
  }
  cachedKeypair = Keypair.fromSecretKey(new Uint8Array(parsed));
  return cachedKeypair;
}

/**
 * Build a Loyal client authenticated as the backend authority on the
 * given cluster. Expensive (fetches PER auth token on construction); the
 * caller should cache per request, not reuse globally because the
 * auth token has an expiry.
 */
export async function createServerLoyalClient(
  cluster: ClusterMoniker
): Promise<LoyalPrivateTransactionsClient> {
  const signer = loadAuthorityKeypair();
  const per = perEndpoint(cluster);
  const config: ClientConfig = {
    signer,
    baseRpcEndpoint: baseRpcEndpoint(cluster),
    ephemeralRpcEndpoint: per.rpc,
    ephemeralWsEndpoint: per.ws,
    commitment: "confirmed",
  };
  return LoyalPrivateTransactionsClient.fromConfig(config);
}

/**
 * Check whether a recipient username already has a delegated username
 * deposit for a given token on the PER. Used by the claim/receive flows
 * to decide whether a recipient needs to bootstrap before they can
 * withdraw.
 */
export async function usernameDepositReady(args: {
  cluster: ClusterMoniker;
  username: string;
  tokenMint: string;
}): Promise<{ ready: boolean; address: string | null; amount: string | null }> {
  const client = await createServerLoyalClient(args.cluster);
  const dep = await client.getEphemeralUsernameDeposit(
    args.username,
    new PublicKey(args.tokenMint)
  );
  if (!dep) return { ready: false, address: null, amount: null };
  return {
    ready: true,
    address: dep.address.toBase58(),
    amount: dep.amount.toString(),
  };
}

/**
 * Peek the sender's delegated deposit amount for a given token. Lets the
 * API tell the browser "you have 4.5 USDC shielded" before a send.
 */
export async function ephemeralDepositAmount(args: {
  cluster: ClusterMoniker;
  user: string;
  tokenMint: string;
}): Promise<string | null> {
  const client = await createServerLoyalClient(args.cluster);
  const dep = await client.getEphemeralDeposit(
    new PublicKey(args.user),
    new PublicKey(args.tokenMint)
  );
  return dep ? dep.amount.toString() : null;
}
