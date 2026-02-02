import { SetMetadata } from '@nestjs/common';

export interface CacheOptions {
  key?: string;
  ttl?: number; // Time To Live in seconds
  includeParams?: boolean; // Include query parameters in cache key
  includeUserId?: boolean; // Include user ID in cache key (for user-specific caches)
}

export const CACHE_OPTIONS_KEY = 'cache:options';
export const Cache = (options: CacheOptions = {}) =>
  SetMetadata(CACHE_OPTIONS_KEY, options);
