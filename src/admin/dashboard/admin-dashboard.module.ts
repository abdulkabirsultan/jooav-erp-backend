import { Module } from '@nestjs/common';
import { AdminDashboardController } from './admin-dashboard.controller';
import { OrderModule } from '../../modules/order/order.module';

@Module({
  imports: [OrderModule],
  controllers: [AdminDashboardController],
})
export class AdminDashboardModule {}
