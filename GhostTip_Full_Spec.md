# GhostTip — Complete Product, Architecture & Engineering Spec

> **Version:** 1.0 | **Target:** Loyal Hackathon  
> **Stack:** Next.js · Solana · Anchor · Loyal SDK · PostgreSQL · Redis  
> **Privacy Model:** Loyal Private Transaction Rail  
> **Identity Gate:** X OAuth (Twitter OAuth 2.0)

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Core Problem Being Solved](#2-core-problem-being-solved)
3. [How Loyal Network Fits In](#3-how-loyal-network-fits-in)
4. [Product Principles](#4-product-principles)
5. [User Roles](#5-user-roles)
6. [High-Level System Architecture](#6-high-level-system-architecture)
7. [Full Flow — Step by Step](#7-full-flow--step-by-step)
8. [Identity & Claim Verification Layer](#8-identity--claim-verification-layer)
9. [Tip State Machine](#9-tip-state-machine)
10. [On-Chain Program Design (Anchor)](#10-on-chain-program-design-anchor)
11. [Off-Chain Backend Design](#11-off-chain-backend-design)
12. [Data Models](#12-data-models)
13. [API Reference](#13-api-reference)
14. [Frontend Architecture](#14-frontend-architecture)
15. [Security Model & Attack Mitigations](#15-security-model--attack-mitigations)
16. [Edge Cases & Failure Handling](#16-edge-cases--failure-handling)
17. [Event System & Observability](#17-event-system--observability)
18. [Tech Stack Summary](#18-tech-stack-summary)
19. [MVP Scope](#19-mvp-scope)
20. [Demo Script](#20-demo-script)

---

## 1. Project Overview

**GhostTip** is a privacy-first tipping layer built on Solana, using the Loyal Network's private transaction rail. It allows a sender to tip any person by their **social identity handle** (X/Twitter username) without either party exposing public wallet relationships.

The recipient does not need to be pre-registered. They receive a **claim link**, verify their identity via **X OAuth**, connect a wallet, and claim the funds. If they never claim, the tip automatically refunds the sender after a configurable expiry window.

### What makes it different from a normal wallet transfer

| Normal Transfer | GhostTip |
|---|---|
| Needs recipient wallet address | Only needs recipient's X handle |
| Public on-chain relationship | Private via Loyal tx rail |
| Recipient must be ready | Recipient claims when they want |
| No expiry | Auto-refund after expiry |
| No identity binding | X OAuth gates the claim |

---

## 2. Core Problem Being Solved

### Problem A — Address friction
Sending crypto requires knowing a wallet address. Normal people don't share wallet addresses. Social handles are the real identity primitive on the internet.

### Problem B — Public wallet exposure
A standard Solana transfer links sender and recipient wallets permanently and publicly on-chain. For tipping someone on social media, this is undesirable — it exposes financial relationships.

### Problem C — Recipient onboarding chicken-and-egg
If a tipping app requires the recipient to already have an account, the sender can only tip existing users. This kills growth. GhostTip solves this with the **claim link model** — the sender tips any handle, and the recipient onboards at claim time.

### Problem D — No accountability on claim
If the claim link is just a secret URL, anyone who gets that URL can steal the tip. GhostTip solves this with **X OAuth verification** — only the person who can log in as the intended X handle can unlock the claim.

---

## 3. How Loyal Network Fits In

Loyal is a Solana-based privacy network that provides:

- **Private SPL token transfers** — sender and recipient wallet addresses are not directly linked in a standard public transaction
- **Ephemeral session model** — identity-preserving sessions that abstract raw wallet relationships from public view
- **Identity-based sending** — the ability to send to a username or identity rather than a raw address
- **SDK** — JavaScript/TypeScript SDK for frontend and backend integration

### What GhostTip builds on top of Loyal

```
Loyal provides:     Private tx rail, wallet connection, identity session
GhostTip adds:      Claim link flow, X OAuth gate, escrow state machine,
                    expiry/refund logic, tip status UI
```

GhostTip is not a fork of Loyal. It is an application layer that uses Loyal's private transfer primitive as the settlement mechanism, and wraps it with a product experience around social tipping.

---

## 4. Product Principles

### 1. Zero signup for senders
Sender connects a wallet and tips. Nothing else. No email, no profile, no verification. Anything more hurts conversion.

### 2. Claim-based recipient onboarding
Recipients onboard at claim time via X OAuth. The tip can be sent before the recipient has ever heard of GhostTip.

### 3. Identity is separate from wallet
The handle-to-wallet mapping is created at claim time through an explicit user action, not inferred from on-chain data.

### 4. Expiry is not optional
Funds cannot sit unclaimed forever. Every tip has an expiry window. After expiry, funds are automatically refunded to the sender.

### 5. Private by default
The product minimizes public wallet exposure through Loyal's private rail. It does not promise "untraceable" or "invisible" — it promises minimized public linkage.

### 6. Social native UX
Tipping should feel like a lightweight social action, not a crypto transfer. The language, UI, and flow are designed around social behavior, not DeFi patterns.

---

## 5. User Roles

### Sender
- Connects their wallet
- Enters a recipient X handle, an amount, and an optional message
- Sends the tip through the Loyal private rail
- Receives a claim link to share (or it is shared automatically)
- Gets refunded if the recipient never claims

### Recipient
- Receives a claim link (via DM, post, or notification)
- Opens the claim page
- Authenticates with X OAuth to prove handle ownership
- Connects a wallet
- Claims the funds

### Admin / Operator (internal)
- Monitors stuck claims
- Handles edge-case manual refunds
- Reviews abuse reports
- Accesses the audit event log

---

## 6. High-Level System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          FRONTEND (Next.js)                         │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │  Send Screen │  │ Claim Screen │  │   Tip Status Screen      │  │
│  │  - Wallet    │  │ - OAuth gate │  │   - State polling        │  │
│  │  - Handle    │  │ - Wallet     │  │   - Countdown timer      │  │
│  │  - Amount    │  │ - Claim btn  │  │   - Refund CTA           │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────────────────────┘  │
└─────────┼─────────────────┼───────────────────────────────────────┘
          │ API calls        │ API calls
          ▼                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        BACKEND (Next.js API Routes / Node)          │
│                                                                     │
│  ┌─────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │  Tip Service    │  │  Identity Service │  │  Claim Service   │  │
│  │  - Create tip   │  │  - Handle lookup  │  │  - OAuth verify  │  │
│  │  - State mgmt   │  │  - Map wallet     │  │  - Token check   │  │
│  │  - Expiry jobs  │  │  - Verify handle  │  │  - Release funds │  │
│  └────────┬────────┘  └─────────┬────────┘  └────────┬─────────┘  │
│           │                     │                     │             │
│  ┌────────▼─────────────────────▼─────────────────────▼──────────┐ │
│  │                      PostgreSQL (primary state)                │ │
│  │  TipIntent | IdentityMap | ClaimLink | AuditEvent             │ │
│  └────────────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │              Redis (ephemeral / queues / tokens)               │ │
│  │  Claim tokens | Expiry queues | Session state                 │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
          │ Loyal SDK calls
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     LOYAL NETWORK (Private TX Rail)                 │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Private transfer initiation → Escrow/Claimable state        │  │
│  │  Claim release → Refund execution                            │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
          │ Settlement layer
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         SOLANA (Mainnet/Devnet)                     │
│                                                                     │
│  Anchor Program: GhostTip Escrow                                   │
│  - deposit_tip()                                                    │
│  - claim_tip()                                                      │
│  - refund_tip()                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 7. Full Flow — Step by Step

### 7.1 Sender Flow

```
Step 1: Connect Wallet
  └─> Sender opens GhostTip
  └─> Connects Solana wallet (Phantom / Backpack / Solflare)
  └─> Balance check runs silently

Step 2: Enter Recipient Info
  └─> Sender enters: @elonmusk (X handle)
  └─> Backend checks IdentityMap table
      ├─> Handle already verified?  → resolve to wallet directly
      └─> Handle not in system?     → create new TipIntent + ClaimLink

Step 3: Enter Amount & Message
  └─> Token: SOL or SPL (USDC etc.)
  └─> Amount: validated against balance
  └─> Memo: optional text message (encrypted in tip, revealed at claim)
  └─> Expiry: default 7 days (configurable)

Step 4: Sign & Send
  └─> Sender signs a transaction
  └─> Loyal SDK routes through private tx rail
  └─> Funds go into escrow PDA
  └─> Backend creates TipIntent with status = CLAIMABLE
  └─> ClaimLink generated with secret token (hashed, stored)

Step 5: Confirmation
  └─> Sender sees: claim link, countdown timer, share options
  └─> Optional: copy link to DM to @elonmusk on X
  └─> Optional: X share card generated
```

### 7.2 Recipient Flow

```
Step 1: Open Claim Link
  └─> URL format: ghosttip.xyz/claim/{claimToken}
  └─> Backend validates: token exists, not expired, not already claimed

Step 2: X OAuth Verification Gate  ← THIS IS THE KEY SECURITY STEP
  └─> Recipient clicks "Verify with X"
  └─> Redirected to Twitter OAuth 2.0
  └─> Twitter returns: access_token + X username
  └─> Backend checks: does returned X username === intended handle?
      ├─> Match   → gate opens, proceed to wallet connect
      └─> No match → show error: "This tip is for @elonmusk only"

Step 3: Connect Wallet
  └─> Recipient connects their Solana wallet
  └─> If first time: wallet gets stored in IdentityMap for @elonmusk
  └─> Wallet signature challenge to prove ownership

Step 4: Claim Funds
  └─> Backend calls claim_tip() on Anchor program
  └─> Escrow PDA releases funds to recipient wallet
  └─> TipIntent status → CLAIMED
  └─> ClaimLink marked as used
  └─> AuditEvent logged

Step 5: Post-Claim
  └─> Recipient sees: claim successful, amount received
  └─> Sender gets notification: "Your tip was claimed"
```

### 7.3 Expiry & Refund Flow

```
Expiry Job (runs every N minutes via cron):
  └─> Query TipIntent WHERE status = CLAIMABLE AND expiry_at < NOW()
  └─> For each expired tip:
      ├─> Call refund_tip() on Anchor program
      ├─> Funds released back to sender wallet
      ├─> TipIntent status → REFUNDED
      └─> AuditEvent logged + sender notified
```

---

## 8. Identity & Claim Verification Layer

This is the most security-critical part of the product.

### 8.1 The Core Problem

A claim link is a secret URL. Without additional verification, anyone who obtains the URL can claim the tip. This is unacceptable. The question is:

> "How do we ensure only @elonmusk can claim a tip sent to @elonmusk?"

### 8.2 Solution: X OAuth 2.0 Identity Gate

```
Sender specifies @elonmusk as recipient
         │
         ▼
ClaimLink created, stored with: intended_handle = "elonmusk"
         │
         ▼
Recipient opens claim link
         │
         ▼
"Verify your identity to claim this tip"
         │
         ▼
Recipient clicks → redirected to accounts.twitter.com/oauth/authorize
         │
         ▼
Twitter returns: { access_token, username: "elonmusk" }
         │
         ▼
Backend verification:
  claimed_username = getXUsername(access_token)
  if (claimed_username !== intended_handle) → REJECT
  if (claimed_username === intended_handle) → UNLOCK claim
         │
         ▼
Wallet connect + claim execution
```

### 8.3 IdentityMap Binding

Once a recipient successfully claims via OAuth, their X handle is permanently mapped to their wallet address in the `IdentityMap` table. Future tips to the same handle can resolve directly to a wallet without requiring another OAuth flow.

```
First claim:   @elonmusk → OAuth verify → wallet connect → map stored
Future tips:   @elonmusk → map found → send directly to wallet
```

### 8.4 Handle Resolution Priority Order

```
1. Check IdentityMap for existing verified mapping
   └─> Found: send directly (no claim link needed)
2. No mapping found → create ClaimLink
   └─> Recipient must OAuth verify to claim
3. Handle invalid / blocked / reserved → reject with clear error
```

### 8.5 What happens if the wrong person tries to claim

```
Attacker gets claim link for @elonmusk tip
    │
    ▼
Attacker clicks "Verify with X"
    │
    ▼
Attacker logs in with their own X account: @hacker123
    │
    ▼
Backend: "hacker123" !== "elonmusk"
    │
    ▼
Returns 403: "This tip can only be claimed by @elonmusk"
    │
    ▼
Attacker cannot proceed. Tip remains claimable until expiry.
```

---

## 9. Tip State Machine

Every tip is a state machine. No tip can skip states or go backwards.

```
                    ┌─────────────────────────────────────────────┐
                    │                                             │
  DRAFT ──────► PENDING ──────► CLAIMABLE ──────► CLAIMED        │
                    │               │                             │
                    │               ├──────► EXPIRED ──► REFUNDED │
                    │               │                             │
                    │               └──────► CANCELLED            │
                    │                                             │
                    └──────────────────────────────► FAILED       │
                                                                  │
                    └─────────────────────────────────────────────┘
```

### State Definitions

| State | Description | Who triggers |
|---|---|---|
| `DRAFT` | Sender is filling out the tip form | Frontend |
| `PENDING` | Tx submitted to Loyal/Solana, awaiting confirmation | Loyal SDK |
| `CLAIMABLE` | Escrow confirmed, claim link active | Backend (on-chain event) |
| `CLAIMED` | Recipient verified + claimed funds | Backend (claim service) |
| `EXPIRED` | Claim window ended, no one claimed | Cron job |
| `REFUNDED` | Sender received funds back | On-chain refund tx |
| `CANCELLED` | Sender cancelled before finalization | Sender action |
| `FAILED` | Transaction or claim failed unrecoverably | Error handler |

### State Transition Rules

```
DRAFT      → PENDING     : sender signs and submits tx
PENDING    → CLAIMABLE   : on-chain escrow confirmed
PENDING    → FAILED      : tx fails or times out
CLAIMABLE  → CLAIMED     : recipient verifies + claims
CLAIMABLE  → EXPIRED     : expiry_at passes with no claim
CLAIMABLE  → CANCELLED   : sender cancels before claim
EXPIRED    → REFUNDED    : refund tx confirmed
```

---

## 10. On-Chain Program Design (Anchor)

### 10.1 Program Overview

The Anchor program manages the escrow lifecycle on Solana. It holds funds during the claimable window and releases them on claim or refund.

### 10.2 PDA Structure

```rust
// Escrow account PDA
// Seeds: ["tip_escrow", tip_id_bytes]
// Authority: GhostTip program

pub struct TipEscrow {
    pub tip_id: [u8; 32],         // unique ID (uuid as bytes)
    pub sender: Pubkey,           // sender wallet
    pub recipient: Pubkey,        // resolved recipient (set at claim or init)
    pub amount: u64,              // lamports or token amount
    pub token_mint: Pubkey,       // SOL = system, else SPL mint
    pub expiry_at: i64,           // unix timestamp
    pub status: TipStatus,        // enum
    pub bump: u8,
}

pub enum TipStatus {
    Claimable,
    Claimed,
    Refunded,
    Cancelled,
}
```

### 10.3 Instructions

#### `deposit_tip`
Called by the sender. Deposits funds into the escrow PDA.

```rust
pub fn deposit_tip(
    ctx: Context<DepositTip>,
    tip_id: [u8; 32],
    amount: u64,
    expiry_at: i64,
) -> Result<()>
```

Accounts required:
- `sender` (signer, mutable)
- `tip_escrow` (PDA, initialized)
- `system_program` (for SOL) or `token_program` (for SPL)

#### `claim_tip`
Called by the GhostTip backend (authority) after verifying recipient identity off-chain. Releases funds to recipient.

```rust
pub fn claim_tip(
    ctx: Context<ClaimTip>,
    tip_id: [u8; 32],
    recipient: Pubkey,
) -> Result<()>
```

Security: This instruction is only callable by the GhostTip program authority keypair, not by arbitrary wallets.

#### `refund_tip`
Called by the expiry cron job (backend authority) after expiry_at passes.

```rust
pub fn refund_tip(
    ctx: Context<RefundTip>,
    tip_id: [u8; 32],
) -> Result<()>
```

Checks: `Clock::get()?.unix_timestamp >= escrow.expiry_at`

#### `cancel_tip`
Called by the sender before the tip is claimed.

```rust
pub fn cancel_tip(
    ctx: Context<CancelTip>,
    tip_id: [u8; 32],
) -> Result<()>
```

Checks: signer must be original `sender` pubkey. Status must be `Claimable`.

### 10.4 Authority Model

```
Sender          → can call deposit_tip, cancel_tip
Backend authority keypair → can call claim_tip, refund_tip
No one else     → cannot touch the escrow
```

This is critical: `claim_tip` and `refund_tip` are not user-callable. Only the GhostTip backend authority can trigger them, after performing off-chain verification (OAuth, expiry check).

---

## 11. Off-Chain Backend Design

### 11.1 Services

#### Tip Service
Handles tip lifecycle management.

Responsibilities:
- Create TipIntent record in DB
- Poll on-chain status for PENDING tips
- Transition tip states in DB to match on-chain reality
- Expose tip status to frontend

#### Identity Service
Handles handle-to-wallet resolution.

Responsibilities:
- Look up IdentityMap for existing verified mappings
- Store new mappings after successful OAuth + wallet claim
- Validate handle format (X handle rules, reserved names, etc.)
- Cache hot handles in Redis for fast lookup

#### Claim Service
Handles the claim flow.

Responsibilities:
- Validate claim token (exists, not expired, not used)
- Initiate X OAuth flow
- Verify returned OAuth username matches intended handle
- Call `claim_tip` on the Anchor program after verification
- Mark ClaimLink and TipIntent as used/claimed
- Emit `tip_claimed` event

#### Expiry Job (Cron)
Runs on a schedule (every 5 minutes recommended).

Responsibilities:
- Query all CLAIMABLE tips where `expiry_at < NOW()`
- For each: call `refund_tip` on Anchor program
- Update TipIntent status to EXPIRED → REFUNDED
- Emit `tip_refunded` event
- Notify sender

### 11.2 API Routes (Next.js API)

See Section 13 for full API reference.

### 11.3 Redis Usage

| Key Pattern | Purpose | TTL |
|---|---|---|
| `claim_token:{token_hash}` | Maps token hash to tip_intent_id | 7 days |
| `oauth_state:{state}` | CSRF protection for OAuth flow | 10 minutes |
| `identity_cache:{handle}` | Cached wallet lookup | 1 hour |
| `expiry_queue` | Sorted set of tip IDs by expiry_at | Persistent |
| `session:{session_id}` | Sender session state | 24 hours |

---

## 12. Data Models

### TipIntent

```sql
CREATE TABLE tip_intent (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_wallet           VARCHAR(44) NOT NULL,
  recipient_handle_type   VARCHAR(20) NOT NULL,  -- 'x', 'telegram', 'ghosttip'
  recipient_handle_value  VARCHAR(255) NOT NULL,
  resolved_recipient_wallet VARCHAR(44),          -- filled at claim time
  amount                  BIGINT NOT NULL,         -- in lamports or token base units
  token_mint              VARCHAR(44) NOT NULL,    -- system for SOL
  memo                    TEXT,
  status                  VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  expiry_at               TIMESTAMPTZ NOT NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claim_link_id           UUID REFERENCES claim_link(id),
  tx_signature            VARCHAR(128),            -- deposit tx
  refund_tx_signature     VARCHAR(128),
  claimed_at              TIMESTAMPTZ,
  refunded_at             TIMESTAMPTZ,
  tip_escrow_pda          VARCHAR(44)              -- on-chain PDA address
);
```

### IdentityMap

```sql
CREATE TABLE identity_map (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  handle_type         VARCHAR(20) NOT NULL,    -- 'x', 'telegram', 'ghosttip'
  handle_value        VARCHAR(255) NOT NULL,
  wallet_address      VARCHAR(44) NOT NULL,
  verified_at         TIMESTAMPTZ NOT NULL,
  verification_method VARCHAR(50) NOT NULL,   -- 'oauth_x', 'claim_link', 'manual'
  revoked_at          TIMESTAMPTZ,
  UNIQUE(handle_type, handle_value)
);
```

### ClaimLink

```sql
CREATE TABLE claim_link (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tip_intent_id       UUID NOT NULL REFERENCES tip_intent(id),
  secret_token_hash   VARCHAR(128) NOT NULL UNIQUE,  -- SHA-256 of raw token
  intended_handle_type  VARCHAR(20) NOT NULL,
  intended_handle_value VARCHAR(255) NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at          TIMESTAMPTZ NOT NULL,
  claimed_at          TIMESTAMPTZ,
  claimed_by_wallet   VARCHAR(44),
  revoked_at          TIMESTAMPTZ
);
```

### AuditEvent

```sql
CREATE TABLE audit_event (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor         VARCHAR(255),          -- wallet or handle
  event_type    VARCHAR(50) NOT NULL,
  ref_id        UUID,                  -- tip_intent_id or claim_link_id
  metadata_json JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 13. API Reference

### POST `/api/tips`
Create a new tip intent.

**Request:**
```json
{
  "senderWallet": "ABC...XYZ",
  "recipientHandle": "@elonmusk",
  "handleType": "x",
  "amount": 100000000,
  "tokenMint": "So11111111111111111111111111111111111111112",
  "memo": "Great tweet!",
  "expiryDays": 7
}
```

**Response:**
```json
{
  "tipIntentId": "uuid",
  "status": "DRAFT",
  "claimLink": "https://ghosttip.xyz/claim/abc123token",
  "expiryAt": "2025-xx-xx",
  "escrowPda": "PDA...address"
}
```

---

### POST `/api/tips/:id/submit`
Called after sender signs and submits the deposit tx.

**Request:**
```json
{ "txSignature": "5abc...xyz" }
```

**Response:**
```json
{ "status": "PENDING", "message": "Awaiting on-chain confirmation" }
```

---

### GET `/api/tips/:id`
Fetch current tip status. Called by frontend for polling.

**Response:**
```json
{
  "tipIntentId": "uuid",
  "status": "CLAIMABLE",
  "amount": 100000000,
  "tokenMint": "...",
  "expiryAt": "2025-xx-xx",
  "claimedAt": null,
  "refundedAt": null
}
```

---

### GET `/api/claim/:token`
Validate a claim token and return tip preview.

**Response:**
```json
{
  "valid": true,
  "tipPreview": {
    "amount": 100000000,
    "token": "SOL",
    "memo": "Great tweet!",
    "expiryAt": "2025-xx-xx",
    "intendedHandle": "@elonmusk"
  }
}
```

Returns `{ "valid": false, "reason": "expired" }` if expired or used.

---

### POST `/api/claim/:token/verify`
Called after X OAuth completes. Backend verifies identity.

**Request:**
```json
{ "oauthCode": "...", "oauthState": "..." }
```

**Response:**
```json
{
  "verified": true,
  "claimSession": "short-lived-session-token"
}
```

---

### POST `/api/claim/:token/execute`
Final claim execution. Recipient provides wallet.

**Request:**
```json
{
  "claimSession": "...",
  "recipientWallet": "ABC...XYZ",
  "walletSignature": "..."
}
```

**Response:**
```json
{
  "success": true,
  "txSignature": "on-chain-claim-tx",
  "amount": 100000000
}
```

---

### POST `/api/tips/:id/cancel`
Sender cancels a CLAIMABLE tip (before expiry and before claim).

**Request:**
```json
{ "senderWallet": "...", "walletSignature": "..." }
```

---

## 14. Frontend Architecture

### Stack
- **Framework:** Next.js 14 (App Router)
- **Wallet:** `@solana/wallet-adapter-react`
- **Styling:** Tailwind CSS
- **State:** Zustand or React Context for tip/session state
- **Polling:** SWR or React Query for tip status
- **OAuth redirect:** Handled via Next.js API route `/api/auth/x/callback`

### Pages

| Route | Purpose |
|---|---|
| `/` | Send screen |
| `/claim/[token]` | Claim screen |
| `/tip/[id]` | Tip status screen |
| `/profile` | Sender's tip history |
| `/api/auth/x/callback` | X OAuth callback handler |

### Send Screen Components

```
<SendScreen>
  <WalletConnectButton />
  <HandleInput />            ← autocomplete, handle validation
  <TokenAmountInput />       ← token selector + amount
  <MemoInput />              ← optional message
  <ExpirySelector />         ← default 7d, configurable
  <SendButton />             ← disabled until wallet connected
  <ConfirmationModal>
    <TipSummary />
    <ClaimLinkDisplay />
    <CountdownTimer />
    <ShareToXButton />
  </ConfirmationModal>
</SendScreen>
```

### Claim Screen Components

```
<ClaimScreen>
  <TipPreviewCard />         ← amount, token, memo, sender (anonymous)
  <CountdownTimer />         ← time left to claim
  <XOAuthButton />           ← "Verify with X to unlock"
  <WalletConnectButton />    ← shown only after OAuth verified
  <ClaimButton />            ← shown only after wallet connected
  <ClaimedConfirmation />    ← shown after success
</ClaimScreen>
```

### Tip Status Screen Components

```
<TipStatusScreen>
  <StatusBadge />            ← CLAIMABLE / CLAIMED / EXPIRED / REFUNDED
  <TipDetails />
  <CountdownTimer />         ← only for CLAIMABLE
  <CancelButton />           ← only for CLAIMABLE (sender view)
  <RefundStatusBar />        ← only for EXPIRED/REFUNDED
</TipStatusScreen>
```

---

## 15. Security Model & Attack Mitigations

### 15.1 Claim Link Hijacking
**Attack:** Attacker intercepts or guesses the claim link.

**Mitigation:**
- Claim token is 32 bytes of cryptographically secure random data
- Only the SHA-256 hash is stored in DB
- X OAuth gate: even with the link, attacker must log in as the intended X handle
- Single-use: token is invalidated immediately after successful claim

### 15.2 OAuth Token Replay
**Attack:** Attacker intercepts an OAuth `code` and replays it.

**Mitigation:**
- Standard OAuth PKCE flow
- State parameter stored in Redis with 10-minute TTL
- State mismatch → reject

### 15.3 Wrong Wallet Claim
**Attack:** Recipient accidentally or maliciously uses wrong wallet.

**Mitigation:**
- Wallet signature challenge: recipient must sign a specific message proving wallet control
- Challenge message includes: `tip_id + claim_token + nonce`
- Backend verifies signature before executing claim

### 15.4 Double Claim
**Attack:** Two concurrent requests try to claim the same tip.

**Mitigation:**
- DB: `UPDATE claim_link SET claimed_at = NOW() WHERE id = $1 AND claimed_at IS NULL` — atomic, returns affected rows
- If affected rows = 0: claim already taken, reject
- On-chain: program checks escrow status before releasing

### 15.5 Fake Handle Squatting
**Attack:** Attacker registers @elonmusk on GhostTip before Elon does.

**Mitigation:**
- There is no "registration" for senders to discover handles
- Handle is only bound to a wallet at **claim time via OAuth**
- If @elonmusk has never claimed, no mapping exists — a new claim link is always generated
- An attacker cannot pre-claim @elonmusk because they cannot pass X OAuth as @elonmusk

### 15.6 Refund After Claim
**Attack:** Sender tries to trigger refund after recipient already claimed.

**Mitigation:**
- On-chain program checks `escrow.status == Claimable` before executing refund
- If status is `Claimed`, refund instruction fails with error

### 15.7 Clock Manipulation
**Attack:** Client sends manipulated timestamps to bypass expiry.

**Mitigation:**
- Backend never trusts client timestamps
- On-chain program uses `Clock::get()?.unix_timestamp` (Solana cluster time)
- Backend expiry checks use `NOW()` from PostgreSQL

---

## 16. Edge Cases & Failure Handling

### Sender has insufficient balance
- Balance check runs before showing the send button
- If balance drops between check and send: tx fails, TipIntent stays in DRAFT, user is notified

### Transaction submitted but UI crashes
- Backend polls tx signature for confirmation
- Frontend on reload fetches TipIntent by ID stored in localStorage
- State is reconstructed from on-chain + DB truth

### Recipient opens claim link after expiry
- API returns `{ valid: false, reason: "expired" }`
- UI shows: "This tip expired. The sender has been refunded."

### Recipient opens link, passes OAuth, then abandons wallet connect
- OAuth session stored in Redis for 30 minutes
- If they return within 30 minutes: skip OAuth step, go to wallet connect directly
- After 30 minutes: must re-verify via OAuth

### X OAuth returns wrong username due to account switch
- Backend strictly compares `returned_username.toLowerCase()` === `intended_handle.toLowerCase()`
- No fuzzy matching
- Error shown: "You're logged in as @wrong_user. This tip is for @intended_handle."

### Refund tx fails
- TipIntent marked as `refund_pending`
- Retry queue in Redis with exponential backoff
- Alert admin after 3 failed attempts
- Manual recovery path in admin UI

### Backend goes down during active tips
- On-chain escrow is source of truth
- Funds are safe in PDA
- When backend recovers: reconciliation job syncs on-chain state with DB
- Users can check on-chain status directly if needed

### Same recipient receives multiple tips before claiming
- Each tip is a separate TipIntent and ClaimLink
- Each has its own state machine
- No aggregation at claim time (keep it simple for MVP)

### Sender tries to cancel after recipient has opened the link
- "Open" does not mean "claimed"
- Sender CAN cancel as long as status is still `CLAIMABLE`
- Once `claim_tip` instruction executes on-chain, cancel is impossible

---

## 17. Event System & Observability

### 17.1 Events to Emit

All events are stored in the `AuditEvent` table and optionally pushed to a log stream.

| Event | Trigger |
|---|---|
| `tip_created` | TipIntent created in DB |
| `wallet_connected` | Sender connects wallet on send screen |
| `handle_resolved` | Handle lookup result (hit or miss) |
| `claim_link_created` | ClaimLink row created |
| `deposit_confirmed` | On-chain deposit tx confirmed |
| `claim_opened` | Claim link opened by anyone |
| `oauth_verified` | X OAuth returned matching username |
| `oauth_failed` | X OAuth returned non-matching username |
| `tip_claimed` | Claim tx confirmed on-chain |
| `tip_expired` | Expiry cron marks tip as expired |
| `tip_refunded` | Refund tx confirmed on-chain |
| `tip_cancelled` | Sender cancelled the tip |
| `transfer_failed` | Deposit or claim tx failed |

### 17.2 Metrics to Track

| Metric | Why it matters |
|---|---|
| Tips created / day | Growth signal |
| Claim success rate | Product health |
| Avg time to claim | UX signal |
| OAuth verification fail rate | Abuse signal |
| Expiry rate | Abandoned tip signal |
| Refund success rate | Financial reliability |
| Failed tx rate | Infrastructure health |

### 17.3 Logging Requirements

Every log entry should contain:
- `tip_intent_id`
- `timestamp`
- `event_type`
- `actor` (wallet or handle)
- `tx_signature` (if relevant)
- `error_code` (if failure)

---

## 18. Tech Stack Summary

| Layer | Technology | Why |
|---|---|---|
| Frontend | Next.js 14 (App Router) | SSR + API routes in one repo |
| Styling | Tailwind CSS | Fast, consistent |
| Wallet | `@solana/wallet-adapter-react` | Standard Solana wallet UX |
| On-chain | Anchor (Rust) | Safe Solana program framework |
| Private TX | Loyal Network SDK | Core privacy primitive |
| Backend API | Next.js API Routes | Co-located with frontend |
| Primary DB | PostgreSQL | Relational, strong consistency |
| Cache / Queue | Redis | Fast ephemeral data + cron queues |
| Identity OAuth | Twitter OAuth 2.0 (PKCE) | Prove X handle ownership |
| Token | SOL (native) + SPL tokens | Flexible payment options |
| Hosting | Vercel (frontend) + Railway/Render (DB) | Fast hackathon deployment |
| Cron jobs | Vercel Cron or node-cron | Expiry job execution |

---

## 19. MVP Scope

### Must-Have (Build This)

- [ ] Wallet connect for sender
- [ ] X handle input with basic validation
- [ ] SOL amount input
- [ ] Private send through Loyal SDK
- [ ] Escrow PDA on-chain (Anchor)
- [ ] ClaimLink generation
- [ ] Claim page with X OAuth gate
- [ ] Wallet connect + claim on claim page
- [ ] Expiry countdown timer (UI)
- [ ] Expiry cron job + refund execution
- [ ] Tip status page (CLAIMABLE / CLAIMED / EXPIRED / REFUNDED)
- [ ] Basic audit logging

### Nice-to-Have (If Time Allows)

- [ ] X share card (OG image with tip info)
- [ ] Optional memo / message unlock at claim
- [ ] Cancel tip flow
- [ ] Sender tip history page
- [ ] USDC / SPL token support
- [ ] Telegram handle support
- [ ] Email/push notifications

### Do Not Build for MVP

- Browser extension
- Full social graph / follow system
- Reputation or scoring system
- Multi-hop token routing
- Analytics dashboard
- Admin UI (manual DB inspection is fine for hackathon)

---

## 20. Demo Script

This is the exact script to run in front of judges.

```
1. Open GhostTip in Browser A (Sender tab)

2. Connect Phantom wallet (Sender)
   └─> Show balance check in top right

3. Enter "@targethandle" as recipient handle
   └─> Show "handle not yet registered — claim link will be generated"

4. Enter 0.1 SOL + message "Great work!"
   └─> Show expiry default of 7 days
   └─> Click Send

5. Show Phantom wallet popup — sender signs tx

6. Show confirmation screen:
   └─> Claim link generated
   └─> Countdown timer started
   └─> "Share this link with @targethandle"

7. Open Browser B (Recipient tab) — Incognito
   └─> Paste claim link
   └─> Show tip preview: 0.1 SOL, "Great work!", expires in 7d

8. Click "Verify with X"
   └─> X OAuth popup opens
   └─> Log in as @targethandle
   └─> OAuth returns, backend verifies username match
   └─> Gate opens

9. Connect recipient wallet in Browser B
   └─> Click Claim
   └─> Show success: "0.1 SOL received"

10. Switch back to Browser A
    └─> Tip status updated: CLAIMED
    └─> Show notification: "Your tip was claimed"

--- BONUS: Expiry Demo ---

11. Create a second tip with a very short expiry (1 minute for demo)
    └─> Show claim link
    └─> Wait 1 minute without claiming
    └─> Show tip status flips to EXPIRED
    └─> Show refund tx to sender wallet
```

---

## Appendix: Key Design Decisions & Rationale

### Why X OAuth instead of on-chain handle verification
On-chain handle verification would require a separate identity protocol (like SNS or similar) or manual admin review. X OAuth is fast to implement, instantly understandable to judges, and directly solves the "prove you own this handle" problem for the hackathon scope.

### Why the claim instruction is backend-controlled, not user-callable
If `claim_tip` were a public instruction, any wallet could attempt to call it directly, bypassing the OAuth gate. By making it only callable by the backend authority keypair, the OAuth verification is enforced at the program boundary.

### Why not store the claim secret in plain text
The raw claim token is never stored. Only its SHA-256 hash is stored in the DB. If the DB is compromised, the attacker gets hashes, not valid tokens. The raw token exists only in the generated URL.

### Why expiry is on-chain AND off-chain
The off-chain expiry cron job handles the operational refund trigger. But the on-chain program also enforces that `refund_tip` can only succeed if `Clock::get().unix_timestamp >= escrow.expiry_at`. This means even if the cron job fires early due to a bug, the on-chain program is the final authority.

### Why Loyal instead of building custom privacy infra
For a hackathon, building ZK proofs or custom stealth address schemes from scratch is not viable. Loyal provides a ready-made private transfer primitive, and building on top of it is exactly what their hackathon is designed to reward.

---

*Document generated for the Loyal Hackathon submission — GhostTip v1.0*
