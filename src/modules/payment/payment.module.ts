import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MonnifyService } from './monnify.service';

@Module({
  imports: [ConfigModule],
  providers: [MonnifyService],
  exports: [MonnifyService],
})
export class PaymentModule {}
