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
  constructor(configService: ConfigService) {
    const rawDatabaseUrl =
      configService.get<string>('database.url') ||
      process.env.DATABASE_URL ||
      '';
    const databaseUrl = rawDatabaseUrl.trim().replace(/^['"]|['"]$/g, '');
    const logger = new Logger(PrismaService.name);

    const isAccelerateUrl = /^prisma(\+postgres)?:\/\//i.test(databaseUrl);

    if (isAccelerateUrl) {
      super({
        log: ['error', 'warn'],
      });

      Object.assign(this, this.$extends(withAccelerate()));
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

    logger.log('Prisma initialized in adapter-pg mode');
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
