-- DropForeignKey
ALTER TABLE "orders" DROP CONSTRAINT "orders_wholesalerId_fkey";

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_wholesalerId_fkey" FOREIGN KEY ("wholesalerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
