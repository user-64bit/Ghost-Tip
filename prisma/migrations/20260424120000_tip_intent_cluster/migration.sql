-- AlterTable: tag every TipIntent with the cluster it was sent on so
-- the sender's history can be filtered per-cluster (devnet vs mainnet,
-- etc). Existing rows default to 'devnet', matching the app default.
ALTER TABLE "tip_intent"
  ADD COLUMN "cluster" VARCHAR(16) NOT NULL DEFAULT 'devnet';

-- CreateIndex: fast lookup for the history endpoint's
-- (senderWallet, cluster) filter.
CREATE INDEX "tip_intent_sender_wallet_cluster_idx"
  ON "tip_intent"("sender_wallet", "cluster");
