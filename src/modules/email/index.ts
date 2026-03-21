// Email Module - Main Exports
export { EmailModule } from './email.module';

// Services
export { EmailService } from './services/email.service';
export { NotificationService } from './services/notification.service';
export { TemplateSetupService } from './services/template-setup.service';

// Controllers
export { EmailTestController } from './controllers/email-test.controller';

// Types and Interfaces
export * from './types/email.types';
export * from './interfaces/email.interface';

// Event Listeners (for external import if needed)
export { OrderEmailListener } from './listeners/order.listener';
export { AuthEmailListener } from './listeners/auth.listener';
export { SystemEmailListener } from './listeners/system.listener';
