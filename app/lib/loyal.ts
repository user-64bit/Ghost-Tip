/**
 * Loyal Network SDK wrapper.
 *
 * The real Loyal SDK exposes a private-tx rail: the sender submits a
 * "private send" intent and the SDK settles the transfer on-chain without
 * publicly linking sender↔recipient wallets. GhostTip uses this primitive
 * as the settlement rail for its deposit into the escrow PDA.
 *
 * When `NEXT_PUBLIC_LOYAL_MOCK=true` (or the real SDK isn't wired yet),
 * this module routes deposits through a mocked private rail that:
 *   - adds a realistic latency
 *   - returns a fake session id + real on-chain tx signature
 *   - exposes the same interface as the real SDK
 *
 * REPLACE WITH LOYAL SDK: every function marked below needs to swap its
 * body for a call into `@loyal-network/sdk` (or the real package name).
 * The public interface — LoyalClient, LoyalPrivateSend, etc. — should
 * stay stable so API routes don't need to change.
 */

import type { Address } from "@solana/kit";

export interface LoyalPrivateSendIntent {
  sender: Address;
  /** Recipient handle (e.g. "@elonmusk") or ghost-recipient PDA address. */
  recipientHint: string;
  amountLamports: bigint;
  tokenMint: string;
  /** Opaque payload the rail will settle via our escrow program. */
  settlementInstruction?: {
    programId: string;
    escrowPda: string;
    tipIdHex: string;
  };
}

export interface LoyalPrivateSendResult {
  sessionId: string;
  /** On-chain tx signature of the eventual settlement. */
  txSignature: string;
  /** Wall-clock when the rail considered the send final. */
  settledAt: string;
  /** Privacy score self-reported by Loyal (0..1). */
  privacyScore: number;
}

export interface LoyalClient {
  privateSend: (
    intent: LoyalPrivateSendIntent,
    opts?: { txSignatureHint?: string }
  ) => Promise<LoyalPrivateSendResult>;
}

function isMock(): boolean {
  if (process.env.NEXT_PUBLIC_LOYAL_MOCK === "true") return true;
  if (!process.env.LOYAL_API_KEY) return true;
  return false;
}

/** REPLACE WITH LOYAL SDK — construct the real `LoyalClient` here. */
export function createLoyalClient(): LoyalClient {
  if (isMock()) return createMockLoyalClient();

  // REPLACE WITH LOYAL SDK: e.g.
  //   import { LoyalClient as RealClient } from "@loyal-network/sdk";
  //   return new RealClient({
  //     apiKey: process.env.LOYAL_API_KEY!,
  //     endpoint: process.env.LOYAL_NETWORK_URL!,
  //     cluster: process.env.NEXT_PUBLIC_SOLANA_NETWORK as "devnet" | "mainnet",
  //   });
  return createMockLoyalClient();
}

/* -------------------------------------------------------------------------- */
/*                                   Mock                                     */
/* -------------------------------------------------------------------------- */

function createMockLoyalClient(): LoyalClient {
  return {
    async privateSend(intent, opts) {
      // Simulate private-rail latency — real Loyal settles within a couple of
      // slots, so 400–900ms is representative end-to-end.
      const jitter = 400 + Math.floor(Math.random() * 500);
      await new Promise((r) => setTimeout(r, jitter));

      // When called from the server claim/refund paths we already have a real
      // on-chain signature — pass it through so tip cards can link to it.
      const sig =
        opts?.txSignatureHint ??
        `MOCK_LOYAL_${Date.now().toString(36)}_${Math.random()
          .toString(36)
          .slice(2, 10)}`;

      return {
        sessionId: `loyal_sess_${Math.random().toString(36).slice(2, 12)}`,
        txSignature: sig,
        settledAt: new Date().toISOString(),
        privacyScore: 0.92,
        // Echo for debug visibility in dev:
        ...(process.env.NODE_ENV !== "production"
          ? ({
              _debug: {
                recipientHint: intent.recipientHint,
                amount: intent.amountLamports.toString(),
                tokenMint: intent.tokenMint,
              },
            } as unknown as object)
          : {}),
      };
    },
  };
}

export const loyal = createLoyalClient();
