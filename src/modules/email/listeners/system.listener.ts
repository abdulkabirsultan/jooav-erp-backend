import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationService } from '../services/notification.service';
import { EmailEvent } from '../types/email.types';

@Injectable()
export class SystemEmailListener {
  private readonly logger = new Logger(SystemEmailListener.name);

  constructor(private readonly notificationService: NotificationService) {}

  @OnEvent(EmailEvent.SYSTEM_MAINTENANCE)
  async handleSystemMaintenance(payload: {
    users: any[];
    maintenanceDetails: any;
  }) {
    try {
      await this.notificationService.notifySystemMaintenance(
        payload.users,
        payload.maintenanceDetails,
      );
      this.logger.log(
        `System maintenance email event handled for ${payload.users.length} users`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to handle system maintenance email event: ${error.message}`,
        error.stack,
      );
    }
  }

  @OnEvent(EmailEvent.BULK_NOTIFICATION)
  async handleBulkNotification(payload: {
    users: any[];
    templateAlias: string;
    variables: Record<string, any>;
  }) {
    try {
      // TODO: Implement generic bulk notification handling
      this.logger.log(
        `Bulk notification email event handled for ${payload.users.length} users`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to handle bulk notification email event: ${error.message}`,
        error.stack,
      );
    }
  }

  @OnEvent(EmailEvent.PAYMENT_RECEIVED)
  async handlePaymentReceived(payload: { order: any; payment: any }) {
    try {
      // Payment confirmation is typically handled as part of order confirmation
      this.logger.log(
        `Payment received email event handled for order: ${payload.order.orderNumber}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to handle payment received email event: ${error.message}`,
        error.stack,
      );
    }
  }

  @OnEvent(EmailEvent.PAYMENT_FAILED)
  async handlePaymentFailed(payload: {
    order: any;
    payment: any;
    reason: string;
  }) {
    try {
      // TODO: Implement payment failed notification if needed
      this.logger.log(
        `Payment failed email event handled for order: ${payload.order.orderNumber}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to handle payment failed email event: ${error.message}`,
        error.stack,
      );
    }
  }
}
