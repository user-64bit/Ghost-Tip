/**
 * One-shot: create the AuthorityConfig PDA for a freshly deployed GhostTip
 * program by calling `init_authority`. Re-run is a no-op — the program
 * rejects a second call, and the script skips if the PDA already exists.
 *
 * Signer model:
 *   - Deployer wallet (~/.config/solana/id.json) pays fees + PDA rent.
 *   - A fresh authority keypair is generated (or loaded if it already
 *     exists) at ~/.config/solana/ghosttip-backup/authority-keypair.json
 *     and its pubkey is stored in the PDA. That same keypair must be
 *     pasted into GHOSTTIP_AUTHORITY_KEYPAIR for the backend to sign
 *     claim/refund.
 *
 * Run with: bun scripts/init-authority.ts
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import nacl from "tweetnacl";
import {
  AccountRole,
  appendTransactionMessageInstructions,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createTransactionMessage,
  getSignatureFromTransaction,
  pipe,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Instruction,
  type KeyPairSigner,
} from "@solana/kit";
import {
  GHOSTTIP_PROGRAM_ID,
  SYSTEM_PROGRAM_ID,
  deriveAuthorityConfigPda,
  encodeInitAuthorityData,
} from "../app/lib/server/anchor";

const RPC_URL = process.env.DEVNET_RPC_URL ?? "https://api.devnet.solana.com";
const WS_URL = RPC_URL.replace(/^https:/, "wss:").replace(/^http:/, "ws:");
const DEPLOYER_PATH = path.join(os.homedir(), ".config/solana/id.json");
const AUTHORITY_DIR = path.join(os.homedir(), ".config/solana/ghosttip-backup");
const AUTHORITY_PATH = path.join(AUTHORITY_DIR, "authority-keypair.json");
const AUTHORITY_FUND_LAMPORTS = 100_000_000n; // 0.1 SOL

async function loadSigner(p: string): Promise<KeyPairSigner> {
  const bytes = new Uint8Array(JSON.parse(fs.readFileSync(p, "utf8")));
  return createKeyPairSignerFromBytes(bytes);
}

async function ensureAuthority(): Promise<KeyPairSigner> {
  if (fs.existsSync(AUTHORITY_PATH)) {
    return loadSigner(AUTHORITY_PATH);
  }
  fs.mkdirSync(AUTHORITY_DIR, { recursive: true });
  const kp = nacl.sign.keyPair();
  fs.writeFileSync(AUTHORITY_PATH, JSON.stringify(Array.from(kp.secretKey)), {
    mode: 0o600,
  });
  return createKeyPairSignerFromBytes(kp.secretKey);
}

// System program Transfer: u32 LE discriminator (2) + u64 LE lamports.
function encodeSystemTransfer(lamportsAmount: bigint): Uint8Array {
  const out = new Uint8Array(12);
  const view = new DataView(out.buffer);
  view.setUint32(0, 2, true);
  view.setBigUint64(4, lamportsAmount, true);
  return out;
}

async function main() {
  const deployer = await loadSigner(DEPLOYER_PATH);
  const authority = await ensureAuthority();
  const { pda: authorityPda } = await deriveAuthorityConfigPda();

  console.log("deployer:       ", deployer.address);
  console.log("authority:      ", authority.address);
  console.log("authority PDA:  ", authorityPda);
  console.log("program:        ", GHOSTTIP_PROGRAM_ID);
  console.log("rpc:            ", RPC_URL);

  const rpc = createSolanaRpc(RPC_URL);
  const rpcSubscriptions = createSolanaRpcSubscriptions(WS_URL);
  const send = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });

  async function sendTx(payer: KeyPairSigner, ixs: Instruction[]): Promise<string> {
    const { value: blockhash } = await rpc.getLatestBlockhash().send();
    const msg = pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayerSigner(payer, m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
      (m) => appendTransactionMessageInstructions(ixs, m)
    );
    const signed = await signTransactionMessageWithSigners(msg);
    const sig = getSignatureFromTransaction(signed);
    await send(signed as Parameters<typeof send>[0], { commitment: "confirmed" });
    return sig;
  }

  const pdaInfo = await rpc
    .getAccountInfo(authorityPda, { encoding: "base64" })
    .send();
  if (pdaInfo.value) {
    console.log("AuthorityConfig PDA already exists — skipping init_authority.");
  } else {
    const initIx: Instruction = {
      programAddress: GHOSTTIP_PROGRAM_ID,
      accounts: [
        { address: deployer.address, role: AccountRole.WRITABLE_SIGNER },
        { address: authorityPda, role: AccountRole.WRITABLE },
        { address: SYSTEM_PROGRAM_ID, role: AccountRole.READONLY },
      ],
      data: encodeInitAuthorityData({ authority: authority.address }),
    };
    const sig = await sendTx(deployer, [initIx]);
    console.log("init_authority signature:", sig);
  }

  const authBalance = await rpc.getBalance(authority.address).send();
  if (authBalance.value < AUTHORITY_FUND_LAMPORTS) {
    const needed = AUTHORITY_FUND_LAMPORTS - authBalance.value;
    const fundIx: Instruction = {
      programAddress: SYSTEM_PROGRAM_ID,
      accounts: [
        { address: deployer.address, role: AccountRole.WRITABLE_SIGNER },
        { address: authority.address, role: AccountRole.WRITABLE },
      ],
      data: encodeSystemTransfer(needed),
    };
    const sig = await sendTx(deployer, [fundIx]);
    console.log(`funded authority with ${needed} lamports — ${sig}`);
  } else {
    console.log(`authority already funded (${authBalance.value} lamports)`);
  }

  const secret = fs.readFileSync(AUTHORITY_PATH, "utf8").trim();
  console.log("\n--- paste into .env.local ---");
  console.log(`GHOSTTIP_AUTHORITY_KEYPAIR=${secret}`);
  console.log("ANCHOR_ON_CHAIN_DISABLED=false");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
