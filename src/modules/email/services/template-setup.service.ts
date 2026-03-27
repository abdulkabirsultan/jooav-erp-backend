import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { EMAIL_TEMPLATES } from '../types/email.types';
import { EmailConfig } from '../../../config/email.config';

interface TemplateDefinition {
  name: string;
  alias: string;
  subject: string;
  html: string;
  variables: Array<{
    key: string;
    type: 'string' | 'number';
    fallbackValue: string | number;
  }>;
}

@Injectable()
export class TemplateSetupService {
  private readonly logger = new Logger(TemplateSetupService.name);
  private readonly resend: Resend;
  private readonly emailConfig: EmailConfig;

  constructor(private readonly configService: ConfigService) {
    this.emailConfig = this.configService.get<EmailConfig>('email')!;
    this.resend = new Resend(this.emailConfig.apiKey);
  }

  /**
   * Deploy all email templates
   */
  async deployAllTemplates(): Promise<void> {
    if (!this.emailConfig.enabled) {
      this.logger.warn('Email service is disabled - templates not deployed');
      return;
    }

    const templates = this.getManagedTemplateDefinitions();

    for (const template of templates) {
      await this.deployTemplate(template);
    }

    this.logger.log(
      `Successfully deployed ${templates.length} email templates`,
    );
  }

  /**
   * Delete all managed templates from Resend.
   * Resend supports removing templates one at a time, so this method iterates aliases.
   */
  async deleteAllTemplates(): Promise<void> {
    if (!this.emailConfig.enabled) {
      this.logger.warn('Email service is disabled - templates not deleted');
      return;
    }

    const templateAliases = this.getManagedTemplateDefinitions().map(
      (template) => template.alias,
    );

    for (const alias of templateAliases) {
      try {
        await this.resend.templates.remove(alias);
        this.logger.log(`🗑️ Template deleted: ${alias}`);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        if (errorMessage.toLowerCase().includes('not found')) {
          this.logger.warn(`⚠️ Template not found during delete: ${alias}`);
          continue;
        }

        this.logger.error(
          `❌ Failed to delete template: ${alias} - ${errorMessage}`,
        );
        throw error;
      }
    }

    this.logger.log(
      `Successfully processed deletion for ${templateAliases.length} managed templates`,
    );
  }

  private getManagedTemplateDefinitions(): TemplateDefinition[] {
    return [
      this.createOrderConfirmationTemplate(),
      this.createPasswordResetTemplate(),
      this.createPasswordResetRequestTemplate(),
      this.createPasswordResetSuccessTemplate(),
      this.createAccountCreatedInviteTemplate(),
      this.createOrderAssignmentTemplate(),
      this.createOrderReassignedTemplate(),
      this.createAssignmentRejectedTemplate(),
      this.createPaymentInitiatedTemplate(),
      this.createPaymentFailedTemplate(),
      this.createOrderCancelledTemplate(),
      this.createRoleUpdatedTemplate(),
      this.createAccountDeactivatedTemplate(),
      this.createOutOfStockReportOpenedTemplate(),
      this.createWelcomeTemplate(),
      this.createEmailVerificationTemplate(),
      this.createOrderCompletionTemplate(),
      this.createOrderStatusUpdateTemplate(),
      this.createAdminNewOrderTemplate(),
      this.createAdminAssignmentAlertTemplate(),
      this.createSystemMaintenanceTemplate(),
    ];
  }

  /**
   * Deploy a single template
   */
  private async deployTemplate(template: TemplateDefinition): Promise<void> {
    try {
      // Create template first
      const createdTemplate = await this.resend.templates.create({
        name: template.name,
        alias: template.alias,
        subject: template.subject,
        html: template.html,
        // Convert our variable format to Resend format
        variables: template.variables.map((v) => {
          if (v.type === 'string') {
            return {
              key: v.key,
              type: 'string' as const,
              fallbackValue: v.fallbackValue as string,
            };
          } else {
            return {
              key: v.key,
              type: 'number' as const,
              fallbackValue: v.fallbackValue as number,
            };
          }
        }),
      });

      // Then publish it
      await this.resend.templates.publish(template.alias);

      this.logger.log(`✅ Template created and published: ${template.alias}`);
    } catch (error) {
      if (error.message?.includes('already exists')) {
        this.logger.warn(`⚠️ Template already exists: ${template.alias}`);
      } else {
        this.logger.error(
          `❌ Failed to create template: ${template.alias} - ${error.message}`,
        );
        throw error;
      }
    }
  }

  private buildCorporateTemplate(options: {
    title: string;
    intro: string;
    detailsHtml?: string;
    ctaLabel?: string;
    ctaUrl?: string;
    note?: string;
  }): string {
    const logoUrl =
      'https://res.cloudinary.com/dpyhmbyhk/image/upload/v1774564279/jooav-logo_kywxih.jpg';

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>
          body { margin: 0; padding: 0; background: #f4f6fb; font-family: 'Segoe UI', Arial, sans-serif; color: #111827; }
          .container { max-width: 600px; margin: 0 auto; background: #ffffff; }
          .header { padding: 24px; border-bottom: 1px solid #e5e7eb; text-align: left; }
          .logo { max-height: 28px; }
          .brand { font-size: 22px; font-weight: 700; color: #2F7BEB; }
          .content { padding: 28px 24px; }
          h1 { margin: 0 0 16px; font-size: 22px; line-height: 1.3; color: #0f172a; }
          p { margin: 0 0 12px; color: #334155; line-height: 1.6; font-size: 14px; }
          .details { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0; }
          .cta-wrap { margin: 24px 0; }
          .cta { display: inline-block; background: #2F7BEB; color: #ffffff !important; text-decoration: none; font-weight: 600; font-size: 14px; padding: 12px 18px; border-radius: 6px; }
          .note { color: #64748b; font-size: 12px; margin-top: 10px; }
          .footer { padding: 18px 24px; border-top: 1px solid #e5e7eb; background: #f8fafc; }
          .footer p { margin: 0; color: #64748b; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <img src="${logoUrl}" alt="JOOAV" class="logo" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';" />
            <div class="brand" style="display:none;">JOOAV ERP</div>
          </div>
          <div class="content">
            <h1>${options.title}</h1>
            <p>${options.intro}</p>
            ${options.detailsHtml ? `<div class="details">${options.detailsHtml}</div>` : ''}
            ${options.ctaLabel && options.ctaUrl ? `<div class="cta-wrap"><a href="${options.ctaUrl}" class="cta">${options.ctaLabel}</a></div>` : ''}
            ${options.note ? `<p class="note">${options.note}</p>` : ''}
          </div>
          <div class="footer">
            <p>JOOAV ERP Operations · This is an automated operational communication.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Order confirmation template
   */
  private createOrderConfirmationTemplate(): TemplateDefinition {
    return {
      name: 'Order Confirmation Template',
      alias: EMAIL_TEMPLATES.ORDER_CONFIRMATION,
      subject: 'Order Confirmation {{{ORDER_NUMBER}}} - JOOAV ERP',
      html: this.buildCorporateTemplate({
        title: 'Order Confirmed {{{ORDER_NUMBER}}}',
        intro:
          'Hello {{{CUSTOMER_NAME}}}, your order has been received and is now being processed by our operations team.',
        detailsHtml:
          '<p><strong>Order Number:</strong> {{{ORDER_NUMBER}}}</p><p><strong>Order Date:</strong> {{{ORDER_DATE}}}</p><p><strong>Total Amount:</strong> ₦{{{ORDER_TOTAL}}}</p><p><strong>Items:</strong> {{{ITEMS_COUNT}}}</p>',
        ctaLabel: 'View Order Details',
        ctaUrl: '{{{VIEW_ORDER_URL}}}',
      }),
      variables: [
        { key: 'CUSTOMER_NAME', type: 'string', fallbackValue: 'Customer' },
        { key: 'ORDER_NUMBER', type: 'string', fallbackValue: 'ORD-001' },
        { key: 'ORDER_DATE', type: 'string', fallbackValue: 'Today' },
        { key: 'ORDER_TOTAL', type: 'string', fallbackValue: '0' },
        { key: 'ITEMS_COUNT', type: 'number', fallbackValue: 0 },
        { key: 'VIEW_ORDER_URL', type: 'string', fallbackValue: '#' },
      ],
    };
  }

  /**
   * Password reset template
   */
  private createPasswordResetTemplate(): TemplateDefinition {
    return {
      name: 'Password Reset Template',
      alias: EMAIL_TEMPLATES.PASSWORD_RESET,
      subject: 'Reset Your Password - JOOAV ERP',
      html: this.buildCorporateTemplate({
        title: 'Password Reset Request',
        intro:
          'Hello {{{USER_NAME}}}, we received a request to reset your password.',
        ctaLabel: 'Reset Password',
        ctaUrl: '{{{RESET_LINK}}}',
        note: 'This secure link expires in {{{EXPIRY_TIME}}}. If you did not request this action, you may ignore this communication.',
      }),
      variables: [
        { key: 'USER_NAME', type: 'string', fallbackValue: 'User' },
        { key: 'RESET_LINK', type: 'string', fallbackValue: '#' },
        { key: 'EXPIRY_TIME', type: 'string', fallbackValue: '24 hours' },
      ],
    };
  }

  /**
   * Order assignment template
   */
  private createOrderAssignmentTemplate(): TemplateDefinition {
    return {
      name: 'Order Assignment Notification',
      alias: EMAIL_TEMPLATES.ORDER_ASSIGNMENT,
      subject: 'New Order Assignment {{{ORDER_NUMBER}}} - JOOAV ERP',
      html: this.buildCorporateTemplate({
        title: 'New Order Assignment',
        intro:
          'Hello {{{OFFICER_NAME}}}, an order has been assigned to you for processing.',
        detailsHtml:
          '<p><strong>Order Number:</strong> {{{ORDER_NUMBER}}}</p><p><strong>Wholesaler:</strong> {{{WHOLESALER_NAME}}}</p><p><strong>Total Amount:</strong> ₦{{{ORDER_TOTAL}}}</p><p><strong>Items Count:</strong> {{{ITEMS_COUNT}}}</p>',
        ctaLabel: 'Process Order',
        ctaUrl: '{{{ASSIGNMENT_URL}}}',
      }),
      variables: [
        { key: 'OFFICER_NAME', type: 'string', fallbackValue: 'Officer' },
        { key: 'ORDER_NUMBER', type: 'string', fallbackValue: 'ORD-001' },
        { key: 'WHOLESALER_NAME', type: 'string', fallbackValue: 'Wholesaler' },
        { key: 'ORDER_TOTAL', type: 'string', fallbackValue: '0' },
        { key: 'ITEMS_COUNT', type: 'number', fallbackValue: 0 },
        { key: 'ASSIGNMENT_URL', type: 'string', fallbackValue: '#' },
      ],
    };
  }

  /**
   * Welcome template
   */
  private createWelcomeTemplate(): TemplateDefinition {
    return {
      name: 'Welcome Template',
      alias: EMAIL_TEMPLATES.WELCOME,
      subject: 'Welcome to JOOAV ERP',
      html: this.buildCorporateTemplate({
        title: 'Welcome to JOOAV ERP',
        intro:
          'Hello {{{USER_NAME}}}, your account has been successfully created and is now ready for use.',
        ctaLabel: 'Get Started',
        ctaUrl: '{{{LOGIN_URL}}}',
      }),
      variables: [
        { key: 'USER_NAME', type: 'string', fallbackValue: 'User' },
        { key: 'LOGIN_URL', type: 'string', fallbackValue: '#' },
      ],
    };
  }

  /**
   * Email verification template
   */
  private createEmailVerificationTemplate(): TemplateDefinition {
    return {
      name: 'Email Verification Template',
      alias: EMAIL_TEMPLATES.EMAIL_VERIFICATION,
      subject: 'Verify Your Email - JOOAV ERP',
      html: this.buildCorporateTemplate({
        title: 'Verify Your Email Address',
        intro:
          'Hello {{{USER_NAME}}}, please verify your email address to complete account setup.',
        ctaLabel: 'Verify Email',
        ctaUrl: '{{{VERIFICATION_LINK}}}',
        note: 'This verification link expires in {{{EXPIRY_TIME}}}.',
      }),
      variables: [
        { key: 'USER_NAME', type: 'string', fallbackValue: 'User' },
        { key: 'VERIFICATION_LINK', type: 'string', fallbackValue: '#' },
        { key: 'EXPIRY_TIME', type: 'string', fallbackValue: '48 hours' },
      ],
    };
  }

  /**
   * Order completion template
   */
  private createOrderCompletionTemplate(): TemplateDefinition {
    return {
      name: 'Order Completion Template',
      alias: EMAIL_TEMPLATES.ORDER_COMPLETION,
      subject: 'Order Completed {{{ORDER_NUMBER}}} - JOOAV ERP',
      html: this.buildCorporateTemplate({
        title: 'Order Completed {{{ORDER_NUMBER}}}',
        intro:
          'Hello {{{CUSTOMER_NAME}}}, your order has been completed and has successfully been delivered.',
        detailsHtml:
          '<p><strong>Order Number:</strong> {{{ORDER_NUMBER}}}</p><p><strong>Order Date:</strong> {{{ORDER_DATE}}}</p><p><strong>Total Amount:</strong> ₦{{{ORDER_TOTAL}}}</p><p><strong>Items:</strong> {{{ITEMS_COUNT}}}</p>',
        ctaLabel: 'View Order Details',
        ctaUrl: '{{{VIEW_ORDER_URL}}}',
      }),
      variables: [
        { key: 'CUSTOMER_NAME', type: 'string', fallbackValue: 'Customer' },
        { key: 'ORDER_NUMBER', type: 'string', fallbackValue: 'ORD-001' },
        { key: 'ORDER_DATE', type: 'string', fallbackValue: 'Today' },
        { key: 'ORDER_TOTAL', type: 'string', fallbackValue: '0' },
        { key: 'ITEMS_COUNT', type: 'number', fallbackValue: 0 },
        { key: 'VIEW_ORDER_URL', type: 'string', fallbackValue: '#' },
      ],
    };
  }

  private createOrderStatusUpdateTemplate(): TemplateDefinition {
    return {
      name: 'Order Status Update Template',
      alias: EMAIL_TEMPLATES.ORDER_STATUS_UPDATE,
      subject: 'Order In Progress {{{ORDER_NUMBER}}} - JOOAV ERP',
      html: this.buildCorporateTemplate({
        title: 'Your Order Is Now In Progress',
        intro:
          'Hello {{{CUSTOMER_NAME}}}, your order is now actively being processed by our procurement team.',
        detailsHtml:
          '<p><strong>Order Number:</strong> {{{ORDER_NUMBER}}}</p><p><strong>Assigned Officer:</strong> {{{OFFICER_NAME}}}</p><p><strong>Status:</strong> In Progress</p>',
        ctaLabel: 'View Order',
        ctaUrl: '{{{VIEW_ORDER_URL}}}',
      }),
      variables: [
        { key: 'CUSTOMER_NAME', type: 'string', fallbackValue: 'Customer' },
        { key: 'ORDER_NUMBER', type: 'string', fallbackValue: 'ORD-001' },
        { key: 'OFFICER_NAME', type: 'string', fallbackValue: 'Officer' },
        { key: 'VIEW_ORDER_URL', type: 'string', fallbackValue: '#' },
      ],
    };
  }

  /**
   * Admin new order template
   */
  private createAdminNewOrderTemplate(): TemplateDefinition {
    return {
      name: 'Admin New Order Notification',
      alias: EMAIL_TEMPLATES.ADMIN_NEW_ORDER,
      subject: 'New Order {{{ORDER_NUMBER}}} - Admin Alert',
      html: this.buildCorporateTemplate({
        title: 'New Order Alert {{{ORDER_NUMBER}}}',
        intro:
          'A new order has been placed and requires administrative review.',
        detailsHtml:
          '<p><strong>Order Number:</strong> {{{ORDER_NUMBER}}}</p><p><strong>Customer:</strong> {{{CUSTOMER_NAME}}}</p><p><strong>Total Amount:</strong> ₦{{{ORDER_TOTAL}}}</p>',
        ctaLabel: 'Open Admin Order',
        ctaUrl: '{{{ADMIN_ORDER_URL}}}',
      }),
      variables: [
        { key: 'ORDER_NUMBER', type: 'string', fallbackValue: 'ORD-001' },
        { key: 'CUSTOMER_NAME', type: 'string', fallbackValue: 'Customer' },
        { key: 'ORDER_TOTAL', type: 'string', fallbackValue: '0' },
        { key: 'ADMIN_ORDER_URL', type: 'string', fallbackValue: '#' },
      ],
    };
  }

  private createAdminAssignmentAlertTemplate(): TemplateDefinition {
    return {
      name: 'Admin Assignment Accepted Alert',
      alias: EMAIL_TEMPLATES.ADMIN_ASSIGNMENT_ALERT,
      subject: 'Assignment Accepted {{{ORDER_NUMBER}}} - Admin Alert',
      html: this.buildCorporateTemplate({
        title: 'Procurement Assignment Accepted',
        intro:
          'A procurement officer has accepted an order assignment. Administrative visibility is provided for coordination.',
        detailsHtml:
          '<p><strong>Order Number:</strong> {{{ORDER_NUMBER}}}</p><p><strong>Officer:</strong> {{{OFFICER_NAME}}}</p>',
        ctaLabel: 'View Order Log',
        ctaUrl: '{{{ADMIN_ORDER_URL}}}',
      }),
      variables: [
        { key: 'ORDER_NUMBER', type: 'string', fallbackValue: 'ORD-001' },
        { key: 'OFFICER_NAME', type: 'string', fallbackValue: 'Officer' },
        { key: 'ADMIN_ORDER_URL', type: 'string', fallbackValue: '#' },
      ],
    };
  }

  /**
   * System maintenance template
   */
  private createSystemMaintenanceTemplate(): TemplateDefinition {
    return {
      name: 'System Maintenance Notification',
      alias: EMAIL_TEMPLATES.SYSTEM_MAINTENANCE,
      subject: 'Scheduled System Maintenance - JOOAV ERP',
      html: this.buildCorporateTemplate({
        title: 'Scheduled System Maintenance',
        intro:
          'Hello {{{USER_NAME}}}, scheduled maintenance has been planned for the JOOAV ERP platform.',
        detailsHtml:
          '<p><strong>Date:</strong> {{{MAINTENANCE_DATE}}}</p><p><strong>Expected Duration:</strong> {{{MAINTENANCE_DURATION}}}</p><p><strong>Reason:</strong> {{{MAINTENANCE_REASON}}}</p>',
        note: 'We appreciate your patience and apologize for any inconvenience.',
      }),
      variables: [
        { key: 'USER_NAME', type: 'string', fallbackValue: 'User' },
        { key: 'MAINTENANCE_DATE', type: 'string', fallbackValue: 'TBD' },
        {
          key: 'MAINTENANCE_DURATION',
          type: 'string',
          fallbackValue: '2 hours',
        },
        {
          key: 'MAINTENANCE_REASON',
          type: 'string',
          fallbackValue: 'System updates',
        },
      ],
    };
  }

  private createPasswordResetRequestTemplate(): TemplateDefinition {
    return {
      name: 'Password Reset Request Template',
      alias: EMAIL_TEMPLATES.PASSWORD_RESET_REQUEST,
      subject: 'Password Reset Request - JOOAV ERP',
      html: this.buildCorporateTemplate({
        title: 'Password Reset Request',
        intro:
          'Hello {{{USER_NAME}}}, we received a request to reset your password. If this was authorized by you, proceed using the secure link below.',
        ctaLabel: 'Reset Password',
        ctaUrl: '{{{RESET_LINK}}}',
        note: 'This link expires in {{{EXPIRY_TIME}}}. If you did not make this request, please ignore this message and contact support.',
      }),
      variables: [
        { key: 'USER_NAME', type: 'string', fallbackValue: 'User' },
        { key: 'RESET_LINK', type: 'string', fallbackValue: '#' },
        { key: 'EXPIRY_TIME', type: 'string', fallbackValue: '1 hour' },
      ],
    };
  }

  private createPasswordResetSuccessTemplate(): TemplateDefinition {
    return {
      name: 'Password Reset Success Template',
      alias: EMAIL_TEMPLATES.PASSWORD_RESET_SUCCESS,
      subject: 'Password Updated Successfully - JOOAV ERP',
      html: this.buildCorporateTemplate({
        title: 'Password Updated Successfully',
        intro:
          'Hello {{{USER_NAME}}}, your account password has been changed successfully.',
        detailsHtml:
          '<p><strong>Time:</strong> {{{RESET_TIME}}}</p><p><strong>IP Address:</strong> {{{IP_ADDRESS}}}</p><p><strong>Device:</strong> {{{USER_AGENT}}}</p>',
        note: 'If this activity was not performed by you, please contact JOOAV support immediately at support@jooav.com.',
      }),
      variables: [
        { key: 'USER_NAME', type: 'string', fallbackValue: 'User' },
        { key: 'RESET_TIME', type: 'string', fallbackValue: 'Unknown' },
        { key: 'IP_ADDRESS', type: 'string', fallbackValue: 'Unknown' },
        { key: 'USER_AGENT', type: 'string', fallbackValue: 'Unknown' },
      ],
    };
  }

  private createAccountCreatedInviteTemplate(): TemplateDefinition {
    return {
      name: 'Account Created Invite Template',
      alias: EMAIL_TEMPLATES.ACCOUNT_CREATED_INVITE,
      subject: 'Your JOOAV ERP Account is Ready',
      html: this.buildCorporateTemplate({
        title: 'Account Provisioned',
        intro:
          'Hello {{{USER_NAME}}}, an account has been created for you on JOOAV ERP. Please complete your secure setup to begin.',
        ctaLabel: 'Set Password',
        ctaUrl: '{{{RESET_LINK}}}',
        note: 'This setup link expires in {{{EXPIRY_TIME}}}.',
      }),
      variables: [
        { key: 'USER_NAME', type: 'string', fallbackValue: 'User' },
        { key: 'RESET_LINK', type: 'string', fallbackValue: '#' },
        { key: 'EXPIRY_TIME', type: 'string', fallbackValue: '72 hours' },
      ],
    };
  }

  private createPaymentInitiatedTemplate(): TemplateDefinition {
    return {
      name: 'Payment Initiated Template',
      alias: EMAIL_TEMPLATES.PAYMENT_INITIATED,
      subject: 'Payment Initiated for Order {{{ORDER_NUMBER}}}',
      html: this.buildCorporateTemplate({
        title: 'Payment Initiated',
        intro:
          'Your order has been prepared for payment. Please complete payment before expiry to proceed with fulfillment.',
        detailsHtml:
          '<p><strong>Order Number:</strong> {{{ORDER_NUMBER}}}</p><p><strong>Total Amount:</strong> ₦{{{ORDER_TOTAL}}}</p><p><strong>Date:</strong> {{{ORDER_DATE}}}</p>',
        ctaLabel: 'View Payment Details',
        ctaUrl: '{{{VIEW_ORDER_URL}}}',
      }),
      variables: [
        { key: 'ORDER_NUMBER', type: 'string', fallbackValue: 'ORD-001' },
        { key: 'ORDER_TOTAL', type: 'string', fallbackValue: '0' },
        { key: 'ORDER_DATE', type: 'string', fallbackValue: 'Today' },
        { key: 'VIEW_ORDER_URL', type: 'string', fallbackValue: '#' },
      ],
    };
  }

  private createPaymentFailedTemplate(): TemplateDefinition {
    return {
      name: 'Payment Failed Template',
      alias: EMAIL_TEMPLATES.PAYMENT_FAILED,
      subject: 'Payment Failed for Order {{{ORDER_NUMBER}}}',
      html: this.buildCorporateTemplate({
        title: 'Payment Could Not Be Processed',
        intro:
          'A payment attempt for your order was not successful. Please review and retry at your earliest convenience.',
        detailsHtml:
          '<p><strong>Order Number:</strong> {{{ORDER_NUMBER}}}</p><p><strong>Total Amount:</strong> ₦{{{ORDER_TOTAL}}}</p><p><strong>Reason:</strong> {{{REASON}}}</p>',
        ctaLabel: 'Retry Payment',
        ctaUrl: '{{{VIEW_ORDER_URL}}}',
      }),
      variables: [
        { key: 'ORDER_NUMBER', type: 'string', fallbackValue: 'ORD-001' },
        { key: 'ORDER_TOTAL', type: 'string', fallbackValue: '0' },
        {
          key: 'REASON',
          type: 'string',
          fallbackValue: 'Payment could not be processed',
        },
        { key: 'VIEW_ORDER_URL', type: 'string', fallbackValue: '#' },
      ],
    };
  }

  private createOrderReassignedTemplate(): TemplateDefinition {
    return {
      name: 'Order Reassigned Template',
      alias: EMAIL_TEMPLATES.ORDER_REASSIGNED,
      subject: 'Order Reassignment {{{ORDER_NUMBER}}}',
      html: this.buildCorporateTemplate({
        title: 'Order Assignment Update',
        intro:
          'An order has been reassigned for operational continuity. Please review details and proceed accordingly.',
        detailsHtml:
          '<p><strong>Order Number:</strong> {{{ORDER_NUMBER}}}</p><p><strong>Wholesaler:</strong> {{{WHOLESALER_NAME}}}</p><p><strong>Reassigned to:</strong> {{{OFFICER_NAME}}}</p><p><strong>Total Amount:</strong> ₦{{{ORDER_TOTAL}}}</p>',
        ctaLabel: 'Open Assignment',
        ctaUrl: '{{{ASSIGNMENT_URL}}}',
      }),
      variables: [
        { key: 'OFFICER_NAME', type: 'string', fallbackValue: 'Officer' },
        { key: 'ORDER_NUMBER', type: 'string', fallbackValue: 'ORD-001' },
        { key: 'WHOLESALER_NAME', type: 'string', fallbackValue: 'Wholesaler' },
        { key: 'ORDER_TOTAL', type: 'string', fallbackValue: '0' },
        { key: 'ITEMS_COUNT', type: 'number', fallbackValue: 0 },
        { key: 'ASSIGNMENT_URL', type: 'string', fallbackValue: '#' },
      ],
    };
  }

  private createAssignmentRejectedTemplate(): TemplateDefinition {
    return {
      name: 'Assignment Rejected Template',
      alias: EMAIL_TEMPLATES.ASSIGNMENT_REJECTED,
      subject: 'Assignment Rejected {{{ORDER_NUMBER}}}',
      html: this.buildCorporateTemplate({
        title: 'Assignment Rejected',
        intro:
          'A procurement officer has rejected an assignment. Administrative review is required, however the order will be auto-reassigned.',
        detailsHtml:
          '<p><strong>Order Number:</strong> {{{ORDER_NUMBER}}}</p><p><strong>Officer:</strong> {{{OFFICER_NAME}}}</p>',
        ctaLabel: 'Review Order',
        ctaUrl: '{{{ADMIN_ORDER_URL}}}',
      }),
      variables: [
        { key: 'ORDER_NUMBER', type: 'string', fallbackValue: 'ORD-001' },
        { key: 'OFFICER_NAME', type: 'string', fallbackValue: 'Officer' },
        { key: 'REASON', type: 'string', fallbackValue: 'No reason provided' },
        { key: 'ADMIN_ORDER_URL', type: 'string', fallbackValue: '#' },
      ],
    };
  }

  private createOrderCancelledTemplate(): TemplateDefinition {
    return {
      name: 'Order Cancelled Template',
      alias: EMAIL_TEMPLATES.ORDER_CANCELLED,
      subject: 'Order Cancelled {{{ORDER_NUMBER}}}',
      html: this.buildCorporateTemplate({
        title: 'Order Cancelled',
        intro:
          'An order has been cancelled. Please review the record for operational and reporting alignment.',
        detailsHtml:
          '<p><strong>Order Number:</strong> {{{ORDER_NUMBER}}}</p><p><strong>Total Amount:</strong> ₦{{{ORDER_TOTAL}}}</p><p><strong>Cancelled By:</strong> {{{CANCELLED_BY}}}</p>',
        ctaLabel: 'View Order',
        ctaUrl: '{{{VIEW_ORDER_URL}}}',
      }),
      variables: [
        { key: 'ORDER_NUMBER', type: 'string', fallbackValue: 'ORD-001' },
        { key: 'ORDER_TOTAL', type: 'string', fallbackValue: '0' },
        { key: 'CANCELLED_BY', type: 'string', fallbackValue: 'System' },
        { key: 'VIEW_ORDER_URL', type: 'string', fallbackValue: '#' },
      ],
    };
  }

  private createRoleUpdatedTemplate(): TemplateDefinition {
    return {
      name: 'Role Updated Template',
      alias: EMAIL_TEMPLATES.ROLE_UPDATED,
      subject: 'User Role Updated - JOOAV ERP',
      html: this.buildCorporateTemplate({
        title: 'Role Assignment Updated',
        intro:
          'This is to formally notify you that a role update has been applied within JOOAV ERP.',
        detailsHtml:
          '<p><strong>User:</strong> {{{USER_NAME}}}</p><p><strong>Previous Role:</strong> {{{OLD_ROLE}}}</p><p><strong>New Role:</strong> {{{NEW_ROLE}}}</p>',
      }),
      variables: [
        { key: 'USER_NAME', type: 'string', fallbackValue: 'User' },
        { key: 'OLD_ROLE', type: 'string', fallbackValue: 'N/A' },
        { key: 'NEW_ROLE', type: 'string', fallbackValue: 'N/A' },
      ],
    };
  }

  private createAccountDeactivatedTemplate(): TemplateDefinition {
    return {
      name: 'Account Deactivated Template',
      alias: EMAIL_TEMPLATES.ACCOUNT_DEACTIVATED,
      subject: 'Account Status Update - JOOAV ERP',
      html: this.buildCorporateTemplate({
        title: 'Account Deactivated',
        intro:
          'Please be informed that the account below has been deactivated in JOOAV ERP.',
        detailsHtml:
          '<p><strong>User:</strong> {{{USER_NAME}}}</p><p><strong>Reason:</strong> {{{REASON}}}</p>',
      }),
      variables: [
        { key: 'USER_NAME', type: 'string', fallbackValue: 'User' },
        {
          key: 'REASON',
          type: 'string',
          fallbackValue: 'Administrative action',
        },
      ],
    };
  }

  private createOutOfStockReportOpenedTemplate(): TemplateDefinition {
    return {
      name: 'Out Of Stock Report Opened Template',
      alias: EMAIL_TEMPLATES.OUT_OF_STOCK_REPORT_OPENED,
      subject: 'Out-of-Stock Report Opened {{{REPORT_ID}}}',
      html: this.buildCorporateTemplate({
        title: 'Out-of-Stock Report Opened',
        intro:
          'An out-of-stock report has been submitted and requires administrative review.',
        detailsHtml:
          '<p><strong>Report ID:</strong> {{{REPORT_ID}}}</p><p><strong>Wholesaler:</strong> {{{WHOLESALER_NAME}}}</p><p><strong>Items Affected:</strong> {{{ITEM_COUNT}}}</p>',
        ctaLabel: 'Review Report',
        ctaUrl: '{{{ADMIN_REPORT_URL}}}',
      }),
      variables: [
        { key: 'REPORT_ID', type: 'string', fallbackValue: 'REP-001' },
        {
          key: 'WHOLESALER_NAME',
          type: 'string',
          fallbackValue: 'Wholesaler',
        },
        { key: 'ITEM_COUNT', type: 'number', fallbackValue: 0 },
        { key: 'ADMIN_REPORT_URL', type: 'string', fallbackValue: '#' },
      ],
    };
  }
}
