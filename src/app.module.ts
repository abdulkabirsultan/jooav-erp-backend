import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { TerminusModule } from '@nestjs/terminus';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BullModule } from '@nestjs/bull';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { WinstonModule } from 'nest-winston';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './modules/prisma/prisma.service';
import { HealthController } from './health/health.controller';

// Configuration
import {
  appConfig,
  databaseConfig,
  securityConfig,
  loggingConfig,
  cloudinaryConfig,
  redisConfig,
  swaggerConfig,
  sentryConfig,
  emailConfig,
  monnifyConfig,
  validationSchema,
} from './config';

// Common middleware
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { AuditLogInterceptor } from './common/interceptors/audit-log.interceptor';

// Services
import { LoggerService } from './common/utils/logger.service';
import { AuditService } from './modules/audit/audit.service';
import { StartupValidationService } from './config/startup-validation.service';
import { CacheModule } from './modules/cache/cache.module';
import { EmailModule } from './modules/email/email.module';

// Modules
import { StorageModule } from './modules/storage/storage.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { PrismaModule } from './modules/prisma/prisma.module';
import { AdminModule } from './admin/admin.module';
import { ManufacturerModule } from './modules/manufacturer/manufacturer.module';
import { BrandModule } from './modules/brand/brand.module';
import { VariantModule } from './modules/variant/variant.module';
import { CategoryModule } from './modules/category/category.module';
import { SubcategoryModule } from './modules/subcategory/subcategory.module';
import { ProductModule } from './modules/product/product.module';
import { PackSizeModule } from './modules/pack-size/pack-size.module';
import { PackTypeModule } from './modules/pack-type/pack-type.module';
import { OrderModule } from './modules/order/order.module';
import { SettingsModule } from './modules/settings/settings.module';
import { SentryModule } from '@sentry/nestjs/setup';

@Module({
  imports: [
    // Sentry for error tracking
    SentryModule.forRoot(),

    // Configuration module with validation
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        appConfig,
        databaseConfig,
        securityConfig,
        loggingConfig,
        cloudinaryConfig,
        redisConfig,
        swaggerConfig,
        sentryConfig,
        emailConfig,
        monnifyConfig,
      ],
      validationSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),

    // Winston logging module
    WinstonModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        instance: LoggerService.createWinstonLogger(configService),
      }),
    }),

    // Rate limiting
    ThrottlerModule.forRootAsync({
      useFactory: () => ({
        throttlers: [
          {
            ttl: parseInt(process.env.THROTTLE_TTL || '60000', 10) || 60000,
            limit: parseInt(process.env.THROTTLE_LIMIT || '10', 10) || 10,
          },
        ],
      }),
    }),

    // Health checks
    TerminusModule,

    // Domain events
    EventEmitterModule.forRoot(),

    // Bull Queue Management (for background jobs like email)
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const nodeEnv = configService.get<string>('NODE_ENV') || 'development';
        const redisUrl = configService.get<string>('REDIS_URL');
        const upstashUrl = configService.get<string>('UPSTASH_REDIS_REST_URL');
        const upstashToken = configService.get<string>(
          'UPSTASH_REDIS_REST_TOKEN',
        );

        // Redis Cloud configuration for Bull Queue (new)
        const redisCloudHost = configService.get<string>('REDIS_CLOUD_HOST');
        const redisCloudPort = configService.get<number>('REDIS_CLOUD_PORT');
        const redisCloudUsername = configService.get<string>(
          'REDIS_CLOUD_USERNAME',
        );
        const redisCloudPassword = configService.get<string>(
          'REDIS_CLOUD_PASSWORD',
        );

        // Use Redis Cloud for Bull if available (recommended for production)
        if (nodeEnv === 'production' && redisCloudHost && redisCloudPassword) {
          return {
            redis: {
              host: redisCloudHost,
              port: redisCloudPort || 6379,
              username: redisCloudUsername || 'default',
              password: redisCloudPassword,
              // Optimized ioredis options for Redis Cloud
              maxRetriesPerRequest: null,
              retryDelayOnFailover: 1000,
              enableReadyCheck: false,
              lazyConnect: false,
              keepAlive: 30000,
              family: 4,
              connectTimeout: 60000,
              commandTimeout: 300000, // 5 minutes
              // Redis Cloud free tier doesn't require TLS for cloud instances
            },
            defaultJobOptions: {
              attempts: 2,
              backoff: {
                type: 'exponential',
                delay: 5000,
              },
              timeout: 20000,
              removeOnComplete: 10,
              removeOnFail: 5,
            },
            settings: {
              stalledInterval: 30000,
              maxStalledCount: 1,
              retryProcessDelay: 10000,
            },
          };
        }

        // Fallback to Upstash Redis for production if Redis Cloud not configured
        const buildRedisConnection = () => {
          const directRedisUrl = redisUrl?.trim();
          const restRedisUrl = upstashUrl?.trim();

          if (
            directRedisUrl &&
            (directRedisUrl.startsWith('redis://') ||
              directRedisUrl.startsWith('rediss://'))
          ) {
            const parsedRedisUrl = new URL(directRedisUrl);
            const isTls = parsedRedisUrl.protocol === 'rediss:';

            return {
              host: parsedRedisUrl.hostname,
              port: parsedRedisUrl.port
                ? parseInt(parsedRedisUrl.port, 10)
                : 6379,
              username: parsedRedisUrl.username
                ? decodeURIComponent(parsedRedisUrl.username)
                : undefined,
              password: parsedRedisUrl.password
                ? decodeURIComponent(parsedRedisUrl.password)
                : undefined,
              tls: isTls ? {} : undefined,
            };
          }

          if (
            restRedisUrl &&
            (restRedisUrl.startsWith('https://') ||
              restRedisUrl.startsWith('http://')) &&
            upstashToken
          ) {
            const parsedUpstashUrl = new URL(restRedisUrl);
            return {
              host: parsedUpstashUrl.hostname,
              port: 6379,
              username: 'default',
              password: upstashToken,
              tls: {},
            };
          }

          return null;
        };

        // Use Upstash Redis in production if available (fallback)
        if (nodeEnv === 'production' && (redisUrl || upstashUrl)) {
          const cloudRedis = buildRedisConnection();

          if (!cloudRedis) {
            throw new Error(
              'Invalid Redis configuration. Set REDIS_URL to redis:// or rediss://, or set UPSTASH_REDIS_REST_URL (https://...) with UPSTASH_REDIS_REST_TOKEN.',
            );
          }

          return {
            redis: {
              host: cloudRedis.host,
              port: cloudRedis.port,
              username: cloudRedis.username,
              password: cloudRedis.password,
              maxRetriesPerRequest: null,
              retryDelayOnFailover: 1000,
              enableReadyCheck: false,
              lazyConnect: false,
              keepAlive: 30000,
              family: 4,
              connectTimeout: 60000,
              commandTimeout: 300000,
              tls: cloudRedis.tls,
            },
            defaultJobOptions: {
              attempts: 2,
              backoff: {
                type: 'exponential',
                delay: 5000,
              },
              timeout: 20000,
              removeOnComplete: 10,
              removeOnFail: 5,
            },
            settings: {
              stalledInterval: 30000,
              maxStalledCount: 1,
              retryProcessDelay: 10000,
            },
          };
        }

        // Use traditional Redis for development
        return {
          redis: {
            host: configService.get<string>('REDIS_HOST') || 'localhost',
            port: configService.get<number>('REDIS_PORT') || 6379,
            password: configService.get<string>('REDIS_PASSWORD'),
            maxRetriesPerRequest: null,
            retryDelayOnFailover: 1000,
            commandTimeout: 300000,
          },
          defaultJobOptions: {
            attempts: 2,
            backoff: {
              type: 'exponential',
              delay: 5000,
            },
            timeout: 20000,
            removeOnComplete: 10,
            removeOnFail: 5,
          },
          settings: {
            stalledInterval: 30000,
            maxStalledCount: 1,
            retryProcessDelay: 10000,
          },
        };
      },
      inject: [ConfigService],
    }),

    // Feature modules
    CacheModule,
    EmailModule,
    PrismaModule,
    AuthModule,
    UsersModule,
    AdminModule,
    StorageModule,
    ManufacturerModule,
    BrandModule,
    VariantModule,
    CategoryModule,
    SubcategoryModule,
    ProductModule,
    PackSizeModule,
    PackTypeModule,
    OrderModule,
    SettingsModule,
  ],
  controllers: [AppController, HealthController],
  providers: [
    AppService,
    PrismaService,
    AuditService,
    StartupValidationService,

    // Global pipes
    {
      provide: APP_PIPE,
      useClass: ValidationPipe,
    },

    // Global filters
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },

    // Global interceptors
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditLogInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },
  ],
})
export class AppModule {}
