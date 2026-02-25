import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationService } from '../services/notification.service';
import { EmailEvent } from '../types/email.types';

@Injectable()
export class OrderEmailListener {
  private readonly logger = new Logger(OrderEmailListener.name);

  constructor(private readonly notificationService: NotificationService) {}

  @OnEvent(EmailEvent.ORDER_CONFIRMED)
  async handleOrderConfirmation(payload: { order: any }) {
    try {
      await this.notificationService.notifyOrderConfirmation(payload.order);
      this.logger.log(
        `Order confirmation email event handled for order: ${payload.order.orderNumber}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to handle order confirmation email event: ${error.message}`,
        error.stack,
      );
    }
  }

  @OnEvent(EmailEvent.ORDER_ASSIGNED)
  async handleOrderAssignment(payload: { order: any; officer: any }) {
    try {
      await this.notificationService.notifyOrderAssignment(
        payload.order,
        payload.officer,
      );
      this.logger.log(
        `Order assignment email event handled for order: ${payload.order.orderNumber}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to handle order assignment email event: ${error.message}`,
        error.stack,
      );
    }
  }

  @OnEvent(EmailEvent.ORDER_COMPLETED)
  async handleOrderCompletion(payload: { order: any }) {
    try {
      await this.notificationService.notifyOrderCompletion(payload.order);
      this.logger.log(
        `Order completion email event handled for order: ${payload.order.orderNumber}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to handle order completion email event: ${error.message}`,
        error.stack,
      );
    }
  }

  @OnEvent(EmailEvent.ORDER_STATUS_CHANGED)
  async handleOrderStatusChange(payload: {
    order: any;
    previousStatus: string;
    newStatus: string;
  }) {
    try {
      // Handle specific status changes that require notifications
      if (payload.newStatus === 'COMPLETED') {
        await this.notificationService.notifyOrderCompletion(payload.order);
      }

      this.logger.log(
        `Order status change email event handled for order: ${payload.order.orderNumber} (${payload.previousStatus} -> ${payload.newStatus})`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to handle order status change email event: ${error.message}`,
        error.stack,
      );
    }
  }
}
