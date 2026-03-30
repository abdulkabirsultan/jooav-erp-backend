-- CreateIndex
CREATE INDEX "brands_status_idx" ON "brands"("status");

-- CreateIndex
CREATE INDEX "brands_manufacturerId_idx" ON "brands"("manufacturerId");

-- CreateIndex
CREATE INDEX "brands_createdAt_idx" ON "brands"("createdAt");

-- CreateIndex
CREATE INDEX "categories_status_idx" ON "categories"("status");

-- CreateIndex
CREATE INDEX "categories_createdAt_idx" ON "categories"("createdAt");

-- CreateIndex
CREATE INDEX "manufacturers_status_idx" ON "manufacturers"("status");

-- CreateIndex
CREATE INDEX "manufacturers_regionId_idx" ON "manufacturers"("regionId");

-- CreateIndex
CREATE INDEX "manufacturers_createdAt_idx" ON "manufacturers"("createdAt");

-- CreateIndex
CREATE INDEX "order_items_status_idx" ON "order_items"("status");

-- CreateIndex
CREATE INDEX "order_items_productId_idx" ON "order_items"("productId");

-- CreateIndex
CREATE INDEX "order_items_statusUpdatedAt_idx" ON "order_items"("statusUpdatedAt");

-- CreateIndex
CREATE INDEX "orders_wholesalerId_idx" ON "orders"("wholesalerId");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE INDEX "orders_createdAt_idx" ON "orders"("createdAt");

-- CreateIndex
CREATE INDEX "orders_assignmentStatus_idx" ON "orders"("assignmentStatus");

-- CreateIndex
CREATE INDEX "orders_assignedProcurementOfficerId_idx" ON "orders"("assignedProcurementOfficerId");

-- CreateIndex
CREATE INDEX "orders_submittedAt_idx" ON "orders"("submittedAt");

-- CreateIndex
CREATE INDEX "orders_orderDate_idx" ON "orders"("orderDate");

-- CreateIndex
CREATE INDEX "products_status_idx" ON "products"("status");

-- CreateIndex
CREATE INDEX "products_brandId_idx" ON "products"("brandId");

-- CreateIndex
CREATE INDEX "products_manufacturerId_idx" ON "products"("manufacturerId");

-- CreateIndex
CREATE INDEX "products_subcategoryId_idx" ON "products"("subcategoryId");

-- CreateIndex
CREATE INDEX "products_price_idx" ON "products"("price");

-- CreateIndex
CREATE INDEX "products_quantity_idx" ON "products"("quantity");

-- CreateIndex
CREATE INDEX "products_deletedAt_idx" ON "products"("deletedAt");

-- CreateIndex
CREATE INDEX "products_status_deletedAt_idx" ON "products"("status", "deletedAt");

-- CreateIndex
CREATE INDEX "products_createdAt_idx" ON "products"("createdAt");

-- CreateIndex
CREATE INDEX "subcategories_status_idx" ON "subcategories"("status");

-- CreateIndex
CREATE INDEX "subcategories_createdAt_idx" ON "subcategories"("createdAt");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE INDEX "users_emailVerified_idx" ON "users"("emailVerified");

-- CreateIndex
CREATE INDEX "users_lastLogin_idx" ON "users"("lastLogin");

-- CreateIndex
CREATE INDEX "users_role_status_idx" ON "users"("role", "status");

-- CreateIndex
CREATE INDEX "users_createdAt_idx" ON "users"("createdAt");
