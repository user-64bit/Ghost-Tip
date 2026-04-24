/**
 * Expiry job. Runs via:
 *   - Vercel Cron:   GET /api/cron/expiry (hits `runExpiryJob()` below)
 *   - Standalone:    bun run jobs/expiry.ts
 *
 * Responsibilities:
 *   - Find all CLAIMABLE tips whose expiry_at is in the past
 *   - Submit refund_tip on-chain with the backend authority
 *   - Update DB rows: CLAIMABLE → EXPIRED → REFUNDED
 *   - Emit AuditEvent entries for each transition
 */

import type { Address } from "@solana/kit";

export interface ExpiryJobResult {
  scanned: number;
  expired: number;
  refunded: number;
  failed: number;
  failures: Array<{ tipId: string; error: string }>;
  startedAt: string;
  finishedAt: string;
}

export async function runExpiryJob(): Promise<ExpiryJobResult> {
  const { prisma } = await import("../app/lib/server/prisma");
  const { submitRefundOnChain, deriveTipEscrowPda } = await import(
    "../app/lib/server/anchor"
  );
  const { emitAuditEvent } = await import("../app/lib/server/identity");
  const { tipIdFromHex } = await import("../app/lib/server/crypto");

  const startedAt = new Date();
  const result: ExpiryJobResult = {
    scanned: 0,
    expired: 0,
    refunded: 0,
    failed: 0,
    failures: [],
    startedAt: startedAt.toISOString(),
    finishedAt: "",
  };

  const now = new Date();
  const tips = await prisma.tipIntent.findMany({
    where: {
      status: "CLAIMABLE",
      expiryAt: { lt: now },
    },
    orderBy: { expiryAt: "asc" },
    take: 50,
  });
  result.scanned = tips.length;

  for (const tip of tips) {
    try {
      // Mark EXPIRED first so subsequent read paths see the right state.
      await prisma.tipIntent.update({
        where: { id: tip.id, status: "CLAIMABLE" },
        data: { status: "EXPIRED" },
      });
      result.expired++;

      await emitAuditEvent({
        actor: "cron:expiry",
        eventType: "tip_expired",
        refId: tip.id,
      });

      const tipIdBytes = tipIdFromHex(tip.tipIdBytes);
      const { pda: escrowPda } = await deriveTipEscrowPda(tipIdBytes);

      const { txSignature } = await submitRefundOnChain({
        tipIdBytes,
        sender: tip.senderWallet as Address,
        escrowPda,
      });

      await prisma.tipIntent.update({
        where: { id: tip.id },
        data: {
          status: "REFUNDED",
          refundedAt: new Date(),
          refundTxSignature: txSignature,
        },
      });
      await prisma.claimLink.updateMany({
        where: { tipIntent: { id: tip.id } },
        data: { revokedAt: new Date() },
      });
      result.refunded++;

      await emitAuditEvent({
        actor: "cron:expiry",
        eventType: "tip_refunded",
        refId: tip.id,
        metadata: { txSignature },
      });
    } catch (err) {
      result.failed++;
      const message = err instanceof Error ? err.message : String(err);
      result.failures.push({ tipId: tip.id, error: message });
      console.error("[expiry] failed", tip.id, err);
      await emitAuditEvent({
        actor: "cron:expiry",
        eventType: "transfer_failed",
        refId: tip.id,
        metadata: { error: message, phase: "refund" },
      });
    }
  }

  result.finishedAt = new Date().toISOString();
  return result;
}

/* Allow direct CLI execution. */
async function mainIfScript() {
  const isDirect =
    typeof require !== "undefined" && require.main === module;
  // `require.main === module` works in CommonJS; under ESM (bun), the
  // moduleURL === process.argv[1] check covers it. Both are OK because
  // `bun run jobs/expiry.ts` satisfies at least one.
  if (!isDirect) return;
  const r = await runExpiryJob();
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.failed > 0 ? 1 : 0);
}
void mainIfScript();
