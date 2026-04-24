-- CreateTable
CREATE TABLE "tip_intent" (
    "id" UUID NOT NULL,
    "sender_wallet" VARCHAR(44) NOT NULL,
    "recipient_handle_type" VARCHAR(20) NOT NULL,
    "recipient_handle_value" VARCHAR(255) NOT NULL,
    "resolved_recipient_wallet" VARCHAR(44),
    "amount" BIGINT NOT NULL,
    "token_mint" VARCHAR(44) NOT NULL,
    "memo" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "expiry_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "claim_link_id" UUID,
    "tx_signature" VARCHAR(128),
    "refund_tx_signature" VARCHAR(128),
    "claim_tx_signature" VARCHAR(128),
    "claimed_at" TIMESTAMPTZ,
    "refunded_at" TIMESTAMPTZ,
    "cancelled_at" TIMESTAMPTZ,
    "tip_escrow_pda" VARCHAR(44),
    "tip_id_bytes" VARCHAR(64) NOT NULL,
    "error_code" VARCHAR(50),
    "error_message" TEXT,

    CONSTRAINT "tip_intent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity_map" (
    "id" UUID NOT NULL,
    "handle_type" VARCHAR(20) NOT NULL,
    "handle_value" VARCHAR(255) NOT NULL,
    "wallet_address" VARCHAR(44) NOT NULL,
    "verified_at" TIMESTAMPTZ NOT NULL,
    "verification_method" VARCHAR(50) NOT NULL,
    "revoked_at" TIMESTAMPTZ,

    CONSTRAINT "identity_map_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claim_link" (
    "id" UUID NOT NULL,
    "secret_token_hash" VARCHAR(128) NOT NULL,
    "intended_handle_type" VARCHAR(20) NOT NULL,
    "intended_handle_value" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "claimed_at" TIMESTAMPTZ,
    "claimed_by_wallet" VARCHAR(44),
    "revoked_at" TIMESTAMPTZ,

    CONSTRAINT "claim_link_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_event" (
    "id" UUID NOT NULL,
    "actor" VARCHAR(255),
    "event_type" VARCHAR(50) NOT NULL,
    "ref_id" UUID,
    "metadata_json" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tip_intent_claim_link_id_key" ON "tip_intent"("claim_link_id");

-- CreateIndex
CREATE UNIQUE INDEX "tip_intent_tip_id_bytes_key" ON "tip_intent"("tip_id_bytes");

-- CreateIndex
CREATE INDEX "tip_intent_status_idx" ON "tip_intent"("status");

-- CreateIndex
CREATE INDEX "tip_intent_expiry_at_idx" ON "tip_intent"("expiry_at");

-- CreateIndex
CREATE INDEX "tip_intent_sender_wallet_idx" ON "tip_intent"("sender_wallet");

-- CreateIndex
CREATE INDEX "identity_map_wallet_address_idx" ON "identity_map"("wallet_address");

-- CreateIndex
CREATE UNIQUE INDEX "identity_map_handle_type_handle_value_key" ON "identity_map"("handle_type", "handle_value");

-- CreateIndex
CREATE UNIQUE INDEX "claim_link_secret_token_hash_key" ON "claim_link"("secret_token_hash");

-- CreateIndex
CREATE INDEX "audit_event_event_type_idx" ON "audit_event"("event_type");

-- CreateIndex
CREATE INDEX "audit_event_ref_id_idx" ON "audit_event"("ref_id");

-- CreateIndex
CREATE INDEX "audit_event_created_at_idx" ON "audit_event"("created_at");

-- AddForeignKey
ALTER TABLE "tip_intent" ADD CONSTRAINT "tip_intent_claim_link_id_fkey" FOREIGN KEY ("claim_link_id") REFERENCES "claim_link"("id") ON DELETE SET NULL ON UPDATE CASCADE;
