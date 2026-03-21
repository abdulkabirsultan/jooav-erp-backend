/*
  Warnings:

  - The values [APPROVE_SME,REJECT_SME] on the enum `AdminAction` will be removed. If these variants are still used in the database, this will fail.
  - The values [SME_USER] on the enum `ResourceType` will be removed. If these variants are still used in the database, this will fail.
  - The values [SME_USER] on the enum `UserRole` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `smeUserId` on the `inventory` table. All the data in the column will be lost.
  - You are about to drop the column `smeUserId` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the `sme_users` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[wholesalerId,productSku]` on the table `inventory` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `wholesalerId` to the `inventory` table without a default value. This is not possible if the table is not empty.
  - Added the required column `wholesalerId` to the `orders` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "WholesalerVerificationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'UNDER_REVIEW');

-- AlterEnum
BEGIN;
CREATE TYPE "AdminAction_new" AS ENUM ('LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT', 'TOKEN_REFRESH', 'TOKEN_REFRESH_FAILED', 'CREATE_MANUFACTURER', 'APPROVE_MANUFACTURER', 'SUSPEND_MANUFACTURER', 'APPROVE_WHOLESALER', 'REJECT_WHOLESALER', 'ASSIGN_SUB_ADMIN', 'UPDATE_ORDER_STATUS', 'MANAGE_INVENTORY', 'SYSTEM_CONFIG', 'USER_MANAGEMENT');
ALTER TABLE "admin_audit_logs" ALTER COLUMN "action" TYPE "AdminAction_new" USING ("action"::text::"AdminAction_new");
ALTER TYPE "AdminAction" RENAME TO "AdminAction_old";
ALTER TYPE "AdminAction_new" RENAME TO "AdminAction";
DROP TYPE "public"."AdminAction_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "ResourceType_new" AS ENUM ('MANUFACTURER', 'WHOLESALER', 'SUB_ADMIN', 'ORDER', 'INVENTORY', 'REGION', 'SYSTEM_CONFIG', 'ADMIN_AUTH');
ALTER TABLE "admin_audit_logs" ALTER COLUMN "resource" TYPE "ResourceType_new" USING ("resource"::text::"ResourceType_new");
ALTER TYPE "ResourceType" RENAME TO "ResourceType_old";
ALTER TYPE "ResourceType_new" RENAME TO "ResourceType";
DROP TYPE "public"."ResourceType_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "UserRole_new" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'PROCUREMENT_OFFICER', 'WHOLESALER');
ALTER TABLE "public"."users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "role" TYPE "UserRole_new" USING ("role"::text::"UserRole_new");
ALTER TYPE "UserRole" RENAME TO "UserRole_old";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
DROP TYPE "public"."UserRole_old";
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'WHOLESALER';
COMMIT;

-- DropForeignKey
ALTER TABLE "inventory" DROP CONSTRAINT "inventory_smeUserId_fkey";

-- DropForeignKey
ALTER TABLE "orders" DROP CONSTRAINT "orders_smeUserId_fkey";

-- DropForeignKey
ALTER TABLE "sme_users" DROP CONSTRAINT "sme_users_regionId_fkey";

-- DropForeignKey
ALTER TABLE "sme_users" DROP CONSTRAINT "sme_users_userId_fkey";

-- DropIndex
DROP INDEX "inventory_smeUserId_productSku_key";

-- AlterTable
ALTER TABLE "inventory" DROP COLUMN "smeUserId",
ADD COLUMN     "wholesalerId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "orders" DROP COLUMN "smeUserId",
ADD COLUMN     "wholesalerId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'WHOLESALER';

-- DropTable
DROP TABLE "sme_users";

-- DropEnum
DROP TYPE "SMEVerificationStatus";

-- CreateTable
CREATE TABLE "wholesalers" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "businessType" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "businessLicense" TEXT,
    "verificationStatus" "WholesalerVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "totalOrders" INTEGER NOT NULL DEFAULT 0,
    "totalSpent" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wholesalers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wholesalers_userId_key" ON "wholesalers"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_wholesalerId_productSku_key" ON "inventory"("wholesalerId", "productSku");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_wholesalerId_fkey" FOREIGN KEY ("wholesalerId") REFERENCES "wholesalers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wholesalers" ADD CONSTRAINT "wholesalers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wholesalers" ADD CONSTRAINT "wholesalers_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_wholesalerId_fkey" FOREIGN KEY ("wholesalerId") REFERENCES "wholesalers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
