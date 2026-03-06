import { Module } from '@nestjs/common';
import { AdminAuthModule } from './auth/admin-auth.module';
import { AdminDashboardModule } from './dashboard/admin-dashboard.module';

@Module({
  imports: [AdminAuthModule, AdminDashboardModule],
  exports: [AdminAuthModule, AdminDashboardModule],
})
export class AdminModule {}
