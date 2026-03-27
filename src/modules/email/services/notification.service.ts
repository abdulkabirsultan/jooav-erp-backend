import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole, UserStatus } from '@prisma/client';
import { EmailService } from './email.service';
import { PrismaService } from '../../prisma/prisma.service';
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
    firstName?: string;
    lastName?: string;
    email?: string;
    user?: {
      firstName: string;
      lastName: string;
      email: string;
    };
  };
}

interface User {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email: string;
  role?: UserRole;
}

interface AssignmentRejectionInfo {
  orderNumber: string;
  officerName: string;
  reason?: string;
}

interface AssignmentAcceptanceInfo {
  orderNumber: string;
  officerName: string;
}

interface OrderCancellationInfo {
  orderNumber: string;
  orderTotal?: number;
  cancelledByName: string;
  cancelledByRole: string;
  wholesalerEmail?: string;
  wholesalerName?: string;
}

interface OutOfStockReportInfo {
  reportId: string;
  wholesalerName?: string;
  itemCount: number;
}

interface MaintenanceInfo {
  scheduledDate: string;
  estimatedDuration: string;
  reason: string;
}

interface PasswordResetSuccessInfo {
  resetTime: string;
  ipAddress: string;
  userAgent: string;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly emailConfig: EmailConfig;

  constructor(
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.emailConfig = this.configService.get<EmailConfig>('email')!;
  }

  private async getAdminAlertRecipients(): Promise<string[]> {
    const adminUsers = await this.prisma.user.findMany({
      where: {
        role: { in: [UserRole.ADMIN, UserRole.SUPER_ADMIN] },
        status: UserStatus.ACTIVE,
      },
      select: { email: true },
    });

    return Array.from(
      new Set(
        adminUsers
          .map((user) => user.email?.trim().toLowerCase())
          .filter((email): email is string => Boolean(email)),
      ),
    );
  }

  private getWholesalerContact(order: Order): {
    firstName: string;
    lastName: string;
    email: string;
  } {
    const userPayload = order.wholesaler.user;
    const firstName =
      userPayload?.firstName || order.wholesaler.firstName || 'Customer';
    const lastName = userPayload?.lastName || order.wholesaler.lastName || '';
    const email = userPayload?.email || order.wholesaler.email || '';

    return { firstName, lastName, email };
  }

  /**
   * Send order confirmation notification
   */
  async notifyOrderConfirmation(order: Order): Promise<void> {
    const wholesaler = this.getWholesalerContact(order);
    const notifications: BatchEmailRequest[] = [
      // Customer notification
      {
        templateAlias: EMAIL_TEMPLATES.ORDER_CONFIRMATION,
        to: [wholesaler.email],
        variables: {
          CUSTOMER_NAME: wholesaler.firstName,
          ORDER_NUMBER: order.orderNumber,
          ORDER_TOTAL: order.totalAmount.toLocaleString(),
          ORDER_DATE: order.createdAt.toLocaleDateString(),
          ITEMS_COUNT: order.items.length,
          VIEW_ORDER_URL: `${this.emailConfig.wholesalerBaseUrl}/dashboard/orders`,
        } as OrderEmailVariables,
        priority: EmailPriority.HIGH,
      },
    ];

    const adminRecipients = await this.getAdminAlertRecipients();
    if (adminRecipients.length > 0) {
      notifications.push({
        templateAlias: EMAIL_TEMPLATES.ADMIN_NEW_ORDER,
        to: adminRecipients,
        variables: {
          ORDER_NUMBER: order.orderNumber,
          CUSTOMER_NAME:
            `${wholesaler.firstName} ${wholesaler.lastName}`.trim(),
          ORDER_TOTAL: order.totalAmount.toLocaleString(),
          ADMIN_ORDER_URL: `${this.emailConfig.baseUrl}/dashboard/order-logs`,
        },
        priority: EmailPriority.HIGH,
      });
    }

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
    const wholesaler = this.getWholesalerContact(order);

    const emailRequest: QueueEmailRequest = {
      templateAlias: EMAIL_TEMPLATES.ORDER_ASSIGNMENT,
      to: [procurementOfficer.email],
      variables: {
        OFFICER_NAME: procurementOfficer.firstName || 'Officer',
        ORDER_NUMBER: order.orderNumber,
        WHOLESALER_NAME:
          `${wholesaler.firstName} ${wholesaler.lastName}`.trim(),
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
    const resetBaseUrl =
      user.role === UserRole.WHOLESALER
        ? this.emailConfig.wholesalerBaseUrl
        : this.emailConfig.baseUrl;

    const emailRequest: QueueEmailRequest = {
      templateAlias: EMAIL_TEMPLATES.PASSWORD_RESET_REQUEST,
      to: [user.email],
      variables: {
        USER_NAME: user.firstName || user.email,
        RESET_LINK: `${resetBaseUrl}/reset-password?token=${resetToken}`,
        EXPIRY_TIME: '24 hours',
      } as AuthEmailVariables,
      priority: EmailPriority.HIGH,
    };

    await this.emailService.queueEmail(emailRequest);
    this.logger.log(
      `Password reset notification queued for user: ${user.email}`,
    );
  }

  async notifyPasswordResetSuccess(
    user: User,
    details: PasswordResetSuccessInfo,
  ): Promise<void> {
    await this.emailService.queueEmail({
      templateAlias: EMAIL_TEMPLATES.PASSWORD_RESET_SUCCESS,
      to: [user.email],
      variables: {
        USER_NAME:
          `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
        RESET_TIME: details.resetTime,
        IP_ADDRESS: details.ipAddress,
        USER_AGENT: details.userAgent,
      } as Record<string, string | number>,
      priority: EmailPriority.HIGH,
    });

    this.logger.log(
      `Password reset success notification queued for user: ${user.email}`,
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
        USER_NAME: user.firstName || user.email,
        LOGIN_URL: `${this.emailConfig.wholesalerBaseUrl}/dashboard/orders`,
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
        USER_NAME: user.firstName || user.email,
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
    const wholesaler = this.getWholesalerContact(order);
    const notifications: BatchEmailRequest[] = [
      {
        templateAlias: EMAIL_TEMPLATES.ORDER_COMPLETION,
        to: [wholesaler.email],
        variables: {
          CUSTOMER_NAME: wholesaler.firstName,
          ORDER_NUMBER: order.orderNumber,
          ORDER_TOTAL: order.totalAmount.toLocaleString(),
          ORDER_DATE: order.createdAt.toLocaleDateString(),
          ITEMS_COUNT: order.items.length,
          VIEW_ORDER_URL: `${this.emailConfig.wholesalerBaseUrl}/dashboard/orders`,
        } as OrderEmailVariables,
        priority: EmailPriority.HIGH,
      },
    ];

    const adminRecipients = await this.getAdminAlertRecipients();
    if (adminRecipients.length > 0) {
      notifications.push({
        templateAlias: EMAIL_TEMPLATES.ORDER_COMPLETION,
        to: adminRecipients,
        variables: {
          CUSTOMER_NAME: wholesaler.firstName,
          ORDER_NUMBER: order.orderNumber,
          ORDER_TOTAL: order.totalAmount.toLocaleString(),
          ORDER_DATE: order.createdAt.toLocaleDateString(),
          ITEMS_COUNT: order.items.length,
          VIEW_ORDER_URL: `${this.emailConfig.baseUrl}/dashboard/order-logs`,
        } as OrderEmailVariables,
        priority: EmailPriority.HIGH,
      });
    }

    await this.emailService.queueBatchEmails(notifications, EmailPriority.HIGH);
    this.logger.log(
      `Order completion notification queued for order: ${order.orderNumber}`,
    );
  }

  async notifyPaymentInitiated(order: Order): Promise<void> {
    const wholesaler = this.getWholesalerContact(order);
    await this.emailService.queueEmail({
      templateAlias: EMAIL_TEMPLATES.PAYMENT_INITIATED,
      to: [wholesaler.email],
      variables: {
        CUSTOMER_NAME: wholesaler.firstName,
        ORDER_NUMBER: order.orderNumber,
        ORDER_TOTAL: order.totalAmount.toLocaleString(),
        ORDER_DATE: order.createdAt.toLocaleDateString(),
        ITEMS_COUNT: order.items.length,
        VIEW_ORDER_URL: `${this.emailConfig.wholesalerBaseUrl}/dashboard/orders`,
      } as OrderEmailVariables,
      priority: EmailPriority.HIGH,
    });
  }

  async notifyPaymentFailed(order: Order, reason?: string): Promise<void> {
    const wholesaler = this.getWholesalerContact(order);
    const notifications: BatchEmailRequest[] = [
      {
        templateAlias: EMAIL_TEMPLATES.PAYMENT_FAILED,
        to: [wholesaler.email],
        variables: {
          CUSTOMER_NAME: wholesaler.firstName,
          ORDER_NUMBER: order.orderNumber,
          ORDER_TOTAL: order.totalAmount.toLocaleString(),
          ORDER_DATE: order.createdAt.toLocaleDateString(),
          ITEMS_COUNT: order.items.length,
          VIEW_ORDER_URL: `${this.emailConfig.wholesalerBaseUrl}/dashboard/orders`,
          REASON: reason || 'Payment could not be processed',
        } as Record<string, string | number>,
        priority: EmailPriority.HIGH,
      },
    ];

    const adminRecipients = await this.getAdminAlertRecipients();
    if (adminRecipients.length > 0) {
      notifications.push({
        templateAlias: EMAIL_TEMPLATES.PAYMENT_FAILED,
        to: adminRecipients,
        variables: {
          CUSTOMER_NAME:
            `${wholesaler.firstName} ${wholesaler.lastName}`.trim(),
          ORDER_NUMBER: order.orderNumber,
          ORDER_TOTAL: order.totalAmount.toLocaleString(),
          ORDER_DATE: order.createdAt.toLocaleDateString(),
          ITEMS_COUNT: order.items.length,
          VIEW_ORDER_URL: `${this.emailConfig.baseUrl}/dashboard/order-logs`,
          REASON: reason || 'Payment could not be processed',
        } as Record<string, string | number>,
        priority: EmailPriority.HIGH,
      });
    }

    await this.emailService.queueBatchEmails(notifications, EmailPriority.HIGH);
  }

  async notifyOrderReassigned(
    order: Order,
    newOfficer: User,
    previousOfficer?: User,
  ): Promise<void> {
    const wholesaler = this.getWholesalerContact(order);
    const notifications: BatchEmailRequest[] = [
      {
        templateAlias: EMAIL_TEMPLATES.ORDER_REASSIGNED,
        to: [newOfficer.email],
        variables: {
          OFFICER_NAME: newOfficer.firstName || 'Officer',
          ORDER_NUMBER: order.orderNumber,
          WHOLESALER_NAME:
            `${wholesaler.firstName} ${wholesaler.lastName}`.trim(),
          ORDER_TOTAL: order.totalAmount.toLocaleString(),
          ITEMS_COUNT: order.items.length,
          ASSIGNMENT_URL: `${this.emailConfig.baseUrl}/dashboard/order-logs`,
        } as AssignmentEmailVariables,
        priority: EmailPriority.HIGH,
      },
    ];

    if (previousOfficer?.email) {
      notifications.push({
        templateAlias: EMAIL_TEMPLATES.ORDER_REASSIGNED,
        to: [previousOfficer.email],
        variables: {
          OFFICER_NAME: newOfficer.firstName || 'Officer',
          ORDER_NUMBER: order.orderNumber,
          WHOLESALER_NAME:
            `${wholesaler.firstName} ${wholesaler.lastName}`.trim(),
          ORDER_TOTAL: order.totalAmount.toLocaleString(),
          ITEMS_COUNT: order.items.length,
          ASSIGNMENT_URL: `${this.emailConfig.baseUrl}/dashboard/order-logs`,
        } as AssignmentEmailVariables,
        priority: EmailPriority.HIGH,
      });
    }

    const adminRecipients = await this.getAdminAlertRecipients();
    if (adminRecipients.length > 0) {
      notifications.push({
        templateAlias: EMAIL_TEMPLATES.ORDER_REASSIGNED,
        to: adminRecipients,
        variables: {
          OFFICER_NAME: newOfficer.firstName || 'Officer',
          ORDER_NUMBER: order.orderNumber,
          WHOLESALER_NAME:
            `${wholesaler.firstName} ${wholesaler.lastName}`.trim(),
          ORDER_TOTAL: order.totalAmount.toLocaleString(),
          ITEMS_COUNT: order.items.length,
          ASSIGNMENT_URL: `${this.emailConfig.baseUrl}/dashboard/order-logs`,
        } as AssignmentEmailVariables,
        priority: EmailPriority.HIGH,
      });
    }

    await this.emailService.queueBatchEmails(notifications, EmailPriority.HIGH);
  }

  async notifyAssignmentRejected(
    rejection: AssignmentRejectionInfo,
  ): Promise<void> {
    const adminRecipients = await this.getAdminAlertRecipients();
    if (adminRecipients.length === 0) {
      return;
    }

    await this.emailService.queueEmail({
      templateAlias: EMAIL_TEMPLATES.ASSIGNMENT_REJECTED,
      to: adminRecipients,
      variables: {
        ORDER_NUMBER: rejection.orderNumber,
        OFFICER_NAME: rejection.officerName,
        REASON: rejection.reason || 'No reason provided',
        ADMIN_ORDER_URL: `${this.emailConfig.baseUrl}/dashboard/order-logs`,
      } as Record<string, string | number>,
      priority: EmailPriority.HIGH,
    });
  }

  async notifyAssignmentAccepted(
    acceptance: AssignmentAcceptanceInfo,
  ): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { orderNumber: acceptance.orderNumber },
      select: {
        orderNumber: true,
        wholesaler: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    const adminRecipients = await this.getAdminAlertRecipients();
    const notifications: BatchEmailRequest[] = [];

    if (adminRecipients.length > 0) {
      notifications.push({
        templateAlias: EMAIL_TEMPLATES.ADMIN_ASSIGNMENT_ALERT,
        to: adminRecipients,
        variables: {
          ORDER_NUMBER: acceptance.orderNumber,
          OFFICER_NAME: acceptance.officerName,
          ADMIN_ORDER_URL: `${this.emailConfig.baseUrl}/dashboard/order-logs`,
        } as Record<string, string | number>,
        priority: EmailPriority.HIGH,
      });
    }

    if (order?.wholesaler?.email) {
      const wholesalerName =
        `${order.wholesaler.firstName || ''} ${order.wholesaler.lastName || ''}`.trim() ||
        'Customer';

      notifications.push({
        templateAlias: EMAIL_TEMPLATES.ORDER_STATUS_UPDATE,
        to: [order.wholesaler.email],
        variables: {
          CUSTOMER_NAME: wholesalerName,
          ORDER_NUMBER: acceptance.orderNumber,
          OFFICER_NAME: acceptance.officerName,
          VIEW_ORDER_URL: `${this.emailConfig.wholesalerBaseUrl}/dashboard/orders`,
        } as Record<string, string | number>,
        priority: EmailPriority.HIGH,
      });
    }

    if (notifications.length === 0) {
      return;
    }

    await this.emailService.queueBatchEmails(notifications, EmailPriority.HIGH);
  }

  async notifyOrderCancelled(
    cancellation: OrderCancellationInfo,
  ): Promise<void> {
    const notifications: BatchEmailRequest[] = [];

    if (cancellation.wholesalerEmail) {
      notifications.push({
        templateAlias: EMAIL_TEMPLATES.ORDER_CANCELLED,
        to: [cancellation.wholesalerEmail],
        variables: {
          CUSTOMER_NAME: cancellation.wholesalerName || 'Customer',
          ORDER_NUMBER: cancellation.orderNumber,
          ORDER_TOTAL: (cancellation.orderTotal || 0).toLocaleString(),
          CANCELLED_BY: cancellation.cancelledByName,
          VIEW_ORDER_URL: `${this.emailConfig.wholesalerBaseUrl}/dashboard/orders`,
        } as Record<string, string | number>,
        priority: EmailPriority.HIGH,
      });
    }

    const adminRecipients = await this.getAdminAlertRecipients();
    if (adminRecipients.length > 0) {
      notifications.push({
        templateAlias: EMAIL_TEMPLATES.ORDER_CANCELLED,
        to: adminRecipients,
        variables: {
          CUSTOMER_NAME: cancellation.wholesalerName || 'Customer',
          ORDER_NUMBER: cancellation.orderNumber,
          ORDER_TOTAL: (cancellation.orderTotal || 0).toLocaleString(),
          CANCELLED_BY: `${cancellation.cancelledByName} (${cancellation.cancelledByRole})`,
          VIEW_ORDER_URL: `${this.emailConfig.baseUrl}/dashboard/order-logs`,
        } as Record<string, string | number>,
        priority: EmailPriority.HIGH,
      });
    }

    if (notifications.length === 0) {
      return;
    }

    await this.emailService.queueBatchEmails(notifications, EmailPriority.HIGH);
  }

  async notifyAccountCreatedInvite(
    user: User,
    resetUrl: string,
    expiryTime = '72 hours',
  ): Promise<void> {
    await this.emailService.queueEmail({
      templateAlias: EMAIL_TEMPLATES.ACCOUNT_CREATED_INVITE,
      to: [user.email],
      variables: {
        USER_NAME: user.firstName || user.email,
        RESET_LINK: resetUrl,
        EXPIRY_TIME: expiryTime,
      } as AuthEmailVariables,
      priority: EmailPriority.HIGH,
    });
  }

  async notifyRoleUpdated(
    user: User,
    previousRole: string,
    newRole: string,
  ): Promise<void> {
    const notifications: BatchEmailRequest[] = [
      {
        templateAlias: EMAIL_TEMPLATES.ROLE_UPDATED,
        to: [user.email],
        variables: {
          USER_NAME: `${user.firstName} ${user.lastName}`.trim() || 'User',
          OLD_ROLE: previousRole,
          NEW_ROLE: newRole,
        } as Record<string, string | number>,
        priority: EmailPriority.HIGH,
      },
    ];

    const adminRecipients = await this.getAdminAlertRecipients();
    if (adminRecipients.length > 0) {
      notifications.push({
        templateAlias: EMAIL_TEMPLATES.ROLE_UPDATED,
        to: adminRecipients,
        variables: {
          USER_NAME: `${user.firstName} ${user.lastName}`.trim() || user.email,
          OLD_ROLE: previousRole,
          NEW_ROLE: newRole,
        } as Record<string, string | number>,
        priority: EmailPriority.HIGH,
      });
    }

    await this.emailService.queueBatchEmails(notifications, EmailPriority.HIGH);
  }

  async notifyAccountDeactivated(user: User, reason?: string): Promise<void> {
    const notifications: BatchEmailRequest[] = [
      {
        templateAlias: EMAIL_TEMPLATES.ACCOUNT_DEACTIVATED,
        to: [user.email],
        variables: {
          USER_NAME: `${user.firstName} ${user.lastName}`.trim() || 'User',
          REASON: reason || 'Administrative action',
        } as Record<string, string | number>,
        priority: EmailPriority.HIGH,
      },
    ];

    const adminRecipients = await this.getAdminAlertRecipients();
    if (adminRecipients.length > 0) {
      notifications.push({
        templateAlias: EMAIL_TEMPLATES.ACCOUNT_DEACTIVATED,
        to: adminRecipients,
        variables: {
          USER_NAME: `${user.firstName} ${user.lastName}`.trim() || user.email,
          REASON: reason || 'Administrative action',
        } as Record<string, string | number>,
        priority: EmailPriority.HIGH,
      });
    }

    await this.emailService.queueBatchEmails(notifications, EmailPriority.HIGH);
  }

  async notifyOutOfStockReportOpened(
    report: OutOfStockReportInfo,
  ): Promise<void> {
    const adminRecipients = await this.getAdminAlertRecipients();
    if (adminRecipients.length === 0) {
      return;
    }

    await this.emailService.queueEmail({
      templateAlias: EMAIL_TEMPLATES.OUT_OF_STOCK_REPORT_OPENED,
      to: adminRecipients,
      variables: {
        REPORT_ID: report.reportId,
        WHOLESALER_NAME: report.wholesalerName || 'Wholesaler',
        ITEM_COUNT: report.itemCount,
        ADMIN_REPORT_URL: `${this.emailConfig.baseUrl}/dashboard`,
      } as Record<string, string | number>,
      priority: EmailPriority.HIGH,
    });
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
        USER_NAME: user.firstName || user.email,
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
