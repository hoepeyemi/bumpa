-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN "onChainSubscriptionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_onChainSubscriptionId_key" ON "subscriptions"("onChainSubscriptionId");
