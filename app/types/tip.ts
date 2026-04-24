export type TipStatus =
  | "DRAFT"
  | "PENDING"
  | "CLAIMABLE"
  | "CLAIMED"
  | "EXPIRED"
  | "REFUNDED"
  | "CANCELLED"
  | "FAILED";

export type HandleType = "x" | "telegram" | "ghosttip";

export type Cluster = "devnet" | "testnet" | "mainnet" | "localnet";

export type TipMode = "ESCROW_CLAIM" | "DIRECT_SEND";
export type TipRail = "native" | "loyal";

export interface TipIntent {
  id: string;
  senderWallet: string;
  cluster: Cluster;
  mode: TipMode;
  /** 'native' SOL transfer, or 'loyal' private SPL rail. Null for ESCROW_CLAIM. */
  rail: TipRail | null;
  recipientHandleType: HandleType;
  recipientHandleValue: string;
  resolvedRecipientWallet: string | null;
  amount: string; // bigint serialised as string — raw token units
  tokenMint: string;
  tokenSymbol: string;
  tokenDecimals: number;
  memo: string | null;
  status: TipStatus;
  expiryAt: string; // ISO
  createdAt: string;
  updatedAt: string;
  claimLinkId: string | null;
  txSignature: string | null;
  refundTxSignature: string | null;
  claimTxSignature: string | null;
  claimedAt: string | null;
  refundedAt: string | null;
  cancelledAt: string | null;
  tipEscrowPda: string | null;
  usernameDepositPda: string | null;
  tipIdBytes: string; // hex of [u8;32]
  errorCode: string | null;
  errorMessage: string | null;
}

export interface ClaimLink {
  id: string;
  tipIntentId: string;
  intendedHandleType: HandleType;
  intendedHandleValue: string;
  createdAt: string;
  expiresAt: string;
  claimedAt: string | null;
  claimedByWallet: string | null;
  revokedAt: string | null;
}

export interface IdentityMap {
  id: string;
  handleType: HandleType;
  handleValue: string;
  walletAddress: string;
  verifiedAt: string;
  verificationMethod: "oauth_x" | "claim_link" | "manual";
  revokedAt: string | null;
}

export interface TipPreview {
  amount: string;
  tokenMint: string;
  tokenSymbol: string;
  memo: string | null;
  expiryAt: string;
  intendedHandle: string;
  handleType: HandleType;
  status: TipStatus;
}

export interface CreateTipRequest {
  senderWallet: string;
  recipientHandle: string;
  handleType: HandleType;
  cluster?: Cluster;
  amount: string; // lamports as string to survive JSON
  tokenMint?: string;
  memo?: string;
  expiryHours?: number;
}

export interface EscrowCreateTipResponse {
  mode: "ESCROW_CLAIM";
  tipIntentId: string;
  status: TipStatus;
  cluster: Cluster;
  claimLink: string;
  claimToken: string; // raw, for immediate copy — never persisted
  expiryAt: string;
  tipIdBytes: string;
  escrowPda: string;
  authorityPda: string;
  programId: string;
  amount: string;
  tokenMint: string;
  tokenSymbol: string;
  tokenDecimals: number;
  depositPayload: {
    tipIdBytes: string;
    escrowPda: string;
    authorityPda: string;
    amount: string;
    expiryAt: number; // unix seconds
    programId: string;
  };
}

export interface DirectSendCreateTipResponse {
  mode: "DIRECT_SEND";
  tipIntentId: string;
  status: TipStatus;
  cluster: Cluster;
  rail: TipRail;
  recipientWallet: string;
  recipientHandle: string;
  recipientHandleType: HandleType;
  expiryAt: string;
  amount: string;
  tokenMint: string;
  tokenSymbol: string;
  tokenDecimals: number;
  /**
   * For rail=loyal: the privateSendPayload carries the username +
   * token_mint the client needs to kick off Loyal's private transfer.
   * For rail=native: null.
   */
  privateSendPayload: {
    recipientUsername: string;
    tokenMint: string;
    amount: string;
    cluster: Cluster;
  } | null;
  /**
   * For rail=native: a plain system-transfer descriptor.
   */
  nativeSendPayload: {
    recipientWallet: string;
    amountLamports: string;
  } | null;
}

export type CreateTipResponse =
  | EscrowCreateTipResponse
  | DirectSendCreateTipResponse;

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: { code: string; message: string };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export const ERROR_CODES = {
  TIP_NOT_FOUND: "TIP_NOT_FOUND",
  TIP_EXPIRED: "TIP_EXPIRED",
  TIP_ALREADY_CLAIMED: "TIP_ALREADY_CLAIMED",
  TIP_CANCELLED: "TIP_CANCELLED",
  TIP_INVALID_STATE: "TIP_INVALID_STATE",
  CLAIM_TOKEN_INVALID: "CLAIM_TOKEN_INVALID",
  CLAIM_SESSION_INVALID: "CLAIM_SESSION_INVALID",
  OAUTH_MISMATCH: "OAUTH_MISMATCH",
  OAUTH_STATE_INVALID: "OAUTH_STATE_INVALID",
  OAUTH_FAILED: "OAUTH_FAILED",
  OAUTH_APP_NOT_ENROLLED: "OAUTH_APP_NOT_ENROLLED",
  WALLET_SIGNATURE_INVALID: "WALLET_SIGNATURE_INVALID",
  INSUFFICIENT_BALANCE: "INSUFFICIENT_BALANCE",
  INVALID_HANDLE: "INVALID_HANDLE",
  INVALID_AMOUNT: "INVALID_AMOUNT",
  INVALID_INPUT: "INVALID_INPUT",
  PROGRAM_ERROR: "PROGRAM_ERROR",
  NETWORK_ERROR: "NETWORK_ERROR",
  UNAUTHORIZED: "UNAUTHORIZED",
  INTERNAL: "INTERNAL",
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

export function errorMessage(code: ErrorCode): string {
  switch (code) {
    case "TIP_NOT_FOUND":
      return "We couldn't find that tip.";
    case "TIP_EXPIRED":
      return "This tip has expired. The sender has been refunded.";
    case "TIP_ALREADY_CLAIMED":
      return "This tip has already been claimed.";
    case "TIP_CANCELLED":
      return "This tip was cancelled by the sender.";
    case "TIP_INVALID_STATE":
      return "This tip can't be updated in its current state.";
    case "CLAIM_TOKEN_INVALID":
      return "This claim link is invalid or has been revoked.";
    case "CLAIM_SESSION_INVALID":
      return "Your verification session expired. Please verify again.";
    case "OAUTH_MISMATCH":
      return "Your X handle doesn't match the tip's intended recipient.";
    case "OAUTH_STATE_INVALID":
      return "The verification request expired. Please try again.";
    case "OAUTH_FAILED":
      return "We couldn't verify with X. Please try again.";
    case "OAUTH_APP_NOT_ENROLLED":
      return "The X Developer App isn't attached to a Project (server config). Ask the operator to associate it and regenerate the OAuth 2.0 credentials.";
    case "WALLET_SIGNATURE_INVALID":
      return "Wallet signature verification failed.";
    case "INSUFFICIENT_BALANCE":
      return "Your wallet balance is too low for this tip.";
    case "INVALID_HANDLE":
      return "That doesn't look like a valid X handle.";
    case "INVALID_AMOUNT":
      return "Enter a positive amount.";
    case "INVALID_INPUT":
      return "Some inputs are invalid.";
    case "PROGRAM_ERROR":
      return "The on-chain program returned an error.";
    case "NETWORK_ERROR":
      return "Network error. Try again.";
    case "UNAUTHORIZED":
      return "You are not authorised for this action.";
    case "INTERNAL":
    default:
      return "Something went wrong on our end. Try again.";
  }
}
