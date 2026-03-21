/*
  Warnings:

  - The values [CREDIT_CARD,DEBIT_CARD,CASH,DIGITAL_WALLET] on the enum `PaymentMethod` will be removed. If these variants are still used in the database, this will fail.
  - The `status` column on the `order_items` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `transactionId` on the `payments` table. All the data in the column will be lost.
  - You are about to drop the `projects` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `tasks` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[monnifyInvoiceRef]` on the table `orders` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[monnifyInvoiceRef]` on the table `payments` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[transactionRef]` on the table `payments` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `monnifyInvoiceRef` to the `payments` table without a default value. This is not possible if the table is not empty.
  - Made the column `orderId` on table `payments` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "OrderItemStatus" AS ENUM ('PENDING', 'CONFIRMED', 'SOURCING', 'READY', 'SHIPPED', 'DELIVERED', 'UNAVAILABLE', 'CANCELLED');

-- AlterEnum
BEGIN;
CREATE TYPE "PaymentMethod_new" AS ENUM ('BANK_TRANSFER', 'CHECKOUT_URL');
ALTER TABLE "payments" ALTER COLUMN "paymentMethod" TYPE "PaymentMethod_new" USING ("paymentMethod"::text::"PaymentMethod_new");
ALTER TYPE "PaymentMethod" RENAME TO "PaymentMethod_old";
ALTER TYPE "PaymentMethod_new" RENAME TO "PaymentMethod";
DROP TYPE "public"."PaymentMethod_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_assignedId_fkey";

-- DropForeignKey
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_projectId_fkey";

-- DropIndex
DROP INDEX "payments_transactionId_key";

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "processingNotes" TEXT,
ADD COLUMN     "statusUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "statusUpdatedBy" TEXT,
DROP COLUMN "status",
ADD COLUMN     "status" "OrderItemStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "checkoutUrl" TEXT,
ADD COLUMN     "monnifyInvoiceRef" TEXT,
ADD COLUMN     "paymentExpiresAt" TIMESTAMP(3),
ADD COLUMN     "virtualAccounts" JSONB;

-- AlterTable
ALTER TABLE "payments" DROP COLUMN "transactionId",
ADD COLUMN     "checkoutUrl" TEXT,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'NGN',
ADD COLUMN     "monnifyInvoiceRef" TEXT NOT NULL,
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "transactionRef" TEXT,
ADD COLUMN     "virtualAccounts" JSONB,
ADD COLUMN     "webhookData" JSONB,
ALTER COLUMN "orderId" SET NOT NULL,
ALTER COLUMN "paymentMethod" DROP NOT NULL;

-- DropTable
DROP TABLE "projects";

-- DropTable
DROP TABLE "tasks";

-- DropEnum
DROP TYPE "Priority";

-- DropEnum
DROP TYPE "ProjectStatus";

-- DropEnum
DROP TYPE "TaskStatus";

-- CreateIndex
CREATE UNIQUE INDEX "orders_monnifyInvoiceRef_key" ON "orders"("monnifyInvoiceRef");

-- CreateIndex
CREATE UNIQUE INDEX "payments_monnifyInvoiceRef_key" ON "payments"("monnifyInvoiceRef");

-- CreateIndex
CREATE UNIQUE INDEX "payments_transactionRef_key" ON "payments"("transactionRef");

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_statusUpdatedBy_fkey" FOREIGN KEY ("statusUpdatedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
