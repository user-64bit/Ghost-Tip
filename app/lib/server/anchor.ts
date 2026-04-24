/**
 * Server-side Anchor client for the GhostTip escrow program.
 *
 * Hand-crafted because Codama codegen needs a built IDL — the deployer runs
 * `anchor build && npm run codama:js` to generate a fully typed client.
 * This module provides the same capabilities for both client-side deposit
 * instruction construction and server-side authority-signed instructions.
 */

import { createHash } from "node:crypto";
import {
  address,
  getProgramDerivedAddress,
  getAddressEncoder,
  getUtf8Encoder,
  type Address,
  type Instruction,
  type AccountMeta,
  AccountRole,
} from "@solana/kit";

export const GHOSTTIP_PROGRAM_ID = (process.env.NEXT_PUBLIC_PROGRAM_ID ??
  "C7GTb7VYxdrG38MKGPxLGb14X199btYZ5kDerSGiayW5") as Address;

export const SYSTEM_PROGRAM_ID =
  "11111111111111111111111111111111" as Address;

function discriminator(name: string): Uint8Array {
  return new Uint8Array(
    createHash("sha256").update(`global:${name}`).digest().subarray(0, 8)
  );
}

export const DISCRIMINATORS = {
  depositTip: discriminator("deposit_tip"),
  claimTip: discriminator("claim_tip"),
  refundTip: discriminator("refund_tip"),
  cancelTip: discriminator("cancel_tip"),
  initAuthority: discriminator("init_authority"),
};

/* -------------------------------------------------------------------------- */
/*                                    PDAs                                    */
/* -------------------------------------------------------------------------- */

export async function deriveTipEscrowPda(
  tipIdBytes: Uint8Array
): Promise<{ pda: Address; bump: number }> {
  const [pda, bump] = await getProgramDerivedAddress({
    programAddress: GHOSTTIP_PROGRAM_ID,
    seeds: [getUtf8Encoder().encode("tip_escrow"), tipIdBytes],
  });
  return { pda, bump };
}

export async function deriveAuthorityConfigPda(): Promise<{
  pda: Address;
  bump: number;
}> {
  const [pda, bump] = await getProgramDerivedAddress({
    programAddress: GHOSTTIP_PROGRAM_ID,
    seeds: [getUtf8Encoder().encode("authority")],
  });
  return { pda, bump };
}

/* -------------------------------------------------------------------------- */
/*                         Raw instruction data encoders                      */
/* -------------------------------------------------------------------------- */

function encodeU64LE(value: bigint): Uint8Array {
  const buf = new Uint8Array(8);
  const view = new DataView(buf.buffer);
  view.setBigUint64(0, value, true);
  return buf;
}

function encodeI64LE(value: bigint): Uint8Array {
  const buf = new Uint8Array(8);
  const view = new DataView(buf.buffer);
  view.setBigInt64(0, value, true);
  return buf;
}

function encodePubkey(addr: Address): Uint8Array {
  return new Uint8Array(getAddressEncoder().encode(addr));
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function encodeDepositTipData(args: {
  tipIdBytes: Uint8Array;
  amountLamports: bigint;
  expiryAtUnix: bigint;
}): Uint8Array {
  if (args.tipIdBytes.length !== 32) throw new Error("tipIdBytes must be 32");
  return concat(
    DISCRIMINATORS.depositTip,
    args.tipIdBytes,
    encodeU64LE(args.amountLamports),
    encodeI64LE(args.expiryAtUnix)
  );
}

export function encodeClaimTipData(args: {
  tipIdBytes: Uint8Array;
  recipient: Address;
}): Uint8Array {
  return concat(
    DISCRIMINATORS.claimTip,
    args.tipIdBytes,
    encodePubkey(args.recipient)
  );
}

export function encodeRefundTipData(args: {
  tipIdBytes: Uint8Array;
}): Uint8Array {
  return concat(DISCRIMINATORS.refundTip, args.tipIdBytes);
}

export function encodeCancelTipData(args: {
  tipIdBytes: Uint8Array;
}): Uint8Array {
  return concat(DISCRIMINATORS.cancelTip, args.tipIdBytes);
}

export function encodeInitAuthorityData(args: {
  authority: Address;
}): Uint8Array {
  return concat(DISCRIMINATORS.initAuthority, encodePubkey(args.authority));
}

/* -------------------------------------------------------------------------- */
/*                         Instruction builders (typed)                       */
/* -------------------------------------------------------------------------- */

type AccountSpec = { address: Address; role: AccountRole };

function buildIx(
  programAddress: Address,
  accounts: AccountSpec[],
  data: Uint8Array
): Instruction {
  return {
    programAddress,
    accounts: accounts.map<AccountMeta>((a) => ({
      address: a.address,
      role: a.role,
    })),
    data,
  };
}

export async function buildDepositTipInstruction(args: {
  sender: Address;
  tipIdBytes: Uint8Array;
  amountLamports: bigint;
  expiryAtUnix: bigint;
  escrowPda: Address;
  authorityPda: Address;
}): Promise<Instruction> {
  const data = encodeDepositTipData({
    tipIdBytes: args.tipIdBytes,
    amountLamports: args.amountLamports,
    expiryAtUnix: args.expiryAtUnix,
  });
  return buildIx(
    GHOSTTIP_PROGRAM_ID,
    [
      { address: args.sender, role: AccountRole.WRITABLE_SIGNER },
      { address: args.escrowPda, role: AccountRole.WRITABLE },
      { address: args.authorityPda, role: AccountRole.READONLY },
      { address: SYSTEM_PROGRAM_ID, role: AccountRole.READONLY },
    ],
    data
  );
}

export async function buildClaimTipInstruction(args: {
  authority: Address;
  recipient: Address;
  tipIdBytes: Uint8Array;
  escrowPda: Address;
}): Promise<Instruction> {
  const data = encodeClaimTipData({
    tipIdBytes: args.tipIdBytes,
    recipient: args.recipient,
  });
  return buildIx(
    GHOSTTIP_PROGRAM_ID,
    [
      { address: args.authority, role: AccountRole.WRITABLE_SIGNER },
      { address: args.recipient, role: AccountRole.WRITABLE },
      { address: args.escrowPda, role: AccountRole.WRITABLE },
      { address: SYSTEM_PROGRAM_ID, role: AccountRole.READONLY },
    ],
    data
  );
}

export async function buildRefundTipInstruction(args: {
  authority: Address;
  sender: Address;
  tipIdBytes: Uint8Array;
  escrowPda: Address;
}): Promise<Instruction> {
  const data = encodeRefundTipData({ tipIdBytes: args.tipIdBytes });
  return buildIx(
    GHOSTTIP_PROGRAM_ID,
    [
      { address: args.authority, role: AccountRole.WRITABLE_SIGNER },
      { address: args.sender, role: AccountRole.WRITABLE },
      { address: args.escrowPda, role: AccountRole.WRITABLE },
      { address: SYSTEM_PROGRAM_ID, role: AccountRole.READONLY },
    ],
    data
  );
}

export async function buildCancelTipInstruction(args: {
  sender: Address;
  tipIdBytes: Uint8Array;
  escrowPda: Address;
}): Promise<Instruction> {
  const data = encodeCancelTipData({ tipIdBytes: args.tipIdBytes });
  return buildIx(
    GHOSTTIP_PROGRAM_ID,
    [
      { address: args.sender, role: AccountRole.WRITABLE_SIGNER },
      { address: args.escrowPda, role: AccountRole.WRITABLE },
      { address: SYSTEM_PROGRAM_ID, role: AccountRole.READONLY },
    ],
    data
  );
}

/* -------------------------------------------------------------------------- */
/*                    Authority keypair + on-chain submit                     */
/* -------------------------------------------------------------------------- */

/**
 * When ANCHOR_ON_CHAIN_DISABLED=true (or the program hasn't been deployed
 * yet), server-side claim/refund use a mock tx signature. This lets the
 * frontend demo work end-to-end before you run `anchor deploy`.
 */
export function onChainDisabled(): boolean {
  if (process.env.ANCHOR_ON_CHAIN_DISABLED === "true") return true;
  if (!process.env.GHOSTTIP_AUTHORITY_KEYPAIR) return true;
  return false;
}

export interface AuthoritySignature {
  txSignature: string;
  onChain: boolean;
}

/**
 * Submit a claim_tip instruction signed by the backend authority.
 * Returns a mock tx signature when on-chain is disabled.
 */
export async function submitClaimOnChain(args: {
  tipIdBytes: Uint8Array;
  recipient: Address;
  escrowPda: Address;
}): Promise<AuthoritySignature> {
  if (onChainDisabled()) {
    return mockSignature("claim", args.tipIdBytes);
  }
  const { submitAuthorityInstructions } = await import("./authority");
  const { authorityAddress } = await loadAuthorityKeypair();
  const ix = await buildClaimTipInstruction({
    authority: authorityAddress,
    recipient: args.recipient,
    tipIdBytes: args.tipIdBytes,
    escrowPda: args.escrowPda,
  });
  const sig = await submitAuthorityInstructions([ix]);
  return { txSignature: sig, onChain: true };
}

export async function submitRefundOnChain(args: {
  tipIdBytes: Uint8Array;
  sender: Address;
  escrowPda: Address;
}): Promise<AuthoritySignature> {
  if (onChainDisabled()) {
    return mockSignature("refund", args.tipIdBytes);
  }
  const { submitAuthorityInstructions } = await import("./authority");
  const { authorityAddress } = await loadAuthorityKeypair();
  const ix = await buildRefundTipInstruction({
    authority: authorityAddress,
    sender: args.sender,
    tipIdBytes: args.tipIdBytes,
    escrowPda: args.escrowPda,
  });
  const sig = await submitAuthorityInstructions([ix]);
  return { txSignature: sig, onChain: true };
}

function mockSignature(kind: string, tipId: Uint8Array): AuthoritySignature {
  const hex = Buffer.from(tipId).toString("hex").slice(0, 12);
  return {
    txSignature: `MOCK_${kind.toUpperCase()}_${hex}_${Date.now().toString(36)}`,
    onChain: false,
  };
}

/** Defer the heavy authority loader until we actually need it (keeps API routes light in mock mode). */
export async function loadAuthorityKeypair(): Promise<{
  authorityAddress: Address;
}> {
  const mod = await import("./authority");
  const authorityAddress = await mod.getAuthorityAddress();
  return { authorityAddress };
}

export { address };
