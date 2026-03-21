-- CreateEnum
CREATE TYPE "ProcurementOfficerStatus" AS ENUM ('AVAILABLE', 'UNAVAILABLE', 'ON_BREAK', 'BUSY');

-- AlterTable
ALTER TABLE "procurement_officer_profiles" ADD COLUMN     "availabilityStatus" "ProcurementOfficerStatus" NOT NULL DEFAULT 'AVAILABLE',
ADD COLUMN     "availableFrom" TIMESTAMP(3),
ADD COLUMN     "maxActiveOrders" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "unavailabilityReason" TEXT;
