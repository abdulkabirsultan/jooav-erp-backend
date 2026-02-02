import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request } from 'express';
import { CacheService } from '../../modules/cache/cache.service';
import { CacheOptions, CACHE_OPTIONS_KEY } from '../decorators/cache.decorator';

@Injectable()
export class CacheInterceptor implements NestInterceptor {
  private readonly logger = new Logger(CacheInterceptor.name);

  constructor(
    private readonly cacheService: CacheService,
    private readonly reflector: Reflector,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const cacheOptions = this.reflector.get<CacheOptions>(
      CACHE_OPTIONS_KEY,
      context.getHandler(),
    );

    if (!cacheOptions) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request>();
    const cacheKey = this.generateCacheKey(request, cacheOptions);

    try {
      // Try to get from cache
      const cachedResult = await this.cacheService.get(cacheKey);

      if (cachedResult) {
        this.logger.debug(`Cache hit for key: ${cacheKey}`);
        return of(JSON.parse(cachedResult));
      }

      this.logger.debug(`Cache miss for key: ${cacheKey}`);

      // Execute the handler and cache the result
      return next.handle().pipe(
        tap(async (data) => {
          try {
            const ttl = cacheOptions.ttl || 300; // Default 5 minutes
            await this.cacheService.setex(cacheKey, ttl, JSON.stringify(data));
            this.logger.debug(
              `Cached result with key: ${cacheKey} for ${ttl}s`,
            );
          } catch (error) {
            this.logger.error(
              `Failed to cache result for key: ${cacheKey}`,
              error,
            );
          }
        }),
      );
    } catch (error) {
      this.logger.error(`Cache error for key: ${cacheKey}`, error);
      return next.handle();
    }
  }

  private generateCacheKey(request: Request, options: CacheOptions): string {
    const { method, url, query, params } = request;

    const keyParts = [
      method.toLowerCase(),
      request.route?.path || url.split('?')[0],
    ];

    // Include path parameters
    if (params && Object.keys(params).length > 0) {
      const paramString = Object.keys(params)
        .sort()
        .map((key) => `${key}:${params[key]}`)
        .join(',');
      keyParts.push(`params:${paramString}`);
    }

    // Include query parameters if specified
    if (options.includeParams && query && Object.keys(query).length > 0) {
      const queryString = Object.keys(query)
        .sort()
        .filter(
          (key) =>
            query[key] !== undefined &&
            query[key] !== null &&
            query[key] !== '',
        )
        .map((key) => `${key}:${query[key]}`)
        .join(',');

      if (queryString) {
        keyParts.push(`query:${queryString}`);
      }
    }

    // Include user ID if specified (for user-specific caches)
    if (options.includeUserId && request.user) {
      keyParts.push(
        `user:${(request.user as any).id || (request.user as any).sub}`,
      );
    }

    // Add custom key prefix if provided
    if (options.key) {
      keyParts.unshift(options.key);
    }

    return keyParts.join(':');
  }
}
