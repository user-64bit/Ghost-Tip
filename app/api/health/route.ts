import { NextResponse } from "next/server";
import { validateEnv } from "../../lib/server/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lightweight health probe. Does NOT hit Postgres / Redis / Solana — it
 * only reflects the env validator's view of config, so a broken DB or a
 * stale Anchor deploy can't mask a missing env var.
 *
 * Response shape:
 *   { ok: true }                                         — healthy
 *   { ok: false, problems: [...], warnings: [...] }      — something to fix
 *
 * Safe to expose publicly: does not leak secret values, only var names +
 * hints that are identical to what .env.example already documents.
 */
export function GET() {
  const report = validateEnv();
  // Never return 500 from the probe itself — callers (uptime monitors,
  // Vercel's status page) want the boolean. 503 signals "not ready".
  return NextResponse.json(report, { status: report.ok ? 200 : 503 });
}
