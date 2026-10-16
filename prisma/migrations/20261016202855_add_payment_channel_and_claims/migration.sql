-- CreateEnum
CREATE TYPE "PaymentChannel" AS ENUM ('MONNIFY', 'MANUAL');

-- CreateEnum
CREATE TYPE "PaymentClaimStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "paymentChannel" "PaymentChannel",
ADD COLUMN     "paymentClaimRejectionReason" TEXT,
ADD COLUMN     "paymentClaimReviewedAt" TIMESTAMP(3),
ADD COLUMN     "paymentClaimReviewedById" TEXT,
ADD COLUMN     "paymentClaimStatus" "PaymentClaimStatus",
ADD COLUMN     "paymentClaimedAt" TIMESTAMP(3);

-- Backfill: orders with a Monnify invoice ref were initiated through Monnify
UPDATE "orders" SET "paymentChannel" = 'MONNIFY' WHERE "monnifyInvoiceRef" IS NOT NULL;

-- Backfill: orders that progressed past draft without a Monnify ref are manual (bank transfer)
UPDATE "orders"
SET "paymentChannel" = 'MANUAL'
WHERE "monnifyInvoiceRef" IS NULL
  AND "status" IN ('PENDING_PAYMENT', 'CONFIRMED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED');
