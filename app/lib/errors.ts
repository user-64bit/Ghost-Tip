import {
  isSolanaError,
  SOLANA_ERROR__INSTRUCTION_ERROR__CUSTOM,
} from "@solana/kit";

/**
 * GhostTip program error codes, kept in sync with
 * `anchor/programs/ghosttip/src/lib.rs::GhostTipError`. The order there
 * determines the numeric code (Anchor auto-numbers from 6000). We hard-code
 * the values here so the client doesn't need the generated IDL for what is
 * really just a tiny message table.
 */
const GHOSTTIP_ERROR_MESSAGES: Record<number, string> = {
  6000: "This tip isn't in the right state for that action.",
  6001: "This tip hasn't expired yet — refund isn't available.",
  6002: "This tip was already claimed.",
  6003: "You're not authorised to perform this action.",
  6004: "The escrow is missing funds — please contact support.",
  6005: "That expiry timestamp is invalid.",
  6006: "That tip id is invalid.",
  6007: "Enter a positive amount.",
};

export function parseTransactionError(err: unknown): string {
  // Wallet rejection (comes from wallet-standard, not a SolanaError).
  if (err instanceof Error && err.message.includes("User rejected")) {
    return "Transaction was rejected by the wallet.";
  }

  // Anchor custom program errors — map by numeric code.
  if (
    isSolanaError(err, SOLANA_ERROR__INSTRUCTION_ERROR__CUSTOM) &&
    typeof err.context?.code === "number"
  ) {
    const msg = GHOSTTIP_ERROR_MESSAGES[err.context.code];
    if (msg) return msg;
  }

  // Walk the cause chain; kit's SolanaError already has readable messages.
  const message = getDeepestMessage(err);
  return message.length > 200 ? `${message.slice(0, 200)}...` : message;
}

function getDeepestMessage(err: unknown): string {
  let deepest = err instanceof Error ? err.message : String(err);
  let current: unknown = err;

  while (current instanceof Error && current.cause) {
    current = current.cause;
    if (current instanceof Error) {
      deepest = current.message;
    }
  }

  return deepest;
}
