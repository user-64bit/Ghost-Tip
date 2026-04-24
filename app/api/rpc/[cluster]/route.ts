import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Same-origin JSON-RPC proxy.
 *
 * Browsers can't hit most public Solana RPCs reliably — CORS, rate limits
 * and 403s are routine. The server-to-server path works fine for the same
 * endpoints, so we forward the JSON-RPC payload from the browser, stamp
 * the proper Content-Type, and relay the response.
 *
 * Configure real endpoints via server-only env vars (keep API keys off the
 * client):
 *   MAINNET_RPC_URL   (default: https://api.mainnet-beta.solana.com)
 *   DEVNET_RPC_URL    (default: https://api.devnet.solana.com)
 *   TESTNET_RPC_URL   (default: https://api.testnet.solana.com)
 *   LOCALNET_RPC_URL  (default: http://localhost:8899)
 */

type Cluster = "mainnet" | "devnet" | "testnet" | "localnet";

const DEFAULTS: Record<Cluster, string> = {
  mainnet: "https://api.mainnet-beta.solana.com",
  devnet: "https://api.devnet.solana.com",
  testnet: "https://api.testnet.solana.com",
  localnet: "http://localhost:8899",
};

function upstreamFor(cluster: Cluster): string {
  const envKey = `${cluster.toUpperCase()}_RPC_URL` as const;
  return (
    (process.env[envKey as keyof NodeJS.ProcessEnv] as string | undefined) ??
    process.env.SOLANA_RPC_URL ??
    DEFAULTS[cluster]
  );
}

function isCluster(value: string): value is Cluster {
  return ["mainnet", "devnet", "testnet", "localnet"].includes(value);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ cluster: string }> }
) {
  const { cluster } = await params;
  if (!isCluster(cluster)) {
    return NextResponse.json(
      { jsonrpc: "2.0", error: { code: -32601, message: "unknown cluster" } },
      { status: 400 }
    );
  }
  const upstream = upstreamFor(cluster);
  const body = await req.text();

  try {
    const res = await fetch(upstream, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      cache: "no-store",
    });
    const data = await res.text();
    return new NextResponse(data, {
      status: res.status,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        error: { code: -32603, message: `upstream error: ${message}` },
      },
      { status: 502 }
    );
  }
}

// Solana's JSON-RPC is POST-only, but some tooling probes with OPTIONS/GET.
// Reply 200 for OPTIONS (CORS pre-flight); 405 everywhere else.
export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
