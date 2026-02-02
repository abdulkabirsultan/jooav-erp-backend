import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CacheService } from './cache.service';
import { CacheInvalidationService } from './cache-invalidation.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [CacheService, CacheInvalidationService],
  exports: [CacheService, CacheInvalidationService],
})
export class CacheModule {}
