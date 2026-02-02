import { Module } from '@nestjs/common';
import { PackSizeService } from './pack-size.service';
import { PackSizeController } from './pack-size.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PackSizeController],
  providers: [PackSizeService],
  exports: [PackSizeService],
})
export class PackSizeModule {}
