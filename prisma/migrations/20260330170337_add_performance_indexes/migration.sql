-- CreateIndex
CREATE INDEX "order_items_orderId_status_idx" ON "order_items"("orderId", "status");

-- CreateIndex
CREATE INDEX "order_items_productId_status_idx" ON "order_items"("productId", "status");

-- CreateIndex
CREATE INDEX "orders_wholesalerId_status_orderDate_idx" ON "orders"("wholesalerId", "status", "orderDate");

-- CreateIndex
CREATE INDEX "orders_assignedProcurementOfficerId_assignmentStatus_idx" ON "orders"("assignedProcurementOfficerId", "assignmentStatus");

-- CreateIndex
CREATE INDEX "orders_status_submittedAt_orderDate_idx" ON "orders"("status", "submittedAt", "orderDate");

-- CreateIndex
CREATE INDEX "orders_monnifyInvoiceRef_idx" ON "orders"("monnifyInvoiceRef");

-- CreateIndex
CREATE INDEX "products_brandId_subcategoryId_idx" ON "products"("brandId", "subcategoryId");

-- CreateIndex
CREATE INDEX "products_manufacturerId_status_deletedAt_idx" ON "products"("manufacturerId", "status", "deletedAt");

-- CreateIndex
CREATE INDEX "products_variantId_status_deletedAt_idx" ON "products"("variantId", "status", "deletedAt");

-- CreateIndex
CREATE INDEX "products_status_quantity_deletedAt_idx" ON "products"("status", "quantity", "deletedAt");

-- CreateIndex
CREATE INDEX "products_name_status_idx" ON "products"("name", "status");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_username_idx" ON "users"("username");

-- CreateIndex
CREATE INDEX "users_role_status_emailVerified_idx" ON "users"("role", "status", "emailVerified");
