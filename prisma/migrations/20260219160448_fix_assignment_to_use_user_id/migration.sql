-- DropForeignKey
ALTER TABLE "orders" DROP CONSTRAINT "orders_assignedProcurementOfficerId_fkey";

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_assignedProcurementOfficerId_fkey" FOREIGN KEY ("assignedProcurementOfficerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
