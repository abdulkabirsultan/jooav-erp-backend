/*
  Warnings:

  - You are about to drop the column `packSize` on the `products` table. All the data in the column will be lost.
  - You are about to drop the column `packagingType` on the `products` table. All the data in the column will be lost.
  - Added the required column `packSizeId` to the `products` table without a default value. This is not possible if the table is not empty.
  - Added the required column `packTypeId` to the `products` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "PackSizeStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PackTypeStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- AlterTable
ALTER TABLE "products" DROP COLUMN "packSize",
DROP COLUMN "packagingType",
ADD COLUMN     "packSizeId" TEXT NOT NULL,
ADD COLUMN     "packTypeId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "pack_sizes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "status" "PackSizeStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "deletedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "pack_sizes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pack_types" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "status" "PackTypeStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "deletedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "pack_types_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pack_sizes_variantId_name_key" ON "pack_sizes"("variantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "pack_types_variantId_name_key" ON "pack_types"("variantId", "name");

-- AddForeignKey
ALTER TABLE "pack_sizes" ADD CONSTRAINT "pack_sizes_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pack_sizes" ADD CONSTRAINT "pack_sizes_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pack_sizes" ADD CONSTRAINT "pack_sizes_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pack_sizes" ADD CONSTRAINT "pack_sizes_deletedBy_fkey" FOREIGN KEY ("deletedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pack_types" ADD CONSTRAINT "pack_types_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pack_types" ADD CONSTRAINT "pack_types_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pack_types" ADD CONSTRAINT "pack_types_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pack_types" ADD CONSTRAINT "pack_types_deletedBy_fkey" FOREIGN KEY ("deletedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_packSizeId_fkey" FOREIGN KEY ("packSizeId") REFERENCES "pack_sizes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_packTypeId_fkey" FOREIGN KEY ("packTypeId") REFERENCES "pack_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
