/*
  Warnings:

  - The values [PLACED,ACCEPTED,IN_TRANSIT,REJECTED] on the enum `OrderStatus` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `totalPrice` on the `order_items` table. All the data in the column will be lost.
  - You are about to alter the column `unitPrice` on the `order_items` table. The data in that column could be lost. The data in that column will be cast from `Decimal(10,2)` to `Decimal(8,2)`.
  - You are about to drop the column `acceptedDate` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `deliveredDate` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `discountAmount` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `estimatedDelivery` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `manufacturerId` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `notes` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `paymentMethod` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `paymentStatus` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `processingDate` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `procurementNotes` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `requiredDate` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `shippedDate` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `taxAmount` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `trackingNumber` on the `orders` table. All the data in the column will be lost.
  - The `deliveryAddress` column on the `orders` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Added the required column `lineTotal` to the `order_items` table without a default value. This is not possible if the table is not empty.
  - Made the column `smeUserId` on table `orders` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "ItemStatus" AS ENUM ('PENDING', 'SOURCING', 'READY', 'UNAVAILABLE');

-- AlterEnum
BEGIN;
CREATE TYPE "OrderStatus_new" AS ENUM ('DRAFT', 'SUBMITTED', 'CONFIRMED', 'ASSIGNED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED');
ALTER TABLE "public"."orders" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "orders" ALTER COLUMN "status" TYPE "OrderStatus_new" USING ("status"::text::"OrderStatus_new");
ALTER TYPE "OrderStatus" RENAME TO "OrderStatus_old";
ALTER TYPE "OrderStatus_new" RENAME TO "OrderStatus";
DROP TYPE "public"."OrderStatus_old";
ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
COMMIT;

-- DropForeignKey
ALTER TABLE "inventory_movements" DROP CONSTRAINT "inventory_movements_orderId_fkey";

-- DropForeignKey
ALTER TABLE "orders" DROP CONSTRAINT "orders_manufacturerId_fkey";

-- DropForeignKey
ALTER TABLE "orders" DROP CONSTRAINT "orders_smeUserId_fkey";

-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_orderId_fkey";

-- AlterTable
ALTER TABLE "order_items" DROP COLUMN "totalPrice",
ADD COLUMN     "lineTotal" DECIMAL(10,2) NOT NULL,
ADD COLUMN     "status" "ItemStatus" NOT NULL DEFAULT 'PENDING',
ALTER COLUMN "unitPrice" SET DATA TYPE DECIMAL(8,2);

-- AlterTable
ALTER TABLE "orders" DROP COLUMN "acceptedDate",
DROP COLUMN "deliveredDate",
DROP COLUMN "discountAmount",
DROP COLUMN "estimatedDelivery",
DROP COLUMN "manufacturerId",
DROP COLUMN "notes",
DROP COLUMN "paymentMethod",
DROP COLUMN "paymentStatus",
DROP COLUMN "processingDate",
DROP COLUMN "procurementNotes",
DROP COLUMN "requiredDate",
DROP COLUMN "shippedDate",
DROP COLUMN "taxAmount",
DROP COLUMN "trackingNumber",
ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "customerNotes" TEXT,
ADD COLUMN     "submittedAt" TIMESTAMP(3),
ALTER COLUMN "smeUserId" SET NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'DRAFT',
DROP COLUMN "deliveryAddress",
ADD COLUMN     "deliveryAddress" JSONB;

-- AlterTable
ALTER TABLE "payments" ALTER COLUMN "orderId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_smeUserId_fkey" FOREIGN KEY ("smeUserId") REFERENCES "sme_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
