import { randomBytes, createHash } from "node:crypto";

/**
 * Generate a claim-link token.
 * The raw token is placed in the URL and is the recipient's secret.
 * Only the SHA-256 hash is persisted server-side — so a DB breach
 * cannot produce a valid claim link.
 */
export function generateClaimToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("hex"); // 64-char hex
  const hash = createHash("sha256").update(raw).digest("hex");
  return { raw, hash };
}

export function hashClaimToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * 32-byte random tip ID used as the PDA seed. Hex-encoded for DB storage and
 * JSON transport. The Anchor program consumes the raw [u8;32].
 */
export function generateTipId(): { bytes: Uint8Array; hex: string } {
  const bytes = new Uint8Array(randomBytes(32));
  const hex = Buffer.from(bytes).toString("hex");
  return { bytes, hex };
}

export function tipIdFromHex(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/, "");
  if (clean.length !== 64) throw new Error("tip id must be 32 bytes hex");
  return new Uint8Array(Buffer.from(clean, "hex"));
}

export function randomSessionToken(): string {
  return randomBytes(24).toString("hex");
}

export function randomOAuthState(): string {
  return randomBytes(24).toString("hex");
}

/** PKCE code-verifier (43–128 char URL-safe base64). */
export function generatePkceVerifier(): string {
  return randomBytes(48)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function pkceChallengeFromVerifier(verifier: string): string {
  return createHash("sha256")
    .update(verifier)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

/** Constant-time string compare to avoid timing oracles on token hashes. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
