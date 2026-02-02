import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { TerminusModule } from '@nestjs/terminus';
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
