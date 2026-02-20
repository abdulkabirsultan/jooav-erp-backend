/*
  Warnings:

  - The values [CONFIRMED] on the enum `OrderItemStatus` will be removed. If these variants are still used in the database, this will fail.
  - The values [SUBMITTED,PROCESSING,SHIPPED,DELIVERED] on the enum `OrderStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "OrderItemStatus_new" AS ENUM ('PENDING', 'PAID', 'SOURCING', 'READY', 'SHIPPED', 'DELIVERED', 'UNAVAILABLE', 'CANCELLED');
ALTER TABLE "public"."order_items" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "order_items" ALTER COLUMN "status" TYPE "OrderItemStatus_new" USING ("status"::text::"OrderItemStatus_new");
ALTER TYPE "OrderItemStatus" RENAME TO "OrderItemStatus_old";
ALTER TYPE "OrderItemStatus_new" RENAME TO "OrderItemStatus";
DROP TYPE "public"."OrderItemStatus_old";
ALTER TABLE "order_items" ALTER COLUMN "status" SET DEFAULT 'PENDING';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "OrderStatus_new" AS ENUM ('DRAFT', 'CONFIRMED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
ALTER TABLE "public"."orders" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "orders" ALTER COLUMN "status" TYPE "OrderStatus_new" USING ("status"::text::"OrderStatus_new");
ALTER TYPE "OrderStatus" RENAME TO "OrderStatus_old";
ALTER TYPE "OrderStatus_new" RENAME TO "OrderStatus";
DROP TYPE "public"."OrderStatus_old";
ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
COMMIT;

-- DropEnum
DROP TYPE "ItemStatus";
