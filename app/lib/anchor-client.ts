/**
 * Client-side helper for building GhostTip program instructions in the
 * browser. Uses data already computed server-side (discriminators, PDAs,
 * encoded args) so the client doesn't need Node crypto.
 */

import {
  AccountRole,
  type Address,
  type Instruction,
  type AccountMeta,
} from "@solana/kit";

const SYSTEM_PROGRAM_ID =
  "11111111111111111111111111111111" as Address;

export interface DepositPayload {
  tipIdBytes: string; // hex of [u8;32]
  escrowPda: string;
  authorityPda: string;
  amount: string; // lamports as string
  expiryAt: number; // unix seconds
  programId: string;
}

/** Hex → Uint8Array. */
function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/, "");
  if (clean.length % 2 !== 0) throw new Error("odd hex");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return out;
}

function u64LE(v: bigint): Uint8Array {
  const b = new Uint8Array(8);
  const dv = new DataView(b.buffer);
  dv.setBigUint64(0, v, true);
  return b;
}

function i64LE(v: bigint): Uint8Array {
  const b = new Uint8Array(8);
  const dv = new DataView(b.buffer);
  dv.setBigInt64(0, v, true);
  return b;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(len);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

// Anchor discriminator for `deposit_tip` = sha256("global:deposit_tip")[0..8]
// Pre-computed so the browser doesn't need sha256.
const DEPOSIT_TIP_DISCRIMINATOR = new Uint8Array([
  0x0f, 0x1b, 0xac, 0x28, 0x3f, 0x4d, 0xf0, 0xcf,
]);

// Anchor discriminator for `cancel_tip`.
const CANCEL_TIP_DISCRIMINATOR = new Uint8Array([
  0x44, 0xc1, 0xc2, 0x26, 0xc4, 0x2a, 0x82, 0xcd,
]);

export function buildDepositTipInstruction(args: {
  sender: Address;
  payload: DepositPayload;
}): Instruction {
  const tipIdBytes = hexToBytes(args.payload.tipIdBytes);
  const data = concat(
    DEPOSIT_TIP_DISCRIMINATOR,
    tipIdBytes,
    u64LE(BigInt(args.payload.amount)),
    i64LE(BigInt(args.payload.expiryAt))
  );

  const accounts: AccountMeta[] = [
    { address: args.sender, role: AccountRole.WRITABLE_SIGNER },
    { address: args.payload.escrowPda as Address, role: AccountRole.WRITABLE },
    {
      address: args.payload.authorityPda as Address,
      role: AccountRole.READONLY,
    },
    { address: SYSTEM_PROGRAM_ID, role: AccountRole.READONLY },
  ];

  return {
    programAddress: args.payload.programId as Address,
    accounts,
    data,
  };
}

export interface CancelPayload {
  tipIdBytes: string;
  escrowPda: string;
  programId: string;
}

export function buildCancelTipInstruction(args: {
  sender: Address;
  payload: CancelPayload;
}): Instruction {
  const tipIdBytes = hexToBytes(args.payload.tipIdBytes);
  const data = concat(CANCEL_TIP_DISCRIMINATOR, tipIdBytes);

  const accounts: AccountMeta[] = [
    { address: args.sender, role: AccountRole.WRITABLE_SIGNER },
    { address: args.payload.escrowPda as Address, role: AccountRole.WRITABLE },
    { address: SYSTEM_PROGRAM_ID, role: AccountRole.READONLY },
  ];

  return {
    programAddress: args.payload.programId as Address,
    accounts,
    data,
  };
}
