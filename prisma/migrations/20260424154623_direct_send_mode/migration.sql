-- AlterTable
ALTER TABLE "tip_intent" ADD COLUMN     "mode" VARCHAR(20) NOT NULL DEFAULT 'ESCROW_CLAIM',
ADD COLUMN     "rail" VARCHAR(16),
ADD COLUMN     "token_decimals" INTEGER NOT NULL DEFAULT 9,
ADD COLUMN     "token_symbol" VARCHAR(16) NOT NULL DEFAULT 'SOL',
ADD COLUMN     "username_deposit_pda" VARCHAR(44);

-- CreateIndex
CREATE INDEX "tip_intent_resolved_recipient_wallet_cluster_idx" ON "tip_intent"("resolved_recipient_wallet", "cluster");

-- CreateIndex
CREATE INDEX "tip_intent_mode_cluster_idx" ON "tip_intent"("mode", "cluster");
