import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from '../../modules/cache/cache.service';

@Injectable()
export class CacheInvalidationService {
  private readonly logger = new Logger(CacheInvalidationService.name);

  constructor(private readonly cacheService: CacheService) {}

  /**
   * Invalidate cache by tags
   */
  async invalidateByTags(tags: string[]): Promise<void> {
    try {
      for (const tag of tags) {
        const tagKey = `tag:${tag}`;
        const cachedKeys = await this.cacheService.get<string[]>(tagKey);

        if (cachedKeys && Array.isArray(cachedKeys)) {
          // Delete all cached keys associated with this tag
          if (cachedKeys.length > 0) {
            await this.cacheService.del(cachedKeys);
            this.logger.debug(
              `Invalidated ${cachedKeys.length} cache entries for tag: ${tag}`,
            );
          }

          // Remove the tag key itself
          await this.cacheService.del(tagKey);
        }
      }
    } catch (error) {
      this.logger.error(
        `Failed to invalidate cache for tags: ${tags.join(', ')}`,
        error,
      );
    }
  }

  /**
   * Invalidate specific cache keys
   */
  async invalidateKeys(keys: string[]): Promise<void> {
    try {
      if (keys.length > 0) {
        await this.cacheService.del(keys);
        this.logger.debug(
          `Invalidated specific cache keys: ${keys.join(', ')}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to invalidate cache keys: ${keys.join(', ')}`,
        error,
      );
    }
  }
}
