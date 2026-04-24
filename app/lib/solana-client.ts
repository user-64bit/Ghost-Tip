import { createEmptyClient } from "@solana/kit";
import { rpc, rpcAirdrop } from "@solana/kit-plugin-rpc";

export type ClusterMoniker = "devnet" | "testnet" | "mainnet" | "localnet";

export const CLUSTERS: ClusterMoniker[] = [
  "devnet",
  "testnet",
  "mainnet",
  "localnet",
];

/**
 * Browser-side RPC URL resolution.
 *
 * Default strategy: route through `/api/rpc/<cluster>` — a same-origin
 * server proxy that forwards JSON-RPC to the real endpoint from the server,
 * where public RPCs work without CORS and without browser rate-limits.
 *
 * Escape hatch: set `NEXT_PUBLIC_SOLANA_RPC_URL` (for the active cluster)
 * or `NEXT_PUBLIC_SOLANA_RPC_<CLUSTER>` (per-cluster) to bypass the proxy
 * and hit your own RPC directly from the browser.
 */

function envOverride(cluster: ClusterMoniker): string | undefined {
  if (typeof process === "undefined") return undefined;
  const perCluster =
    process.env[
      `NEXT_PUBLIC_SOLANA_RPC_${cluster.toUpperCase()}` as keyof NodeJS.ProcessEnv
    ];
  if (perCluster) return perCluster;
  const activeCluster = process.env.NEXT_PUBLIC_SOLANA_NETWORK;
  if (activeCluster === cluster && process.env.NEXT_PUBLIC_SOLANA_RPC_URL) {
    return process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
  }
  return undefined;
}

function proxyUrl(cluster: ClusterMoniker): string {
  // Build an absolute URL so the kit's RPC fetch works during SSR and in
  // whatever frame it's instantiated under. In the browser we use the
  // current origin; on the server we fall back to NEXT_PUBLIC_APP_URL.
  if (typeof window !== "undefined") {
    return `${window.location.origin}/api/rpc/${cluster}`;
  }
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") ??
    "http://localhost:3000";
  return `${base}/api/rpc/${cluster}`;
}

const DEFAULT_WS: Record<ClusterMoniker, string> = {
  devnet: "wss://api.devnet.solana.com",
  testnet: "wss://api.testnet.solana.com",
  mainnet: "wss://api.mainnet-beta.solana.com",
  localnet: "ws://localhost:8900",
};

function toWs(url: string): string {
  return url.replace(/^https:/i, "wss:").replace(/^http:/i, "ws:");
}

export function getClusterUrl(cluster: ClusterMoniker): string {
  const override = envOverride(cluster);
  if (override) return override;
  if (cluster === "localnet") return "http://localhost:8899";
  return proxyUrl(cluster);
}

export function getClusterWsConfig(
  cluster: ClusterMoniker
): { url: string } | undefined {
  const override = envOverride(cluster);
  if (override && !override.startsWith("/")) {
    return { url: toWs(override) };
  }
  if (cluster === "localnet") return { url: DEFAULT_WS[cluster] };
  // We don't proxy websockets (subscription streams) — kit will fall back
  // to the http plugin's derived ws endpoint. If that endpoint rejects,
  // SWR polling still keeps balances fresh every 60s.
  return { url: DEFAULT_WS[cluster] };
}

export function createSolanaClient(cluster: ClusterMoniker) {
  const url = getClusterUrl(cluster);
  const wsCfg = getClusterWsConfig(cluster);
  const base = createEmptyClient();
  const withRpc = wsCfg ? base.use(rpc(url, { url: wsCfg.url })) : base.use(rpc(url));
  return withRpc.use(rpcAirdrop());
}

export type SolanaClient = ReturnType<typeof createSolanaClient>;
