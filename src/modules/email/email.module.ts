import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';

// Services
import { EmailService } from './services/email.service';
import { NotificationService } from './services/notification.service';
import { TemplateSetupService } from './services/template-setup.service';
import { QueueCircuitBreakerService } from './services/queue-circuit-breaker.service';

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
    PrismaModule,
    // Use the global Bull configuration instead of creating a separate one
    BullModule.registerQueue({
      name: 'email',
    }),
  ],
  controllers: [EmailTestController],
  providers: [
    // Core Services
    EmailService,
    NotificationService,
    TemplateSetupService,
    QueueCircuitBreakerService,

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
