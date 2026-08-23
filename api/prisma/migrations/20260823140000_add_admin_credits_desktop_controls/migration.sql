-- AlterTable
ALTER TABLE "CreditPurchase" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'purchase';
ALTER TABLE "CreditPurchase" ADD COLUMN "note" TEXT;

-- AlterTable
ALTER TABLE "License" ADD COLUMN "refundedAt" DATETIME;
ALTER TABLE "License" ADD COLUMN "refundReason" TEXT;
