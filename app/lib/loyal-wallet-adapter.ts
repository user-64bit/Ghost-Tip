"use client";

/**
 * Adapt the scaffold's wallet-standard session (which speaks wire-bytes
 * and is driven by @solana/kit) into the WalletLike interface that
 * @loyal-labs/private-transactions expects (web3.js v1 Transaction /
 * VersionedTransaction).
 */

import {
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import type { WalletLike } from "@loyal-labs/private-transactions";
import type { WalletSession } from "./wallet/types";

export function walletSessionToLoyalWalletLike(
  session: WalletSession,
  chain: `solana:${string}`
): WalletLike {
  return {
    publicKey: new PublicKey(session.account.address),

    async signTransaction<T extends Transaction | VersionedTransaction>(
      tx: T
    ): Promise<T> {
      if (!session.signTransaction) {
        throw new Error(
          "This wallet doesn't expose signTransaction — can't route through Loyal."
        );
      }
      const wire =
        tx instanceof VersionedTransaction
          ? tx.serialize()
          : tx.serialize({
              requireAllSignatures: false,
              verifySignatures: false,
            });
      const signed = await session.signTransaction(
        new Uint8Array(wire),
        chain
      );
      // Round-trip back into whichever class we got in.
      if (tx instanceof VersionedTransaction) {
        return VersionedTransaction.deserialize(signed) as unknown as T;
      }
      return Transaction.from(signed) as unknown as T;
    },

    async signAllTransactions<T extends Transaction | VersionedTransaction>(
      txs: T[]
    ): Promise<T[]> {
      // wallet-standard exposes a separate signAllTransactions feature; our
      // scaffold session doesn't plumb it, so fall back to serial signing.
      const out: T[] = [];
      for (const tx of txs) {
        out.push(await this.signTransaction(tx));
      }
      return out;
    },
  };
}
