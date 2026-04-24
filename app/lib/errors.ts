import {
  isSolanaError,
  SOLANA_ERROR__INSTRUCTION_ERROR__CUSTOM,
  SOLANA_ERROR__INSTRUCTION_ERROR__INSUFFICIENT_FUNDS,
  SOLANA_ERROR__INSTRUCTION_ERROR__INVALID_ACCOUNT_DATA,
  SOLANA_ERROR__INSTRUCTION_ERROR__INVALID_ARGUMENT,
  SOLANA_ERROR__INSTRUCTION_ERROR__MISSING_REQUIRED_SIGNATURE,
  SOLANA_ERROR__JSON_RPC__SERVER_ERROR_SEND_TRANSACTION_PREFLIGHT_FAILURE,
  SOLANA_ERROR__TRANSACTION_ERROR__ACCOUNT_NOT_FOUND,
  SOLANA_ERROR__TRANSACTION_ERROR__ALREADY_PROCESSED,
  SOLANA_ERROR__TRANSACTION_ERROR__BLOCKHASH_NOT_FOUND,
  SOLANA_ERROR__TRANSACTION_ERROR__INSUFFICIENT_FUNDS_FOR_FEE,
  SOLANA_ERROR__TRANSACTION_ERROR__INSUFFICIENT_FUNDS_FOR_RENT,
  SOLANA_ERROR__TRANSACTION_ERROR__SIGNATURE_FAILURE,
} from "@solana/kit";

/**
 * GhostTip program error codes, kept in sync with
 * `anchor/programs/ghosttip/src/lib.rs::GhostTipError`. Anchor auto-numbers
 * custom errors from 6000 in declaration order.
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

  // Walk the cause chain — Solana errors nest the true root (e.g. the
  // preflight failure wraps an InstructionError, which wraps a Custom
  // program error). We want the most specific message available.
  const mapped = classifyChain(err);
  if (mapped) return mapped;

  const fallback = getDeepestMessage(err);
  return fallback.length > 200 ? `${fallback.slice(0, 200)}…` : fallback;
}

function classifyChain(err: unknown): string | null {
  let current: unknown = err;
  let logs: readonly string[] | null = null;

  // Traverse up to ~8 levels — plenty for Solana's typical nesting.
  for (let i = 0; i < 8 && current; i++) {
    const mapped = classifyOne(current);
    if (mapped) {
      // If we have simulation logs from a preflight wrapper higher in the
      // chain, append a hint so an operator can recover the full context
      // from the browser console while keeping the toast readable.
      return logs && logs.length > 0
        ? `${mapped} (open DevTools → console for the full simulation log)`
        : mapped;
    }
    // Capture logs from a preflight-failure wrapper while continuing the
    // walk toward the inner instruction/transaction error.
    if (
      isSolanaError(
        current,
        SOLANA_ERROR__JSON_RPC__SERVER_ERROR_SEND_TRANSACTION_PREFLIGHT_FAILURE
      )
    ) {
      const sim = current.context as { logs?: readonly string[] | null };
      if (sim?.logs) {
        logs = sim.logs;
        // Mirror logs to the console so the user can copy them — the raw
        // SolanaError toString() doesn't include them.
        // eslint-disable-next-line no-console
        console.warn("[preflight] simulation logs:\n" + sim.logs.join("\n"));
      }
    }
    current = (current as Error)?.cause;
  }

  // No specific classifier matched — but if we saw a preflight wrapper
  // with logs, give the user a hint.
  if (logs && logs.length > 0) {
    const last = [...logs].reverse().find((l) => /error|failed/i.test(l));
    if (last) return `Preflight failed: ${last.slice(0, 180)}`;
    return "Preflight simulation failed — see console for logs.";
  }
  return null;
}

function classifyOne(err: unknown): string | null {
  // Custom Anchor errors from our own program.
  if (
    isSolanaError(err, SOLANA_ERROR__INSTRUCTION_ERROR__CUSTOM) &&
    typeof err.context?.code === "number"
  ) {
    const msg = GHOSTTIP_ERROR_MESSAGES[err.context.code];
    if (msg) return msg;
    return `Program rejected the instruction (code ${err.context.code}).`;
  }

  if (isSolanaError(err, SOLANA_ERROR__INSTRUCTION_ERROR__INSUFFICIENT_FUNDS)) {
    return "Not enough SOL to complete the transfer.";
  }
  if (
    isSolanaError(err, SOLANA_ERROR__TRANSACTION_ERROR__INSUFFICIENT_FUNDS_FOR_FEE)
  ) {
    return "Wallet can't cover the network fee.";
  }
  if (
    isSolanaError(err, SOLANA_ERROR__TRANSACTION_ERROR__INSUFFICIENT_FUNDS_FOR_RENT)
  ) {
    return "Transfer would leave an account below rent-exempt minimum.";
  }
  if (
    isSolanaError(err, SOLANA_ERROR__INSTRUCTION_ERROR__MISSING_REQUIRED_SIGNATURE)
  ) {
    return "Wallet didn't sign the transaction.";
  }
  if (isSolanaError(err, SOLANA_ERROR__TRANSACTION_ERROR__SIGNATURE_FAILURE)) {
    return "Signature verification failed — retry after reconnecting the wallet.";
  }
  if (isSolanaError(err, SOLANA_ERROR__TRANSACTION_ERROR__BLOCKHASH_NOT_FOUND)) {
    return "Transaction expired before confirming. Please retry.";
  }
  if (isSolanaError(err, SOLANA_ERROR__TRANSACTION_ERROR__ALREADY_PROCESSED)) {
    return "This transaction was already processed.";
  }
  if (isSolanaError(err, SOLANA_ERROR__TRANSACTION_ERROR__ACCOUNT_NOT_FOUND)) {
    return "Recipient account doesn't exist on this cluster.";
  }
  if (isSolanaError(err, SOLANA_ERROR__INSTRUCTION_ERROR__INVALID_ACCOUNT_DATA)) {
    return "Account data isn't valid for this instruction.";
  }
  if (isSolanaError(err, SOLANA_ERROR__INSTRUCTION_ERROR__INVALID_ARGUMENT)) {
    return "Instruction argument rejected by the program.";
  }
  return null;
}

function getDeepestMessage(err: unknown): string {
  let deepest = err instanceof Error ? err.message : String(err);
  let current: unknown = err;

  while (current instanceof Error && current.cause) {
    current = current.cause;
    if (current instanceof Error && current.message) {
      deepest = current.message;
    }
  }
  return deepest;
}
