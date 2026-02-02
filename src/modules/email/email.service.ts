import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import type { EmailConfig } from '../../config/email.config';

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: Array<{
    filename: string;
    content: string | Buffer;
    contentType?: string;
  }>;
}

export interface EmailTemplate {
  subject: string;
  html: string;
  text?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend | null = null;
  private readonly emailConfig: EmailConfig;

  constructor(private configService: ConfigService) {
    this.emailConfig = this.configService.get<EmailConfig>('email') || {
      enabled: false,
      apiKey: '',
      fromEmail: 'noreply@jooav.com',
      fromName: 'JOOAV ERP',
      baseUrl: 'http://localhost:3000',
    };

    if (this.emailConfig.enabled && this.emailConfig.apiKey) {
      this.resend = new Resend(this.emailConfig.apiKey);
      this.logger.log('Email service initialized with Resend');
    } else {
      this.logger.warn('Email service disabled or missing API key');
    }
  }

  /**
   * Send an email using Resend
   */
  async sendEmail(options: EmailOptions): Promise<boolean> {
    if (!this.emailConfig.enabled || !this.resend) {
      this.logger.warn('Email service is disabled');
      return false;
    }

    try {
      const result = await this.resend.emails.send({
        from: `${this.emailConfig.fromName} <${this.emailConfig.fromEmail}>`,
        to: Array.isArray(options.to) ? options.to : [options.to],
        subject: options.subject,
        html: options.html,
        text: options.text,
        attachments: options.attachments,
      });

      if (result.error) {
        this.logger.error('Failed to send email:', result.error);
        return false;
      }

      this.logger.log(`Email sent successfully with ID: ${result.data?.id}`);
      return true;
    } catch (error) {
      this.logger.error('Error sending email:', error);
      return false;
    }
  }

  /**
   * Send a templated email
   */
  async sendTemplatedEmail(
    to: string | string[],
    templateName: string,
    variables: Record<string, any> = {},
  ): Promise<boolean> {
    const template = await this.getTemplate(templateName, variables);
    if (!template) {
      this.logger.error(`Template not found: ${templateName}`);
      return false;
    }

    return this.sendEmail({
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  /**
   * Get email template (to be extended with template engine)
   */
  private async getTemplate(
    templateName: string,
    variables: Record<string, any>,
  ): Promise<EmailTemplate | null> {
    // This can be extended to use a template engine like Handlebars
    const templates: Record<
      string,
      (vars: Record<string, any>) => EmailTemplate
    > = {
      welcome: (vars) => ({
        subject: `Welcome to ${this.emailConfig.fromName}!`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1>Welcome ${vars.name || 'User'}!</h1>
            <p>Thank you for joining ${this.emailConfig.fromName}.</p>
            <p>Your account has been successfully created.</p>
          </div>
        `,
        text: `Welcome ${vars.name || 'User'}! Thank you for joining ${this.emailConfig.fromName}.`,
      }),

      passwordReset: (vars) => ({
        subject: 'Password Reset Request',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1>Password Reset Request</h1>
            <p>Hello ${vars.name || 'User'},</p>
            <p>You requested to reset your password. Click the link below to continue:</p>
            <a href="${vars.resetUrl}" style="display: inline-block; padding: 12px 24px; background-color: #007bff; color: white; text-decoration: none; border-radius: 4px;">Reset Password</a>
            <p>If you didn't request this, please ignore this email.</p>
            <p>This link will expire in ${vars.expiresIn || '1 hour'}.</p>
          </div>
        `,
        text: `Hello ${vars.name || 'User'}, you requested to reset your password. Visit: ${vars.resetUrl}`,
      }),

      passwordSetup: (vars) => ({
        subject: `Welcome to ${vars.platformName || 'JOOAV ERP'} - Set Your Password`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1>Welcome to ${vars.platformName || 'JOOAV ERP'}!</h1>
            <p>Hello ${vars.firstName || 'User'},</p>
            <p>Your account has been created by an administrator. To get started, you need to set up your password.</p>
            <p>Click the link below to set your password:</p>
            <a href="${vars.resetUrl}" style="display: inline-block; padding: 12px 24px; background-color: #28a745; color: white; text-decoration: none; border-radius: 4px;">Set Your Password</a>
            <p>This link will expire in 24 hours for security purposes.</p>
            <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <strong>Next Steps:</strong>
              <ol>
                <li>Click the "Set Your Password" button above</li>
                <li>Create a secure password</li>
                <li>Log in to your account and complete your profile</li>
              </ol>
            </div>
            <p>If you have any questions, please contact your administrator.</p>
          </div>
        `,
        text: `Welcome to ${vars.platformName || 'JOOAV ERP'}! Your account has been created. Set your password at: ${vars.resetUrl}`,
      }),

      loginNotification: (vars) => ({
        subject: 'New Login to Your Account',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1>🔐 Login Alert</h1>
            <p>Hello ${vars.name || 'User'},</p>
            <p>We detected a new login to your account:</p>
            <ul>
              <li><strong>Time:</strong> ${vars.loginTime || 'Unknown'}</li>
              <li><strong>IP Address:</strong> ${vars.ipAddress || 'Unknown'}</li>
              <li><strong>Device:</strong> ${vars.userAgent || 'Unknown'}</li>
            </ul>
            <p>If this wasn't you, please secure your account immediately.</p>
          </div>
        `,
        text: `New login detected at ${vars.loginTime} from ${vars.ipAddress}`,
      }),

      passwordChanged: (vars) => ({
        subject: 'Password Changed Successfully',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1>🔒 Password Changed</h1>
            <p>Hello ${vars.name || 'User'},</p>
            <p>Your password has been successfully changed.</p>
            <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <strong>Change Details:</strong>
              <ul style="margin: 10px 0;">
                <li><strong>Time:</strong> ${vars.changeTime || 'Unknown'}</li>
                <li><strong>IP Address:</strong> ${vars.ipAddress || 'Unknown'}</li>
                <li><strong>Device:</strong> ${vars.userAgent || 'Unknown'}</li>
              </ul>
            </div>
            <p>If you didn't make this change, please contact our support team immediately.</p>
            <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <strong>Security Note:</strong> All your active sessions have been logged out for security. You'll need to log in again with your new password.
            </div>
          </div>
        `,
        text: `Your password has been successfully changed at ${vars.changeTime}. All sessions have been logged out for security.`,
      }),

      passwordResetSuccess: (vars) => ({
        subject: 'Password Reset Successful',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1>✅ Password Reset Successful</h1>
            <p>Hello ${vars.name || 'User'},</p>
            <p>Your password has been successfully reset using the password reset link.</p>
            <div style="background-color: #d4edda; border: 1px solid #c3e6cb; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <strong>Reset Details:</strong>
              <ul style="margin: 10px 0;">
                <li><strong>Time:</strong> ${vars.resetTime || 'Unknown'}</li>
                <li><strong>IP Address:</strong> ${vars.ipAddress || 'Unknown'}</li>
                <li><strong>Device:</strong> ${vars.userAgent || 'Unknown'}</li>
              </ul>
            </div>
            <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <strong>Security Notice:</strong> All your active sessions and tokens have been invalidated for security. You'll need to log in again with your new password.
            </div>
            <p>If you didn't request this password reset, please contact our support team immediately.</p>
            <div style="margin: 30px 0; padding: 20px; background-color: #f8f9fa; border-radius: 5px;">
              <p style="margin: 0;"><strong>Next Steps:</strong></p>
              <p style="margin: 5px 0 0 0;">You can now log in to your account using your new password.</p>
            </div>
          </div>
        `,
        text: `Your password has been successfully reset at ${vars.resetTime}. All sessions and tokens have been invalidated for security. You can now log in with your new password.`,
      }),
    };

    const templateFn = templates[templateName];
    return templateFn ? templateFn(variables) : null;
  }

  /**
   * Validate email configuration
   */
  isConfigured(): boolean {
    return this.emailConfig.enabled && !!this.resend;
  }

  /**
   * Get email configuration status
   */
  getStatus(): { enabled: boolean; configured: boolean; fromEmail: string } {
    return {
      enabled: this.emailConfig.enabled,
      configured: this.isConfigured(),
      fromEmail: this.emailConfig.fromEmail,
    };
  }
}
