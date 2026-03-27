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

  @OnEvent(EmailEvent.PAYMENT_INITIATED)
  async handlePaymentInitiated(payload: { order: any }) {
    try {
      await this.notificationService.notifyPaymentInitiated(payload.order);
      this.logger.log(
        `Payment initiated email event handled for order: ${payload.order.orderNumber}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to handle payment initiated email event: ${error.message}`,
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
      await this.notificationService.notifyPaymentFailed(
        payload.order,
        payload.reason,
      );
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

  @OnEvent(EmailEvent.USER_ROLE_UPDATED)
  async handleUserRoleUpdated(payload: {
    user: any;
    previousRole: string;
    newRole: string;
  }) {
    try {
      await this.notificationService.notifyRoleUpdated(
        payload.user,
        payload.previousRole,
        payload.newRole,
      );
      this.logger.log(
        `User role update email event handled for user: ${payload.user.email}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to handle user role update email event: ${error.message}`,
        error.stack,
      );
    }
  }

  @OnEvent(EmailEvent.USER_ACCOUNT_DEACTIVATED)
  async handleUserAccountDeactivated(payload: { user: any; reason?: string }) {
    try {
      await this.notificationService.notifyAccountDeactivated(
        payload.user,
        payload.reason,
      );
      this.logger.log(
        `Account deactivation email event handled for user: ${payload.user.email}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to handle account deactivation email event: ${error.message}`,
        error.stack,
      );
    }
  }

  @OnEvent(EmailEvent.OUT_OF_STOCK_REPORT_OPENED)
  async handleOutOfStockReportOpened(payload: {
    reportId: string;
    wholesalerName?: string;
    itemCount: number;
  }) {
    try {
      await this.notificationService.notifyOutOfStockReportOpened(payload);
      this.logger.log(
        `Out-of-stock report email event handled for report: ${payload.reportId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to handle out-of-stock report event: ${error.message}`,
        error.stack,
      );
    }
  }
}
