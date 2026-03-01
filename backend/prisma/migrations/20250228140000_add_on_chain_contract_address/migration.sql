-- Add column to track which contract an on-chain subscription belongs to
ALTER TABLE "subscriptions" ADD COLUMN "onChainContractAddress" TEXT;

-- Backfill: subscriptions that have onChainSubscriptionId were created on the previous (ERC20) contract
UPDATE "subscriptions"
SET "onChainContractAddress" = '0x470a1a866ef9f4dA1dbac367757AB62d94357f52'
WHERE "onChainSubscriptionId" IS NOT NULL AND "onChainContractAddress" IS NULL;
