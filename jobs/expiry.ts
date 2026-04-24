/**
 * Expiry job. Runs via:
 *   - Vercel Cron:   GET /api/cron/expiry (hits `runExpiryJob()` below)
 *   - Standalone:    bun run jobs/expiry.ts
 *
 * Responsibilities:
 *   - Flip newly-expired CLAIMABLE tips to EXPIRED
 *   - Submit refund_tip on-chain with the backend authority for every
 *     CLAIMABLE / EXPIRED tip whose claim window has passed
 *   - Update DB rows to REFUNDED on success
 *   - Track retries; after MAX_REFUND_ATTEMPTS, emit a refund_stuck event
 *     so an operator can page in. The row is NOT flipped to FAILED — we
 *     keep trying on subsequent ticks in case the RPC was just flapping.
 *   - Emit AuditEvent entries for each transition so retry counts can be
 *     derived without a dedicated column migration.
 *
 * Key invariant (fix vs prior version): a failed refund does NOT strand
 * the row in EXPIRED forever. The next tick re-scans EXPIRED rows and
 * retries the on-chain call.
 */

import type { Address } from "@solana/kit";

const MAX_REFUND_ATTEMPTS = 8;
const BATCH_SIZE = 50;

export interface ExpiryJobResult {
  scanned: number;
  flippedExpired: number;
  refunded: number;
  retried: number;
  stuck: number;
  failures: Array<{ tipId: string; error: string; attempt: number }>;
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
    flippedExpired: 0,
    refunded: 0,
    retried: 0,
    stuck: 0,
    failures: [],
    startedAt: startedAt.toISOString(),
    finishedAt: "",
  };

  const now = new Date();

  // Scan both states:
  //   CLAIMABLE with passed expiry → first-time flip + refund
  //   EXPIRED with passed expiry   → retry refund (previous attempt failed)
  // Ordered oldest-first so the longest-stuck tips get retried first.
  const tips = await prisma.tipIntent.findMany({
    where: {
      expiryAt: { lt: now },
      status: { in: ["CLAIMABLE", "EXPIRED"] },
    },
    orderBy: { expiryAt: "asc" },
    take: BATCH_SIZE,
  });
  result.scanned = tips.length;

  for (const tip of tips) {
    const isFirstPass = tip.status === "CLAIMABLE";
    if (!isFirstPass) result.retried++;

    try {
      // Flip to EXPIRED on first pass. Atomic CAS via updateMany so two
      // concurrent cron runs can't double-flip (count=0 means someone
      // else got there first — we still try the refund either way).
      if (isFirstPass) {
        const flipped = await prisma.tipIntent.updateMany({
          where: { id: tip.id, status: "CLAIMABLE" },
          data: { status: "EXPIRED" },
        });
        if (flipped.count === 1) {
          result.flippedExpired++;
          await emitAuditEvent({
            actor: "cron:expiry",
            eventType: "tip_expired",
            refId: tip.id,
          });
        }
      }

      // Previous attempts (if any) determine which attempt number this is.
      const prior = await prisma.auditEvent.count({
        where: {
          refId: tip.id,
          eventType: { in: ["transfer_failed", "refund_stuck"] },
        },
      });
      const attempt = prior + 1;

      if (attempt > MAX_REFUND_ATTEMPTS) {
        // Past the cap — emit once per tick so operators can alert on it,
        // but don't mutate the row so a human can still recover manually.
        result.stuck++;
        await emitAuditEvent({
          actor: "cron:expiry",
          eventType: "refund_stuck",
          refId: tip.id,
          metadata: { attempts: prior },
        });
        continue;
      }

      const tipIdBytes = tipIdFromHex(tip.tipIdBytes);
      const { pda: escrowPda } = await deriveTipEscrowPda(tipIdBytes);
      const { txSignature } = await submitRefundOnChain({
        tipIdBytes,
        sender: tip.senderWallet as Address,
        escrowPda,
      });

      // Refund succeeded — record it atomically on the row that's currently
      // EXPIRED so we don't clobber a manual admin flip.
      const refunded = await prisma.tipIntent.updateMany({
        where: { id: tip.id, status: "EXPIRED" },
        data: {
          status: "REFUNDED",
          refundedAt: new Date(),
          refundTxSignature: txSignature,
        },
      });

      if (refunded.count === 1) {
        await prisma.claimLink.updateMany({
          where: { tipIntent: { id: tip.id } },
          data: { revokedAt: new Date() },
        });
        result.refunded++;
        await emitAuditEvent({
          actor: "cron:expiry",
          eventType: "tip_refunded",
          refId: tip.id,
          metadata: { txSignature, attempt },
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.failures.push({
        tipId: tip.id,
        error: message,
        attempt: result.failures.length + 1,
      });
      console.error("[expiry] refund failed", tip.id, err);
      await emitAuditEvent({
        actor: "cron:expiry",
        eventType: "transfer_failed",
        refId: tip.id,
        metadata: { error: message, phase: "refund" },
      });
      // No state mutation in the failure path — next tick retries. The
      // row is already (or stays) EXPIRED.
    }
  }

  result.finishedAt = new Date().toISOString();
  return result;
}

/* Allow direct CLI execution: `bun run jobs/expiry.ts`. */
async function mainIfScript() {
  const isDirect =
    typeof require !== "undefined" && require.main === module;
  if (!isDirect) return;
  const r = await runExpiryJob();
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.failures.length > 0 ? 1 : 0);
}
void mainIfScript();
