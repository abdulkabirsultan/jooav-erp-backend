import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service';
import {
  BatchEmailRequest,
  QueueEmailRequest,
} from '../interfaces/email.interface';
import {
  EMAIL_TEMPLATES,
  EmailPriority,
  OrderEmailVariables,
  AuthEmailVariables,
  AssignmentEmailVariables,
} from '../types/email.types';
import { EmailConfig } from '../../../config/email.config';

// Define types for your entities (these should come from your actual entities)
interface Order {
  id: string;
  orderNumber: string;
  totalAmount: number;
  createdAt: Date;
  items: Array<{ id: string }>;
  wholesaler: {
    user: {
      firstName: string;
      lastName: string;
      email: string;
    };
  };
}

interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface MaintenanceInfo {
  scheduledDate: string;
  estimatedDuration: string;
  reason: string;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly emailConfig: EmailConfig;

  constructor(
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
  ) {
    this.emailConfig = this.configService.get<EmailConfig>('email')!;
  }

  /**
   * Send order confirmation notification
   */
  async notifyOrderConfirmation(order: Order): Promise<void> {
    const notifications: BatchEmailRequest[] = [
      // Customer notification
      {
        templateAlias: EMAIL_TEMPLATES.ORDER_CONFIRMATION,
        to: [order.wholesaler.user.email],
        variables: {
          CUSTOMER_NAME: order.wholesaler.user.firstName,
          ORDER_NUMBER: order.orderNumber,
          ORDER_TOTAL: order.totalAmount.toLocaleString(),
          ORDER_DATE: order.createdAt.toLocaleDateString(),
          ITEMS_COUNT: order.items.length,
          VIEW_ORDER_URL: `${this.emailConfig.baseUrl}/orders/${order.orderNumber}`,
        } as OrderEmailVariables,
        priority: EmailPriority.HIGH,
      },
      // Admin notification
      {
        templateAlias: EMAIL_TEMPLATES.ADMIN_NEW_ORDER,
        to: ['admin@jooav.com', 'orders@jooav.com'],
        variables: {
          ORDER_NUMBER: order.orderNumber,
          CUSTOMER_NAME: `${order.wholesaler.user.firstName} ${order.wholesaler.user.lastName}`,
          ORDER_TOTAL: order.totalAmount.toLocaleString(),
          ADMIN_ORDER_URL: `${this.emailConfig.baseUrl}/admin/orders/${order.orderNumber}`,
        },
        priority: EmailPriority.HIGH,
      },
    ];

    await this.emailService.queueBatchEmails(notifications, EmailPriority.HIGH);
    this.logger.log(
      `Order confirmation notifications queued for order: ${order.orderNumber}`,
    );
  }

  /**
   * Send order assignment notification
   */
  async notifyOrderAssignment(
    order: Order,
    procurementOfficer: User,
  ): Promise<void> {
    const emailRequest: QueueEmailRequest = {
      templateAlias: EMAIL_TEMPLATES.ORDER_ASSIGNMENT,
      to: [procurementOfficer.email],
      variables: {
        OFFICER_NAME: procurementOfficer.firstName,
        ORDER_NUMBER: order.orderNumber,
        WHOLESALER_NAME: `${order.wholesaler.user.firstName} ${order.wholesaler.user.lastName}`,
        ORDER_TOTAL: order.totalAmount.toLocaleString(),
        ITEMS_COUNT: order.items.length,
        ASSIGNMENT_URL: `${this.emailConfig.baseUrl}/orders/${order.orderNumber}/process`,
      } as AssignmentEmailVariables,
      priority: EmailPriority.HIGH,
    };

    await this.emailService.queueEmail(emailRequest);
    this.logger.log(
      `Order assignment notification queued for order: ${order.orderNumber} to officer: ${procurementOfficer.email}`,
    );
  }

  /**
   * Send password reset notification
   */
  async notifyPasswordReset(user: User, resetToken: string): Promise<void> {
    const emailRequest: QueueEmailRequest = {
      templateAlias: EMAIL_TEMPLATES.PASSWORD_RESET,
      to: [user.email],
      variables: {
        USER_NAME: user.firstName,
        RESET_LINK: `${this.emailConfig.baseUrl}/reset?token=${resetToken}`,
        EXPIRY_TIME: '24 hours',
      } as AuthEmailVariables,
      priority: EmailPriority.HIGH,
    };

    await this.emailService.queueEmail(emailRequest);
    this.logger.log(
      `Password reset notification queued for user: ${user.email}`,
    );
  }

  /**
   * Send welcome notification for new users
   */
  async notifyWelcome(user: User): Promise<void> {
    const emailRequest: QueueEmailRequest = {
      templateAlias: EMAIL_TEMPLATES.WELCOME,
      to: [user.email],
      variables: {
        USER_NAME: user.firstName,
        LOGIN_URL: `${this.emailConfig.baseUrl}/login`,
      },
      priority: EmailPriority.NORMAL,
    };

    await this.emailService.queueEmail(emailRequest);
    this.logger.log(`Welcome notification queued for user: ${user.email}`);
  }

  /**
   * Send email verification notification
   */
  async notifyEmailVerification(
    user: User,
    verificationToken: string,
  ): Promise<void> {
    const emailRequest: QueueEmailRequest = {
      templateAlias: EMAIL_TEMPLATES.EMAIL_VERIFICATION,
      to: [user.email],
      variables: {
        USER_NAME: user.firstName,
        VERIFICATION_LINK: `${this.emailConfig.baseUrl}/verify?token=${verificationToken}`,
        EXPIRY_TIME: '48 hours',
      } as AuthEmailVariables,
      priority: EmailPriority.HIGH,
    };

    await this.emailService.queueEmail(emailRequest);
    this.logger.log(
      `Email verification notification queued for user: ${user.email}`,
    );
  }

  /**
   * Send order completion notification
   */
  async notifyOrderCompletion(order: Order): Promise<void> {
    const emailRequest: QueueEmailRequest = {
      templateAlias: EMAIL_TEMPLATES.ORDER_COMPLETION,
      to: [order.wholesaler.user.email],
      variables: {
        CUSTOMER_NAME: order.wholesaler.user.firstName,
        ORDER_NUMBER: order.orderNumber,
        ORDER_TOTAL: order.totalAmount.toLocaleString(),
        ORDER_DATE: order.createdAt.toLocaleDateString(),
        ITEMS_COUNT: order.items.length,
        VIEW_ORDER_URL: `${this.emailConfig.baseUrl}/orders/${order.orderNumber}`,
      } as OrderEmailVariables,
      priority: EmailPriority.NORMAL,
    };

    await this.emailService.queueEmail(emailRequest);
    this.logger.log(
      `Order completion notification queued for order: ${order.orderNumber}`,
    );
  }

  /**
   * Send system maintenance notification to multiple users
   */
  async notifySystemMaintenance(
    users: User[],
    maintenanceDetails: MaintenanceInfo,
  ): Promise<void> {
    const notifications = users.map((user) => ({
      templateAlias: EMAIL_TEMPLATES.SYSTEM_MAINTENANCE,
      to: [user.email],
      variables: {
        USER_NAME: user.firstName,
        MAINTENANCE_DATE: maintenanceDetails.scheduledDate,
        MAINTENANCE_DURATION: maintenanceDetails.estimatedDuration,
        MAINTENANCE_REASON: maintenanceDetails.reason,
      },
      priority: EmailPriority.NORMAL,
    }));

    // Process in chunks of 100 (Resend's batch limit)
    const chunks = this.chunkArray(notifications, 100);
    for (const chunk of chunks) {
      await this.emailService.queueBatchEmails(chunk, EmailPriority.NORMAL);
    }

    this.logger.log(
      `System maintenance notifications queued for ${users.length} users in ${chunks.length} chunks`,
    );
  }

  /**
   * Utility method to chunk arrays
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }
}
