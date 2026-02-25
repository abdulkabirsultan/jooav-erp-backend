import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';

// Services
import { EmailService } from './services/email.service';
import { NotificationService } from './services/notification.service';
import { TemplateSetupService } from './services/template-setup.service';

// Processors
import { EmailProcessor } from './processors/email.processor';

// Listeners
import { OrderEmailListener } from './listeners/order.listener';
import { AuthEmailListener } from './listeners/auth.listener';
import { SystemEmailListener } from './listeners/system.listener';

// Controllers
import { EmailTestController } from './controllers/email-test.controller';

@Module({
  imports: [
    ConfigModule,
    BullModule.registerQueueAsync({
      name: 'email',
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        redis: {
          host: configService.get<string>('REDIS_HOST'),
          port: configService.get<number>('REDIS_PORT'),
          password: configService.get<string>('REDIS_PASSWORD'),
        },
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          removeOnComplete: 10,
          removeOnFail: 5,
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [EmailTestController],
  providers: [
    // Core Services
    EmailService,
    NotificationService,
    TemplateSetupService,

    // Queue Processors
    EmailProcessor,

    // Event Listeners
    OrderEmailListener,
    AuthEmailListener,
    SystemEmailListener,
  ],
  exports: [EmailService, NotificationService, TemplateSetupService],
})
export class EmailModule {}
