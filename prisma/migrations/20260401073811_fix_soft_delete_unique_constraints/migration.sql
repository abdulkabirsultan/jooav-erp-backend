-- DropIndex
DROP INDEX "categories_name_key";

-- DropIndex
DROP INDEX "categories_slug_key";

-- DropIndex
DROP INDEX "products_name_key";

-- DropIndex
DROP INDEX "products_sku_key";

-- DropIndex
DROP INDEX "subcategories_categoryId_name_key";

-- DropIndex
DROP INDEX "subcategories_slug_key";

-- DropIndex
DROP INDEX "users_email_key";

-- DropIndex
DROP INDEX "users_username_key";

-- CreateIndex (Partial unique index for users - only applies to non-deleted records)
CREATE UNIQUE INDEX "users_email_active_key" ON "users"("email") WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "users_username_active_key" ON "users"("username") WHERE "deletedAt" IS NULL;

-- CreateIndex (Partial unique index for categories - only applies to non-deleted records)
CREATE UNIQUE INDEX "categories_name_active_key" ON "categories"("name") WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "categories_slug_active_key" ON "categories"("slug") WHERE "deletedAt" IS NULL;

-- CreateIndex (Partial unique index for subcategories - only applies to non-deleted records)
CREATE UNIQUE INDEX "subcategories_slug_active_key" ON "subcategories"("slug") WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "subcategories_categoryId_name_active_key" ON "subcategories"("categoryId", "name") WHERE "deletedAt" IS NULL;

-- CreateIndex (Partial unique index for products - only applies to non-deleted records)
CREATE UNIQUE INDEX "products_name_active_key" ON "products"("name") WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "products_sku_active_key" ON "products"("sku") WHERE "deletedAt" IS NULL;
