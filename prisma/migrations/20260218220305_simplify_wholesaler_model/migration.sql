/*
  Warnings:

  - You are about to drop the column `approvedAt` on the `wholesalers` table. All the data in the column will be lost.
  - You are about to drop the column `approvedBy` on the `wholesalers` table. All the data in the column will be lost.
  - You are about to drop the column `businessLicense` on the `wholesalers` table. All the data in the column will be lost.
  - You are about to drop the column `businessName` on the `wholesalers` table. All the data in the column will be lost.
  - You are about to drop the column `businessType` on the `wholesalers` table. All the data in the column will be lost.
  - You are about to drop the column `verificationStatus` on the `wholesalers` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "wholesalers" DROP CONSTRAINT "wholesalers_regionId_fkey";

-- AlterTable
ALTER TABLE "wholesalers" DROP COLUMN "approvedAt",
DROP COLUMN "approvedBy",
DROP COLUMN "businessLicense",
DROP COLUMN "businessName",
DROP COLUMN "businessType",
DROP COLUMN "verificationStatus",
ALTER COLUMN "regionId" DROP NOT NULL;

-- DropEnum
DROP TYPE "WholesalerVerificationStatus";

-- AddForeignKey
ALTER TABLE "wholesalers" ADD CONSTRAINT "wholesalers_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
