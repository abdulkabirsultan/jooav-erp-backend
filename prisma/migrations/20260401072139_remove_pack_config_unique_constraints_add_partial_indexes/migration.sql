-- DropIndex
DROP INDEX "pack_sizes_variantId_name_key";

-- DropIndex
DROP INDEX "pack_types_variantId_name_key";

-- CreateIndex (Partial unique index for pack sizes - only applies to non-deleted records)
CREATE UNIQUE INDEX "pack_sizes_variantId_name_active_key" ON "pack_sizes"("variantId", "name") WHERE "deletedAt" IS NULL;

-- CreateIndex (Partial unique index for pack types - only applies to non-deleted records)
CREATE UNIQUE INDEX "pack_types_variantId_name_active_key" ON "pack_types"("variantId", "name") WHERE "deletedAt" IS NULL;
