import { Module } from '@nestjs/common';
import { PackTypeService } from './pack-type.service';
import { PackTypeController } from './pack-type.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PackTypeController],
  providers: [PackTypeService],
  exports: [PackTypeService],
})
export class PackTypeModule {}
