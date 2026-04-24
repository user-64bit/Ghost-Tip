/**
 * Loyal Network SDK glue for GhostTip.
 *
 * Docs: https://docs.askloyal.com/sdk/private-transactions/quick-start
 *
 * Model: Loyal wraps MagicBlock's Private Ephemeral Rollups (PER) so SPL
 * tokens can be shielded into a Deposit PDA, delegated to a TEE validator,
 * and moved privately between users or into username-keyed deposits. It is
 * NOT a one-call "send SOL privately" primitive — it is an SPL-only
 * shielded-balance system.
 *
 * We use it for the DIRECT_SEND path (warm recipient in IdentityMap) when
 * the token is SPL. For native SOL or cold recipients we fall back to our
 * Anchor escrow + claim-link flow.
 */

import type { ClusterMoniker } from "./solana-client";

/** MagicBlock TEE (PER) endpoints, per the Loyal quick-start. */
export const PER_ENDPOINTS: Record<
  ClusterMoniker,
  { rpc: string; ws: string } | null
> = {
  // Loyal ships a single devnet-facing TEE and a mainnet TEE.
  devnet: {
    rpc: "https://tee.magicblock.app",
    ws: "wss://tee.magicblock.app",
  },
  mainnet: {
    rpc: "https://mainnet-tee.magicblock.app",
    ws: "wss://mainnet-tee.magicblock.app",
  },
  testnet: null,
  localnet: null,
};

/**
 * Canonical SPL mints we route through Loyal. We ship USDC by default
 * because it's the widest-supported stable across Loyal + MagicBlock
 * reserves; the TipForm token picker is the entry point for others.
 */
export const SPL_MINTS: Record<
  ClusterMoniker,
  { symbol: string; address: string; decimals: number }[]
> = {
  mainnet: [
    {
      symbol: "USDC",
      address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      decimals: 6,
    },
  ],
  devnet: [
    {
      // The mint Loyal currently uses in their devnet environment.
      symbol: "USDC",
      address: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
      decimals: 6,
    },
  ],
  testnet: [],
  localnet: [],
};

export const NATIVE_SOL_MINT =
  "So11111111111111111111111111111111111111112";

export function isNativeSolMint(mint: string): boolean {
  return mint === NATIVE_SOL_MINT;
}

export function isLoyalSupportedCluster(
  cluster: ClusterMoniker
): cluster is "mainnet" | "devnet" {
  return cluster === "mainnet" || cluster === "devnet";
}

/** Look up an SPL token by mint for the active cluster. */
export function splTokenFor(
  cluster: ClusterMoniker,
  mint: string
):
  | { symbol: string; address: string; decimals: number }
  | undefined {
  return SPL_MINTS[cluster].find((t) => t.address === mint);
}

/**
 * Decide which settlement rail to use for a DIRECT_SEND.
 * - SPL + supported cluster → Loyal (private).
 * - Native SOL or unsupported cluster → native system transfer (public).
 *
 * Returns 'loyal' | 'native'.
 */
export function chooseRail(
  cluster: ClusterMoniker,
  tokenMint: string
): "loyal" | "native" {
  if (isNativeSolMint(tokenMint)) return "native";
  if (!isLoyalSupportedCluster(cluster)) return "native";
  if (!splTokenFor(cluster, tokenMint)) return "native";
  return "loyal";
}

/** Base (Solana) RPC the browser should hand to Loyal. */
export function baseRpcEndpoint(cluster: ClusterMoniker): string {
  // Loyal needs a raw HTTPS endpoint, not our same-origin proxy — the SDK
  // talks directly to Anchor / program accounts. Hit the public endpoint
  // here; it works from the browser for the read flows Loyal performs.
  if (cluster === "mainnet") return "https://api.mainnet-beta.solana.com";
  if (cluster === "devnet") return "https://api.devnet.solana.com";
  if (cluster === "testnet") return "https://api.testnet.solana.com";
  return "http://localhost:8899";
}

export function perEndpoint(
  cluster: ClusterMoniker
): { rpc: string; ws: string } {
  const ep = PER_ENDPOINTS[cluster];
  if (!ep) {
    throw new Error(
      `Loyal PER is not available on ${cluster}; direct private sends are mainnet or devnet only.`
    );
  }
  return ep;
}
