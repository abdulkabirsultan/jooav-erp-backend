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

        // Use Upstash Redis in production if available
        if (nodeEnv === 'production' && (redisUrl || upstashUrl)) {
          // Bull/ioredis requires redis:// or rediss:// URL, not Upstash REST https:// URL
          const connectionUrl = redisUrl;

          if (!connectionUrl) {
            throw new Error(
              'REDIS_URL is required in production for Bull queue. Do not use UPSTASH_REDIS_REST_URL for Bull/ioredis.',
            );
          }

          if (
            !connectionUrl.startsWith('redis://') &&
            !connectionUrl.startsWith('rediss://')
          ) {
            throw new Error(
              `Invalid REDIS_URL protocol: ${connectionUrl.split(':')[0]}. Expected redis:// or rediss://`,
            );
          }

          const parsedRedisUrl = new URL(connectionUrl);
          const isTls = parsedRedisUrl.protocol === 'rediss:';
          const redisHost = parsedRedisUrl.hostname;
          const redisPort = parsedRedisUrl.port
            ? parseInt(parsedRedisUrl.port, 10)
            : 6379;
          const redisUsername = parsedRedisUrl.username
            ? decodeURIComponent(parsedRedisUrl.username)
            : undefined;
          const redisPassword = parsedRedisUrl.password
            ? decodeURIComponent(parsedRedisUrl.password)
            : undefined;

          return {
            redis: {
              host: redisHost,
              port: redisPort,
              username: redisUsername,
              password: redisPassword,
              // Optimized ioredis options for Upstash Redis
              maxRetriesPerRequest: null,
              retryDelayOnFailover: 1000,
              enableReadyCheck: false,
              lazyConnect: true,
              keepAlive: 30000,
              family: 4,
              connectTimeout: 60000,
              commandTimeout: 15000,
              tls: isTls ? {} : undefined,
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
            // Local Redis options - optimized for reliability
            maxRetriesPerRequest: null, // Consistent with production
            retryDelayOnFailover: 1000, // Consistent retry delay
            commandTimeout: 15000, // Consistent timeout
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
