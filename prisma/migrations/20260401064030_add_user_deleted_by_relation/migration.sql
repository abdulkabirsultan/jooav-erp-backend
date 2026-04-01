-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_deletedBy_fkey" FOREIGN KEY ("deletedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
