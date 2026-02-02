import { Module } from '@nestjs/common';
import { VariantService } from './variant.service';
import { VariantController } from './variant.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { PackSizeModule } from '../pack-size/pack-size.module';
import { PackTypeModule } from '../pack-type/pack-type.module';

@Module({
  imports: [PrismaModule, PackSizeModule, PackTypeModule],
  controllers: [VariantController],
  providers: [VariantService],
  exports: [VariantService],
})
export class VariantModule {}
