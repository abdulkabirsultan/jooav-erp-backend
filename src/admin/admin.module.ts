import { Module } from '@nestjs/common';
import { AdminAuthModule } from './auth/admin-auth.module';

@Module({
  imports: [AdminAuthModule],
  exports: [AdminAuthModule],
})
export class AdminModule {}
