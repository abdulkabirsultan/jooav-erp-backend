import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { CacheService } from '../modules/cache/cache.service';

@Injectable()
export class StartupValidationService implements OnApplicationBootstrap {
  private readonly logger = new Logger(StartupValidationService.name);

  constructor(private readonly cacheService: CacheService) {}

  async onApplicationBootstrap() {
    this.logger.log('🚀 Running startup validation checks...');

    await this.validateRedisConnection();

    this.logger.log('✅ Startup validation completed successfully');
  }

  private async validateRedisConnection(): Promise<void> {
    const nodeEnv = process.env.NODE_ENV || 'development';

    try {
      const isValid = await this.cacheService.validateConnection();
      const connectionStatus = this.cacheService.getConnectionStatus();

      if (isValid) {
        this.logger.log(
          `✅ Redis connection validated for ${nodeEnv} environment (${connectionStatus.type})`,
        );
      } else {
        this.logger.error(
          `❌ Redis connection validation failed for ${nodeEnv} environment (${connectionStatus.type})`,
        );

        // In production, we might want to fail the startup
        if (nodeEnv === 'production') {
          this.logger.error(
            '🔥 Production Redis connection failed - this may impact caching performance',
          );
          // Optionally throw error to prevent startup: throw new Error('Redis connection failed in production');
        } else {
          this.logger.warn(
            '⚠️ Development Redis connection failed - caching will be disabled',
          );
        }
      }
    } catch (error) {
      this.logger.error('❌ Redis validation error:', error);

      if (nodeEnv === 'production') {
        this.logger.error(
          '🔥 Critical: Redis validation failed in production environment',
        );
        // Optionally fail startup: throw error;
      }
    }
  }
}
