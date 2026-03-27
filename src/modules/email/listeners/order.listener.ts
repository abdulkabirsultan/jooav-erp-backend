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

  @OnEvent(EmailEvent.ORDER_REASSIGNED)
  async handleOrderReassignment(payload: {
    order: any;
    newOfficer: any;
    previousOfficer?: any;
  }) {
    try {
      await this.notificationService.notifyOrderReassigned(
        payload.order,
        payload.newOfficer,
        payload.previousOfficer,
      );
      this.logger.log(
        `Order reassignment email event handled for order: ${payload.order.orderNumber}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to handle order reassignment email event: ${error.message}`,
        error.stack,
      );
    }
  }

  @OnEvent(EmailEvent.ORDER_ASSIGNMENT_REJECTED)
  async handleAssignmentRejected(payload: {
    orderNumber: string;
    officerName: string;
    reason?: string;
  }) {
    try {
      await this.notificationService.notifyAssignmentRejected(payload);
      this.logger.log(
        `Assignment rejected email event handled for order: ${payload.orderNumber}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to handle assignment rejected email event: ${error.message}`,
        error.stack,
      );
    }
  }

  @OnEvent(EmailEvent.ORDER_ASSIGNMENT_ACCEPTED)
  async handleAssignmentAccepted(payload: {
    orderNumber: string;
    officerName: string;
  }) {
    try {
      await this.notificationService.notifyAssignmentAccepted(payload);
      this.logger.log(
        `Assignment accepted email event handled for order: ${payload.orderNumber}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to handle assignment accepted email event: ${error.message}`,
        error.stack,
      );
    }
  }

  @OnEvent(EmailEvent.ORDER_CANCELLED)
  async handleOrderCancelled(payload: {
    orderNumber: string;
    orderTotal?: number;
    cancelledByName: string;
    cancelledByRole: string;
    wholesalerEmail?: string;
    wholesalerName?: string;
  }) {
    try {
      await this.notificationService.notifyOrderCancelled(payload);
      this.logger.log(
        `Order cancelled email event handled for order: ${payload.orderNumber}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to handle order cancelled email event: ${error.message}`,
        error.stack,
      );
    }
  }
}
