-- CreateEnum
CREATE TYPE "OutOfStockReportStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateTable
CREATE TABLE "out_of_stock_reports" (
    "id" TEXT NOT NULL,
    "wholesalerId" TEXT NOT NULL,
    "status" "OutOfStockReportStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "out_of_stock_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "out_of_stock_report_items" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantityAffected" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "out_of_stock_report_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "out_of_stock_reports_wholesalerId_idx" ON "out_of_stock_reports"("wholesalerId");

-- CreateIndex
CREATE INDEX "out_of_stock_reports_status_idx" ON "out_of_stock_reports"("status");

-- CreateIndex
CREATE INDEX "out_of_stock_reports_createdAt_idx" ON "out_of_stock_reports"("createdAt");

-- CreateIndex
CREATE INDEX "out_of_stock_report_items_reportId_idx" ON "out_of_stock_report_items"("reportId");

-- CreateIndex
CREATE INDEX "out_of_stock_report_items_orderItemId_idx" ON "out_of_stock_report_items"("orderItemId");

-- CreateIndex
CREATE INDEX "out_of_stock_report_items_orderId_idx" ON "out_of_stock_report_items"("orderId");

-- CreateIndex
CREATE INDEX "out_of_stock_report_items_productId_idx" ON "out_of_stock_report_items"("productId");

-- AddForeignKey
ALTER TABLE "out_of_stock_reports" ADD CONSTRAINT "out_of_stock_reports_wholesalerId_fkey" FOREIGN KEY ("wholesalerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "out_of_stock_reports" ADD CONSTRAINT "out_of_stock_reports_resolvedBy_fkey" FOREIGN KEY ("resolvedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "out_of_stock_report_items" ADD CONSTRAINT "out_of_stock_report_items_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "out_of_stock_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "out_of_stock_report_items" ADD CONSTRAINT "out_of_stock_report_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "out_of_stock_report_items" ADD CONSTRAINT "out_of_stock_report_items_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "out_of_stock_report_items" ADD CONSTRAINT "out_of_stock_report_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
