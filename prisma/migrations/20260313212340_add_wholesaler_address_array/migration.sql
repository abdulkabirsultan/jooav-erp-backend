-- AlterTable
ALTER TABLE "wholesalers" ADD COLUMN     "address" TEXT[] DEFAULT ARRAY[]::TEXT[];
