/**
 * Backend authority keypair handling.
 *
 * The authority keypair is loaded from `GHOSTTIP_AUTHORITY_KEYPAIR` — the JSON
 * byte-array form produced by `solana-keygen new --outfile authority.json`.
 * It is the only signer that can call `claim_tip` and `refund_tip`, so it
 * MUST stay server-side. Never read this from a NEXT_PUBLIC_* var.
 */

import {
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  pipe,
  createTransactionMessage,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstructions,
  signTransactionMessageWithSigners,
  getSignatureFromTransaction,
  sendAndConfirmTransactionFactory,
  type Address,
  type Instruction,
  type KeyPairSigner,
} from "@solana/kit";

let cached:
  | { signer: KeyPairSigner; address: Address }
  | null = null;

async function loadSigner(): Promise<{
  signer: KeyPairSigner;
  address: Address;
}> {
  if (cached) return cached;
  const raw = process.env.GHOSTTIP_AUTHORITY_KEYPAIR;
  if (!raw) throw new Error("GHOSTTIP_AUTHORITY_KEYPAIR not set");

  let parsed: number[];
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      "GHOSTTIP_AUTHORITY_KEYPAIR must be a JSON array of bytes"
    );
  }
  if (!Array.isArray(parsed) || parsed.length !== 64) {
    throw new Error(
      "GHOSTTIP_AUTHORITY_KEYPAIR must be a 64-byte JSON array"
    );
  }
  const signer = await createKeyPairSignerFromBytes(
    new Uint8Array(parsed)
  );
  cached = { signer, address: signer.address };
  return cached;
}

export async function getAuthorityAddress(): Promise<Address> {
  const { address } = await loadSigner();
  return address;
}

function rpcUrl(): string {
  return (
    process.env.SOLANA_RPC_URL ??
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ??
    "https://api.devnet.solana.com"
  );
}

function wsUrl(): string {
  return rpcUrl()
    .replace(/^https:/, "wss:")
    .replace(/^http:/, "ws:");
}

/** Sign & send a set of instructions as the backend authority. */
export async function submitAuthorityInstructions(
  instructions: Instruction[]
): Promise<string> {
  const { signer } = await loadSigner();
  const rpc = createSolanaRpc(rpcUrl());
  const rpcSubscriptions = createSolanaRpcSubscriptions(wsUrl());

  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(signer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
    (m) => appendTransactionMessageInstructions(instructions, m)
  );

  const signedTx = await signTransactionMessageWithSigners(message);
  const sig = getSignatureFromTransaction(signedTx);

  const send = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });
  // The signer pipeline widens the lifetime type to a union; we built the
  // message with a blockhash lifetime, so the cast is safe.
  await send(
    signedTx as Parameters<typeof send>[0],
    { commitment: "confirmed" }
  );
  return sig;
}
