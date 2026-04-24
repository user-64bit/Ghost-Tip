import type {
  Cluster,
  CreateTipResponse,
  DirectSendCreateTipResponse,
  EscrowCreateTipResponse,
  HandleType,
} from "../../types/tip";
import { fail, handler, ok, parseBigIntAmount } from "../../lib/server/api";
import { prisma } from "../../lib/server/prisma";
import { redis } from "../../lib/server/redis";
import {
  generateClaimToken,
  generateTipId,
} from "../../lib/server/crypto";
import {
  emitAuditEvent,
  resolveHandle,
  validateHandle,
} from "../../lib/server/identity";
import {
  GHOSTTIP_PROGRAM_ID,
  deriveAuthorityConfigPda,
  deriveTipEscrowPda,
} from "../../lib/server/anchor";
import {
  NATIVE_SOL_MINT,
  chooseRail,
  splTokenFor,
} from "../../lib/loyal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_CLUSTERS: Cluster[] = ["devnet", "testnet", "mainnet", "localnet"];

function resolveCluster(raw: unknown): Cluster {
  if (typeof raw === "string" && VALID_CLUSTERS.includes(raw as Cluster)) {
    return raw as Cluster;
  }
  const envCluster = process.env.NEXT_PUBLIC_SOLANA_NETWORK;
  if (envCluster && VALID_CLUSTERS.includes(envCluster as Cluster)) {
    return envCluster as Cluster;
  }
  return "devnet";
}

function tokenMeta(
  cluster: Cluster,
  mint: string
): { symbol: string; decimals: number } {
  if (mint === NATIVE_SOL_MINT) return { symbol: "SOL", decimals: 9 };
  const spl = splTokenFor(cluster, mint);
  if (spl) return { symbol: spl.symbol, decimals: spl.decimals };
  // Unknown SPL — assume 6 decimals as a pragmatic default. The frontend
  // uses this only for display; on-chain transfers use the mint's
  // authoritative decimals.
  return { symbol: "TOKEN", decimals: 6 };
}

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

  const handleType = String(body.handleType ?? "x") as HandleType;
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

  const cluster = resolveCluster(body.cluster);
  const tokenMint = String(body.tokenMint ?? NATIVE_SOL_MINT);
  const memo =
    body.memo == null ? null : String(body.memo).slice(0, 280).trim() || null;

  const expiryHours = Math.max(
    1,
    Math.min(24 * 30, Number(body.expiryHours ?? 24 * 7))
  );
  const expiryAt = new Date(Date.now() + expiryHours * 3600 * 1000);

  const { symbol, decimals } = tokenMeta(cluster, tokenMint);

  // Warm-handle check — if the recipient has already claimed a tip on this
  // handle (or otherwise been added to IdentityMap), we know their wallet
  // and can skip the claim-link flow entirely. Per §8.4 of the spec.
  const resolvedWallet = await resolveHandle(handleType, handleCheck.value);

  if (resolvedWallet) {
    return createDirectSend({
      req,
      senderWallet,
      handleType,
      handleValue: handleCheck.value,
      recipientWallet: resolvedWallet,
      cluster,
      amount,
      tokenMint,
      tokenSymbol: symbol,
      tokenDecimals: decimals,
      memo,
      expiryAt,
    });
  }

  return createEscrowClaim({
    req,
    senderWallet,
    handleType,
    handleValue: handleCheck.value,
    cluster,
    amount,
    tokenMint,
    tokenSymbol: symbol,
    tokenDecimals: decimals,
    memo,
    expiryAt,
  });
});

/* -------------------------------------------------------------------------- */
/*                              DIRECT_SEND path                              */
/* -------------------------------------------------------------------------- */

async function createDirectSend(args: {
  req: Request;
  senderWallet: string;
  handleType: HandleType;
  handleValue: string;
  recipientWallet: string;
  cluster: Cluster;
  amount: bigint;
  tokenMint: string;
  tokenSymbol: string;
  tokenDecimals: number;
  memo: string | null;
  expiryAt: Date;
}) {
  const rail = chooseRail(args.cluster, args.tokenMint);
  const tipId = generateTipId();

  const tip = await prisma.tipIntent.create({
    data: {
      senderWallet: args.senderWallet,
      cluster: args.cluster,
      mode: "DIRECT_SEND",
      rail,
      recipientHandleType: args.handleType,
      recipientHandleValue: args.handleValue,
      resolvedRecipientWallet: args.recipientWallet,
      amount: args.amount,
      tokenMint: args.tokenMint,
      tokenSymbol: args.tokenSymbol,
      tokenDecimals: args.tokenDecimals,
      memo: args.memo,
      status: "DRAFT",
      expiryAt: args.expiryAt, // cosmetic for direct sends; no refund path
      tipIdBytes: tipId.hex,
    },
  });

  await emitAuditEvent({
    actor: args.senderWallet,
    eventType: "tip_created",
    refId: tip.id,
    metadata: {
      mode: "DIRECT_SEND",
      rail,
      handle: `${args.handleType}:${args.handleValue}`,
      recipientWallet: args.recipientWallet,
      amount: args.amount.toString(),
      cluster: args.cluster,
    },
  });

  const body: DirectSendCreateTipResponse = {
    mode: "DIRECT_SEND",
    tipIntentId: tip.id,
    status: "DRAFT",
    cluster: args.cluster,
    rail,
    recipientWallet: args.recipientWallet,
    recipientHandle: args.handleValue,
    recipientHandleType: args.handleType,
    expiryAt: args.expiryAt.toISOString(),
    amount: args.amount.toString(),
    tokenMint: args.tokenMint,
    tokenSymbol: args.tokenSymbol,
    tokenDecimals: args.tokenDecimals,
    privateSendPayload:
      rail === "loyal"
        ? {
            recipientUsername: args.handleValue,
            tokenMint: args.tokenMint,
            amount: args.amount.toString(),
            cluster: args.cluster,
          }
        : null,
    nativeSendPayload:
      rail === "native"
        ? {
            recipientWallet: args.recipientWallet,
            amountLamports: args.amount.toString(),
          }
        : null,
  };

  return ok<CreateTipResponse>(body);
}

/* -------------------------------------------------------------------------- */
/*                             ESCROW_CLAIM path                              */
/* -------------------------------------------------------------------------- */

async function createEscrowClaim(args: {
  req: Request;
  senderWallet: string;
  handleType: HandleType;
  handleValue: string;
  cluster: Cluster;
  amount: bigint;
  tokenMint: string;
  tokenSymbol: string;
  tokenDecimals: number;
  memo: string | null;
  expiryAt: Date;
}) {
  const tipId = generateTipId();
  const tokens = generateClaimToken();
  const { pda: escrowPda } = await deriveTipEscrowPda(tipId.bytes);
  const { pda: authorityPda } = await deriveAuthorityConfigPda();

  const { tip } = await prisma.$transaction(async (tx) => {
    const cl = await tx.claimLink.create({
      data: {
        secretTokenHash: tokens.hash,
        intendedHandleType: args.handleType,
        intendedHandleValue: args.handleValue,
        expiresAt: args.expiryAt,
      },
    });
    const t = await tx.tipIntent.create({
      data: {
        senderWallet: args.senderWallet,
        cluster: args.cluster,
        mode: "ESCROW_CLAIM",
        recipientHandleType: args.handleType,
        recipientHandleValue: args.handleValue,
        amount: args.amount,
        tokenMint: args.tokenMint,
        tokenSymbol: args.tokenSymbol,
        tokenDecimals: args.tokenDecimals,
        memo: args.memo,
        status: "DRAFT",
        expiryAt: args.expiryAt,
        tipIdBytes: tipId.hex,
        tipEscrowPda: escrowPda,
        claimLinkId: cl.id,
      },
    });
    return { tip: t };
  });

  const ttlSec = Math.ceil((args.expiryAt.getTime() - Date.now()) / 1000);
  await redis.setex(`claim_token:${tokens.hash}`, ttlSec, tip.id);

  await emitAuditEvent({
    actor: args.senderWallet,
    eventType: "tip_created",
    refId: tip.id,
    metadata: {
      mode: "ESCROW_CLAIM",
      handle: `${args.handleType}:${args.handleValue}`,
      amount: args.amount.toString(),
      expiryAt: args.expiryAt.toISOString(),
      cluster: args.cluster,
    },
  });

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") ??
    new URL(args.req.url).origin;

  const body: EscrowCreateTipResponse = {
    mode: "ESCROW_CLAIM",
    tipIntentId: tip.id,
    status: "DRAFT",
    cluster: args.cluster,
    claimLink: `${appUrl}/claim/${tokens.raw}`,
    claimToken: tokens.raw,
    expiryAt: args.expiryAt.toISOString(),
    tipIdBytes: tip.tipIdBytes,
    escrowPda,
    authorityPda,
    programId: GHOSTTIP_PROGRAM_ID,
    amount: args.amount.toString(),
    tokenMint: args.tokenMint,
    tokenSymbol: args.tokenSymbol,
    tokenDecimals: args.tokenDecimals,
    depositPayload: {
      tipIdBytes: tip.tipIdBytes,
      escrowPda,
      authorityPda,
      amount: args.amount.toString(),
      expiryAt: Math.floor(args.expiryAt.getTime() / 1000),
      programId: GHOSTTIP_PROGRAM_ID,
    },
  };

  return ok<CreateTipResponse>(body);
}
