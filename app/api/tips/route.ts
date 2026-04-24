import type { CreateTipResponse, HandleType } from "../../types/tip";
import { fail, handler, ok, parseBigIntAmount } from "../../lib/server/api";
import { prisma } from "../../lib/server/prisma";
import { redis } from "../../lib/server/redis";
import {
  generateClaimToken,
  generateTipId,
} from "../../lib/server/crypto";
import {
  emitAuditEvent,
  normaliseHandle,
  validateHandle,
} from "../../lib/server/identity";
import {
  GHOSTTIP_PROGRAM_ID,
  deriveAuthorityConfigPda,
  deriveTipEscrowPda,
} from "../../lib/server/anchor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOL_MINT = "So11111111111111111111111111111111111111112";

export const POST = handler(async (req) => {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return fail("INVALID_INPUT", "Body must be JSON", 400);
  }

  const senderWallet = String(body.senderWallet ?? "").trim();
  if (senderWallet.length < 32 || senderWallet.length > 44)
    return fail("INVALID_INPUT", "Invalid sender wallet", 400);

  const handleType = (String(body.handleType ?? "x") as HandleType);
  const handleCheck = validateHandle(
    handleType,
    String(body.recipientHandle ?? "")
  );
  if (!handleCheck.ok) return fail("INVALID_HANDLE", handleCheck.reason, 400);

  let amount: bigint;
  try {
    amount = parseBigIntAmount(body.amount);
  } catch (e) {
    return fail("INVALID_AMOUNT", (e as Error).message, 400);
  }

  const tokenMint = String(body.tokenMint ?? SOL_MINT);
  const memo =
    body.memo == null ? null : String(body.memo).slice(0, 280).trim() || null;

  const expiryHours = Math.max(
    1,
    Math.min(24 * 30, Number(body.expiryHours ?? 24 * 7))
  );
  const expiryAt = new Date(Date.now() + expiryHours * 3600 * 1000);

  // Identity lookup — if the handle is already mapped, a claim link is still
  // generated (same UX path) but the IdentityMap could short-circuit to
  // resolvedRecipientWallet for direct sends in a future milestone.
  // For MVP: always create a claim link so the X OAuth gate is demonstrable.
  const tipId = generateTipId();
  const tokens = generateClaimToken();
  const { pda: escrowPda } = await deriveTipEscrowPda(tipId.bytes);
  const { pda: authorityPda } = await deriveAuthorityConfigPda();

  const { tip } = await prisma.$transaction(async (tx) => {
    const cl = await tx.claimLink.create({
      data: {
        secretTokenHash: tokens.hash,
        intendedHandleType: handleType,
        intendedHandleValue: handleCheck.value,
        expiresAt: expiryAt,
      },
    });
    const t = await tx.tipIntent.create({
      data: {
        senderWallet,
        recipientHandleType: handleType,
        recipientHandleValue: handleCheck.value,
        amount,
        tokenMint,
        memo,
        status: "DRAFT",
        expiryAt,
        tipIdBytes: tipId.hex,
        tipEscrowPda: escrowPda,
        claimLinkId: cl.id,
      },
    });
    return { tip: t };
  });

  // Redis: map raw-token-hash → tipIntent id (for O(1) claim lookup).
  // TTL matches the tip's expiry window.
  const ttlSec = Math.ceil((expiryAt.getTime() - Date.now()) / 1000);
  await redis.setex(
    `claim_token:${tokens.hash}`,
    ttlSec,
    tip.id
  );

  await emitAuditEvent({
    actor: senderWallet,
    eventType: "tip_created",
    refId: tip.id,
    metadata: {
      handle: `${handleType}:${handleCheck.value}`,
      amount: amount.toString(),
      expiryAt: expiryAt.toISOString(),
    },
  });

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") ??
    new URL(req.url).origin;

  const response: CreateTipResponse = {
    tipIntentId: tip.id,
    status: "DRAFT",
    claimLink: `${appUrl}/claim/${tokens.raw}`,
    claimToken: tokens.raw,
    expiryAt: expiryAt.toISOString(),
    tipIdBytes: tip.tipIdBytes,
    escrowPda: escrowPda,
    authorityPda,
    programId: GHOSTTIP_PROGRAM_ID,
    amount: amount.toString(),
    depositPayload: {
      tipIdBytes: tip.tipIdBytes,
      escrowPda,
      authorityPda,
      amount: amount.toString(),
      expiryAt: Math.floor(expiryAt.getTime() / 1000),
      programId: GHOSTTIP_PROGRAM_ID,
    },
  };

  // Don't care about unused:
  void normaliseHandle;

  return ok(response);
});
