/*
  Warnings:

  - You are about to drop the column `address` on the `wholesalers` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "wholesalers" DROP COLUMN "address",
ADD COLUMN     "userAddress" JSONB NOT NULL DEFAULT '[]';
