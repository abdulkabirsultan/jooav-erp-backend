/*
  Warnings:

  - The values [ON_BREAK,BUSY] on the enum `ProcurementOfficerStatus` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `availableFrom` on the `procurement_officer_profiles` table. All the data in the column will be lost.
  - You are about to drop the column `unavailabilityReason` on the `procurement_officer_profiles` table. All the data in the column will be lost.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "ProcurementOfficerStatus_new" AS ENUM ('AVAILABLE', 'UNAVAILABLE');
ALTER TABLE "public"."procurement_officer_profiles" ALTER COLUMN "availabilityStatus" DROP DEFAULT;
ALTER TABLE "procurement_officer_profiles" ALTER COLUMN "availabilityStatus" TYPE "ProcurementOfficerStatus_new" USING ("availabilityStatus"::text::"ProcurementOfficerStatus_new");
ALTER TYPE "ProcurementOfficerStatus" RENAME TO "ProcurementOfficerStatus_old";
ALTER TYPE "ProcurementOfficerStatus_new" RENAME TO "ProcurementOfficerStatus";
DROP TYPE "public"."ProcurementOfficerStatus_old";
ALTER TABLE "procurement_officer_profiles" ALTER COLUMN "availabilityStatus" SET DEFAULT 'AVAILABLE';
COMMIT;

-- AlterTable
ALTER TABLE "procurement_officer_profiles" DROP COLUMN "availableFrom",
DROP COLUMN "unavailabilityReason";
