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
import postgres from 'postgres';
import { speedExtension, type SpeedClient } from '../../generated/sql';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private sqlClient?: ReturnType<typeof postgres>;

  constructor(configService: ConfigService) {
    const rawDatabaseUrl =
      configService.get<string>('database.url') ||
      process.env.DATABASE_URL ||
      '';
    const databaseUrl = rawDatabaseUrl.trim().replace(/^['"]|['"]$/g, '');
    const logger = new Logger(PrismaService.name);

    const isAccelerateUrl = /^prisma(\+postgres)?:\/\//i.test(databaseUrl);
    const prismaSqlEnabled =
      (
        configService.get<string>('PRISMA_SQL_ENABLED') ||
        process.env.PRISMA_SQL_ENABLED ||
        'true'
      )
        .toLowerCase()
        .trim() === 'true';
    const prismaSqlDebug =
      (
        configService.get<string>('PRISMA_SQL_DEBUG') ||
        process.env.PRISMA_SQL_DEBUG ||
        'true'
      )
        .toLowerCase()
        .trim() === 'true';

    if (isAccelerateUrl) {
      super({
        log: ['error', 'warn'],
      });

      Object.assign(this, this.$extends(withAccelerate()));
      if (prismaSqlEnabled) {
        logger.warn(
          'PRISMA_SQL_ENABLED is true but DATABASE_URL is Accelerate; prisma-sql is skipped in Accelerate mode',
        );
      }
      logger.log('Prisma initialized in Accelerate mode');
      return;
    }

    const adapter = databaseUrl
      ? new PrismaPg({ connectionString: databaseUrl })
      : undefined;

    super({
      ...(adapter ? { adapter } : {}),
      log: ['error', 'warn'],
    });

    if (prismaSqlEnabled && databaseUrl) {
      this.sqlClient = postgres(databaseUrl);

      const extendedClient = this.$extends(
        speedExtension({
          postgres: this.sqlClient,
          debug: prismaSqlDebug,
        }),
      ) as SpeedClient<this>;

      Object.assign(this, extendedClient);
      logger.log('Prisma initialized in adapter-pg mode with prisma-sql');
      return;
    }

    logger.log('Prisma initialized in adapter-pg mode (prisma-sql disabled)');
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    if (this.sqlClient) {
      await this.sqlClient.end({ timeout: 5 });
    }
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
