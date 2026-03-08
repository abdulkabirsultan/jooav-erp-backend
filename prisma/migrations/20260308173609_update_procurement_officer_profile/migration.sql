/*
  Warnings:

  - You are about to drop the column `employeeId` on the `procurement_officer_profiles` table. All the data in the column will be lost.
  - You are about to drop the column `code` on the `regions` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "procurement_officer_profiles_employeeId_key";

-- DropIndex
DROP INDEX "regions_code_key";

-- AlterTable
ALTER TABLE "procurement_officer_profiles" DROP COLUMN "employeeId";

-- AlterTable
ALTER TABLE "regions" DROP COLUMN "code";
