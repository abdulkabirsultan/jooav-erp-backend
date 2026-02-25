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

    const templates = [
      this.createOrderConfirmationTemplate(),
      this.createPasswordResetTemplate(),
      this.createOrderAssignmentTemplate(),
      this.createWelcomeTemplate(),
      this.createEmailVerificationTemplate(),
      this.createOrderCompletionTemplate(),
      this.createAdminNewOrderTemplate(),
      this.createSystemMaintenanceTemplate(),
    ];

    for (const template of templates) {
      await this.deployTemplate(template);
    }

    this.logger.log(
      `Successfully deployed ${templates.length} email templates`,
    );
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

  /**
   * Order confirmation template
   */
  private createOrderConfirmationTemplate(): TemplateDefinition {
    return {
      name: 'Order Confirmation Template',
      alias: EMAIL_TEMPLATES.ORDER_CONFIRMATION,
      subject: 'Order Confirmation #{{{ORDER_NUMBER}}} - JOOAV ERP',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Order Confirmation</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #2563eb; padding-bottom: 20px; }
            .logo { color: #2563eb; font-size: 28px; font-weight: bold; }
            .content { margin: 20px 0; }
            .order-summary { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0; }
            .button { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; text-align: center; }
            .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 14px; color: #6b7280; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">JOOAV ERP</div>
            </div>
            
            <div class="content">
              <h2>Order Confirmed #{{{ORDER_NUMBER}}}</h2>
              <p>Hello {{{CUSTOMER_NAME}}},</p>
              <p>Thank you for your order! We've received your order and it's being processed.</p>
              
              <div class="order-summary">
                <h3>Order Summary</h3>
                <p><strong>Order Number:</strong> {{{ORDER_NUMBER}}}</p>
                <p><strong>Order Date:</strong> {{{ORDER_DATE}}}</p>
                <p><strong>Total Amount:</strong> ₦{{{ORDER_TOTAL}}}</p>
                <p><strong>Items:</strong> {{{ITEMS_COUNT}}} items</p>
              </div>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="{{{VIEW_ORDER_URL}}}" class="button">View Order Details</a>
              </div>
            </div>
            
            <div class="footer">
              <p>If you have any questions, please contact us at support@jooav.com</p>
            </div>
          </div>
        </body>
        </html>
      `,
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
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Password Reset</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #2563eb; padding-bottom: 20px; }
            .logo { color: #2563eb; font-size: 28px; font-weight: bold; }
            .content { margin: 20px 0; }
            .button { display: inline-block; background: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; text-align: center; }
            .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 14px; color: #6b7280; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">JOOAV ERP</div>
            </div>
            
            <div class="content">
              <h2>Reset Your Password</h2>
              <p>Hello {{{USER_NAME}}},</p>
              <p>We received a request to reset your password for your JOOAV ERP account.</p>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="{{{RESET_LINK}}}" class="button">Reset Password</a>
              </div>
              
              <p style="font-size: 14px; color: #6b7280;">
                This link will expire in {{{EXPIRY_TIME}}}. If you didn't request this, please ignore this email.
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
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
      subject: 'New Order Assignment #{{{ORDER_NUMBER}}} - JOOAV ERP',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Order Assignment</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #2563eb; padding-bottom: 20px; }
            .logo { color: #2563eb; font-size: 28px; font-weight: bold; }
            .content { margin: 20px 0; }
            .order-details { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px; margin: 20px 0; }
            .button { display: inline-block; background: #16a34a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; text-align: center; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">JOOAV ERP</div>
            </div>
            
            <div class="content">
              <h2>New Order Assignment</h2>
              <p>Hello {{{OFFICER_NAME}}},</p>
              <p>A new order has been assigned to you for processing.</p>
              
              <div class="order-details">
                <h3 style="margin-top: 0; color: #166534;">Order Details</h3>
                <p><strong>Order Number:</strong> {{{ORDER_NUMBER}}}</p>
                <p><strong>Wholesaler:</strong> {{{WHOLESALER_NAME}}}</p>
                <p><strong>Total Amount:</strong> ₦{{{ORDER_TOTAL}}}</p>
                <p><strong>Items Count:</strong> {{{ITEMS_COUNT}}}</p>
              </div>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="{{{ASSIGNMENT_URL}}}" class="button">Process Order</a>
              </div>
            </div>
          </div>
        </body>
        </html>
      `,
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
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Welcome</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #2563eb; padding-bottom: 20px; }
            .logo { color: #2563eb; font-size: 28px; font-weight: bold; }
            .content { margin: 20px 0; }
            .button { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; text-align: center; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">JOOAV ERP</div>
            </div>
            
            <div class="content">
              <h2>Welcome to JOOAV ERP!</h2>
              <p>Hello {{{USER_NAME}}},</p>
              <p>Welcome to JOOAV ERP! Your account has been successfully created.</p>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="{{{LOGIN_URL}}}" class="button">Get Started</a>
              </div>
            </div>
          </div>
        </body>
        </html>
      `,
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
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Email Verification</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #2563eb; padding-bottom: 20px; }
            .logo { color: #2563eb; font-size: 28px; font-weight: bold; }
            .content { margin: 20px 0; }
            .button { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; text-align: center; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">JOOAV ERP</div>
            </div>
            
            <div class="content">
              <h2>Verify Your Email</h2>
              <p>Hello {{{USER_NAME}}},</p>
              <p>Please verify your email address to complete your account setup.</p>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="{{{VERIFICATION_LINK}}}" class="button">Verify Email</a>
              </div>
              
              <p style="font-size: 14px; color: #6b7280;">
                This link will expire in {{{EXPIRY_TIME}}}.
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
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
      subject: 'Order Completed #{{{ORDER_NUMBER}}} - JOOAV ERP',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Order Completed</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #2563eb; padding-bottom: 20px; }
            .logo { color: #2563eb; font-size: 28px; font-weight: bold; }
            .content { margin: 20px 0; }
            .order-summary { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px; margin: 20px 0; }
            .button { display: inline-block; background: #16a34a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; text-align: center; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">JOOAV ERP</div>
            </div>
            
            <div class="content">
              <h2>Order Completed #{{{ORDER_NUMBER}}}</h2>
              <p>Hello {{{CUSTOMER_NAME}}},</p>
              <p>Great news! Your order has been completed and is ready for pickup/delivery.</p>
              
              <div class="order-summary">
                <h3 style="margin-top: 0; color: #166534;">Completed Order</h3>
                <p><strong>Order Number:</strong> {{{ORDER_NUMBER}}}</p>
                <p><strong>Order Date:</strong> {{{ORDER_DATE}}}</p>
                <p><strong>Total Amount:</strong> ₦{{{ORDER_TOTAL}}}</p>
                <p><strong>Items:</strong> {{{ITEMS_COUNT}}} items</p>
              </div>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="{{{VIEW_ORDER_URL}}}" class="button">View Order Details</a>
              </div>
            </div>
          </div>
        </body>
        </html>
      `,
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
   * Admin new order template
   */
  private createAdminNewOrderTemplate(): TemplateDefinition {
    return {
      name: 'Admin New Order Notification',
      alias: EMAIL_TEMPLATES.ADMIN_NEW_ORDER,
      subject: 'New Order #{{{ORDER_NUMBER}}} - Admin Alert',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>New Order Alert</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #f59e0b; padding-bottom: 20px; }
            .logo { color: #f59e0b; font-size: 28px; font-weight: bold; }
            .content { margin: 20px 0; }
            .order-alert { background: #fffbeb; border: 1px solid #fed7aa; border-radius: 8px; padding: 20px; margin: 20px 0; }
            .button { display: inline-block; background: #f59e0b; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; text-align: center; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">JOOAV ERP - Admin Alert</div>
            </div>
            
            <div class="content">
              <h2>New Order #{{{ORDER_NUMBER}}}</h2>
              <p>A new order has been placed and requires attention.</p>
              
              <div class="order-alert">
                <h3 style="margin-top: 0; color: #d97706;">Order Details</h3>
                <p><strong>Order Number:</strong> {{{ORDER_NUMBER}}}</p>
                <p><strong>Customer:</strong> {{{CUSTOMER_NAME}}}</p>
                <p><strong>Total Amount:</strong> ₦{{{ORDER_TOTAL}}}</p>
              </div>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="{{{ADMIN_ORDER_URL}}}" class="button">View in Admin Panel</a>
              </div>
            </div>
          </div>
        </body>
        </html>
      `,
      variables: [
        { key: 'ORDER_NUMBER', type: 'string', fallbackValue: 'ORD-001' },
        { key: 'CUSTOMER_NAME', type: 'string', fallbackValue: 'Customer' },
        { key: 'ORDER_TOTAL', type: 'string', fallbackValue: '0' },
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
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>System Maintenance</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #dc2626; padding-bottom: 20px; }
            .logo { color: #dc2626; font-size: 28px; font-weight: bold; }
            .content { margin: 20px 0; }
            .maintenance-info { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 20px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">JOOAV ERP</div>
            </div>
            
            <div class="content">
              <h2>Scheduled System Maintenance</h2>
              <p>Hello {{{USER_NAME}}},</p>
              <p>We will be performing scheduled maintenance on our system.</p>
              
              <div class="maintenance-info">
                <h3 style="margin-top: 0; color: #dc2626;">Maintenance Details</h3>
                <p><strong>Date:</strong> {{{MAINTENANCE_DATE}}}</p>
                <p><strong>Duration:</strong> {{{MAINTENANCE_DURATION}}}</p>
                <p><strong>Reason:</strong> {{{MAINTENANCE_REASON}}}</p>
              </div>
              
              <p>We apologize for any inconvenience this may cause.</p>
            </div>
          </div>
        </body>
        </html>
      `,
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
}
