import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { withAccelerate } from '@prisma/extension-accelerate';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(configService: ConfigService) {
    const rawDatabaseUrl =
      configService.get<string>('database.url') ||
      process.env.DATABASE_URL ||
      '';
    const databaseUrl = rawDatabaseUrl.trim().replace(/^['"]|['"]$/g, '');

    const isAccelerateUrl = /^prisma(\+postgres)?:\/\//i.test(databaseUrl);

    if (isAccelerateUrl) {
      super({
        log: [
          { emit: 'event', level: 'query' },
          { emit: 'event', level: 'info' },
          { emit: 'event', level: 'warn' },
          { emit: 'event', level: 'error' },
        ],
      });

      Object.assign(this, this.$extends(withAccelerate()));
      this.logger.log(
        'Prisma initialized in Accelerate mode with enhanced logging',
      );
    } else {
      const adapter = databaseUrl
        ? new PrismaPg({
            connectionString:
              databaseUrl +
              '?connection_limit=20&pool_timeout=20&schema_name=public',
          })
        : undefined;

      super({
        ...(adapter ? { adapter } : {}),
        log: [
          { emit: 'event', level: 'query' },
          { emit: 'event', level: 'info' },
          { emit: 'event', level: 'warn' },
          { emit: 'event', level: 'error' },
        ],
      });

      this.logger.log(
        'Prisma initialized in adapter-pg mode with enhanced logging',
      );
    }

    // Set up query performance monitoring
    this.setupQueryPerformanceMonitoring();
  }

  private setupQueryPerformanceMonitoring() {
    // Monitor slow queries
    (this as any).$on('query', (e: any) => {
      const duration = Number(e.duration);
      if (duration > 2000) {
        // Log queries taking more than 2 seconds
        this.logger.warn(`Slow query detected: ${duration}ms`, {
          query:
            e.query.substring(0, 200) + (e.query.length > 200 ? '...' : ''),
          params: e.params,
          duration: `${duration}ms`,
        });
      }

      // Log very slow queries as errors
      if (duration > 5000) {
        this.logger.error(`Very slow query detected: ${duration}ms`, {
          query: e.query,
          params: e.params,
          duration: `${duration}ms`,
        });
      }
    });

    // Monitor info events
    (this as any).$on('info', (e: any) => {
      this.logger.log(`Prisma info: ${e.message}`);
    });

    // Monitor warnings
    (this as any).$on('warn', (e: any) => {
      this.logger.warn(`Prisma warning: ${e.message}`);
    });

    // Monitor errors
    (this as any).$on('error', (e: any) => {
      this.logger.error(`Prisma error: ${e.message}`);
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  async enableShutdownHooks(app: any) {
    // Note: beforeExit hook is not available in newer Prisma versions
    process.on('SIGINT', async () => {
      await this.$disconnect();
      await app.close();
    });

    process.on('SIGTERM', async () => {
      await this.$disconnect();
      await app.close();
    });
  }

  async cleanDb() {
    if (process.env.NODE_ENV === 'production') return;

    // Clean up in proper order to avoid foreign key constraints
    const operations = [
      this.userSession.deleteMany(),
      this.userProfile.deleteMany(),
      this.auditLog.deleteMany(),
      this.user.deleteMany(),
    ];

    return Promise.all(operations);
  }
}
