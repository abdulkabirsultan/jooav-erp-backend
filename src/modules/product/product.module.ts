import { Module } from '@nestjs/common';
import { ProductService } from './product.service';
import { BulkProductUploadService } from './services/bulk-product-upload.service';
// import { BulkProductCreationService } from './services/bulk-product-creation.service';
import { ProductController } from './product.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { StorageModule } from '../storage/storage.module';
import { CacheModule } from '../cache/cache.module';

@Module({
  imports: [PrismaModule, AuditModule, StorageModule, CacheModule],
  controllers: [ProductController],
  providers: [ProductService, BulkProductUploadService],
  exports: [ProductService, BulkProductUploadService],
})
export class ProductModule {}
