import bs58 from "bs58";
import nacl from "tweetnacl";

/**
 * Verify a Solana ed25519 wallet signature.
 *
 * Claim challenge message format (spec §8.x):
 *   `ghosttip-claim:${tipIntentId}:${claimToken}:${recipientWallet}`
 *
 * Signature is ed25519, base58-encoded (Phantom/Backpack default when using
 * signMessage).
 */
export function verifyWalletSignature(args: {
  message: string;
  signatureBase58: string;
  publicKeyBase58: string;
}): boolean {
  try {
    const msg = new TextEncoder().encode(args.message);
    const sig = bs58.decode(args.signatureBase58);
    const pub = bs58.decode(args.publicKeyBase58);
    if (sig.length !== 64) return false;
    if (pub.length !== 32) return false;
    return nacl.sign.detached.verify(msg, sig, pub);
  } catch {
    return false;
  }
}

export function claimChallengeMessage(args: {
  tipIntentId: string;
  claimToken: string;
  recipientWallet: string;
}): string {
  return `ghosttip-claim:${args.tipIntentId}:${args.claimToken}:${args.recipientWallet}`;
}

export function cancelChallengeMessage(args: {
  tipIntentId: string;
  senderWallet: string;
}): string {
  return `ghosttip-cancel:${args.tipIntentId}:${args.senderWallet}`;
}
