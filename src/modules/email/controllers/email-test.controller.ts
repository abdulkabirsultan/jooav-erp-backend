import { Body, Controller, Post } from '@nestjs/common';
import {
  ApiOperation,
  ApiTags,
  ApiBody,
  ApiResponse,
  ApiProperty,
} from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  IsOptional,
  IsEnum,
  IsObject,
} from 'class-validator';
import { EmailService } from '../services/email.service';
import { EMAIL_TEMPLATES } from '../types/email.types';
import type { EmailTemplateAlias } from '../types/email.types';

// DTOs for the test endpoint
export class TestEmailDto {
  @ApiProperty({
    description: 'Recipient email address',
    example: 'test@example.com',
  })
  @IsEmail()
  to: string;

  @ApiProperty({
    description: 'Email subject line',
    example: 'Test Email Subject',
  })
  @IsString()
  subject: string;

  @ApiProperty({
    description: 'Email type - either template or custom',
    enum: ['template', 'custom'],
    example: 'custom',
  })
  @IsEnum(['template', 'custom'])
  type: 'template' | 'custom';

  @ApiProperty({
    description: 'Template alias (required if type is template)',
    enum: Object.values(EMAIL_TEMPLATES),
    example: 'welcome',
  })
  @IsOptional()
  @IsEnum(Object.values(EMAIL_TEMPLATES))
  templateAlias?: EmailTemplateAlias;

  @ApiProperty({
    description: 'Template variables (required if type is template)',
    example: {
      USER_NAME: 'John Doe',
      LOGIN_URL: 'https://app.jooav.com/login',
    },
  })
  @IsOptional()
  @IsObject()
  templateVariables?: Record<string, string | number>;

  @ApiProperty({
    description: 'Custom email body HTML (required if type is custom)',
    example: '<h1>Hello!</h1><p>This is a test email.</p>',
  })
  @IsOptional()
  @IsString()
  customBody?: string;

  @ApiProperty({
    description:
      'Sender email address (optional, uses default if not provided)',
    example: 'noreply@jooav.com',
  })
  @IsOptional()
  @IsEmail()
  from?: string;
}

export class TestEmailResponseDto {
  @ApiProperty({ description: 'Whether the email was sent successfully' })
  success: boolean;

  @ApiProperty({ description: 'Success or error message' })
  message: string;

  @ApiProperty({ description: 'Email message ID (if successful)' })
  messageId?: string;

  @ApiProperty({ description: 'Email details that were sent' })
  details?: {
    to: string;
    subject: string;
    type: string;
    templateAlias?: string;
  };
}

@ApiTags('Email Testing')
@Controller('email-test')
export class EmailTestController {
  constructor(private readonly emailService: EmailService) {}

  @Post('send')
  @ApiOperation({
    summary: 'Send test email',
    description: `
      Send a test email using either a predefined template or custom content.
      This endpoint is designed for testing purposes and doesn't require authentication.
      
      **Template Mode**: Use predefined email templates with dynamic variables
      **Custom Mode**: Send emails with custom HTML content
      
      Available templates: ${Object.values(EMAIL_TEMPLATES).join(', ')}
    `,
  })
  @ApiBody({ type: TestEmailDto })
  @ApiResponse({
    status: 200,
    description: 'Email sent successfully',
    type: TestEmailResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request data',
  })
  @ApiResponse({
    status: 500,
    description: 'Failed to send email',
  })
  async sendTestEmail(
    @Body() testEmailDto: TestEmailDto,
  ): Promise<TestEmailResponseDto> {
    const {
      to,
      subject,
      type,
      templateAlias,
      templateVariables,
      customBody,
      from,
    } = testEmailDto;

    try {
      let result;

      if (type === 'template') {
        if (!templateAlias) {
          return {
            success: false,
            message: 'Template alias is required when type is "template"',
          };
        }

        if (!templateVariables) {
          return {
            success: false,
            message: 'Template variables are required when type is "template"',
          };
        }

        // Send template email
        result = await this.emailService.sendTemplateEmail({
          to,
          templateAlias,
          variables: templateVariables,
          from,
        });

        return {
          success: result.success,
          message: result.success
            ? 'Template email sent successfully!'
            : result.error || 'Failed to send template email',
          messageId: result.messageId,
          details: {
            to,
            subject: `Template: ${templateAlias}`,
            type: 'template',
            templateAlias,
          },
        };
      } else if (type === 'custom') {
        if (!customBody) {
          return {
            success: false,
            message: 'Custom body is required when type is "custom"',
          };
        }

        // Send custom email using Resend directly
        const emailConfig = this.emailService['emailConfig'];
        const resend = this.emailService['resend'];

        const emailData = {
          from: from || `${emailConfig.fromName} <${emailConfig.fromAddress}>`,
          to,
          subject,
          html: customBody,
        };

        const response = await resend.emails.send(emailData);

        if (response.error) {
          return {
            success: false,
            message: `Failed to send custom email: ${response.error.message}`,
          };
        }

        return {
          success: true,
          message: 'Custom email sent successfully!',
          messageId: response.data?.id,
          details: {
            to,
            subject,
            type: 'custom',
          },
        };
      }

      return {
        success: false,
        message: 'Invalid email type. Must be "template" or "custom"',
      };
    } catch (error) {
      return {
        success: false,
        message: `Error sending email: ${error.message}`,
      };
    }
  }

  @Post('templates')
  @ApiOperation({
    summary: 'Get available email templates',
    description:
      'Returns a list of all available email templates with their required variables',
  })
  @ApiResponse({
    status: 200,
    description: 'Available email templates',
    schema: {
      type: 'object',
      properties: {
        templates: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              alias: { type: 'string' },
              name: { type: 'string' },
              description: { type: 'string' },
              variables: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    key: { type: 'string' },
                    type: { type: 'string' },
                    description: { type: 'string' },
                    example: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
  })
  async getAvailableTemplates() {
    const templates = [
      {
        alias: EMAIL_TEMPLATES.ORDER_CONFIRMATION,
        name: 'Order Confirmation',
        description: 'Sent when a customer places an order',
        variables: [
          {
            key: 'CUSTOMER_NAME',
            type: 'string',
            description: 'Customer full name',
            example: 'John Doe',
          },
          {
            key: 'ORDER_NUMBER',
            type: 'string',
            description: 'Order reference number',
            example: 'ORD-001',
          },
          {
            key: 'ORDER_DATE',
            type: 'string',
            description: 'Order placement date',
            example: '2024-02-25',
          },
          {
            key: 'ORDER_TOTAL',
            type: 'string',
            description: 'Total order amount',
            example: '25000',
          },
          {
            key: 'ITEMS_COUNT',
            type: 'number',
            description: 'Number of items ordered',
            example: 5,
          },
          {
            key: 'VIEW_ORDER_URL',
            type: 'string',
            description: 'URL to view order details',
            example: 'https://app.jooav.com/orders/ORD-001',
          },
        ],
      },
      {
        alias: EMAIL_TEMPLATES.PASSWORD_RESET,
        name: 'Password Reset',
        description: 'Sent when user requests password reset',
        variables: [
          {
            key: 'USER_NAME',
            type: 'string',
            description: 'User full name',
            example: 'John Doe',
          },
          {
            key: 'RESET_LINK',
            type: 'string',
            description: 'Password reset URL',
            example: 'https://app.jooav.com/reset-password?token=abc123',
          },
          {
            key: 'EXPIRY_TIME',
            type: 'string',
            description: 'Link expiration time',
            example: '24 hours',
          },
        ],
      },
      {
        alias: EMAIL_TEMPLATES.WELCOME,
        name: 'Welcome Email',
        description: 'Sent to new users after registration',
        variables: [
          {
            key: 'USER_NAME',
            type: 'string',
            description: 'User full name',
            example: 'John Doe',
          },
          {
            key: 'LOGIN_URL',
            type: 'string',
            description: 'Application login URL',
            example: 'https://app.jooav.com/login',
          },
        ],
      },
      {
        alias: EMAIL_TEMPLATES.EMAIL_VERIFICATION,
        name: 'Email Verification',
        description: 'Sent to verify email addresses',
        variables: [
          {
            key: 'USER_NAME',
            type: 'string',
            description: 'User full name',
            example: 'John Doe',
          },
          {
            key: 'VERIFICATION_LINK',
            type: 'string',
            description: 'Email verification URL',
            example: 'https://app.jooav.com/verify?token=xyz789',
          },
          {
            key: 'EXPIRY_TIME',
            type: 'string',
            description: 'Link expiration time',
            example: '48 hours',
          },
        ],
      },
      {
        alias: EMAIL_TEMPLATES.ORDER_ASSIGNMENT,
        name: 'Order Assignment',
        description: 'Sent to procurement officers when orders are assigned',
        variables: [
          {
            key: 'OFFICER_NAME',
            type: 'string',
            description: 'Officer full name',
            example: 'Jane Smith',
          },
          {
            key: 'ORDER_NUMBER',
            type: 'string',
            description: 'Order reference number',
            example: 'ORD-001',
          },
          {
            key: 'WHOLESALER_NAME',
            type: 'string',
            description: 'Wholesaler name',
            example: 'ABC Wholesalers',
          },
          {
            key: 'ORDER_TOTAL',
            type: 'string',
            description: 'Total order amount',
            example: '25000',
          },
          {
            key: 'ITEMS_COUNT',
            type: 'number',
            description: 'Number of items',
            example: 5,
          },
          {
            key: 'ASSIGNMENT_URL',
            type: 'string',
            description: 'URL to process order',
            example: 'https://app.jooav.com/assignments/ORD-001',
          },
        ],
      },
      {
        alias: EMAIL_TEMPLATES.ORDER_COMPLETION,
        name: 'Order Completion',
        description: 'Sent when orders are completed',
        variables: [
          {
            key: 'CUSTOMER_NAME',
            type: 'string',
            description: 'Customer full name',
            example: 'John Doe',
          },
          {
            key: 'ORDER_NUMBER',
            type: 'string',
            description: 'Order reference number',
            example: 'ORD-001',
          },
          {
            key: 'ORDER_DATE',
            type: 'string',
            description: 'Order placement date',
            example: '2024-02-25',
          },
          {
            key: 'ORDER_TOTAL',
            type: 'string',
            description: 'Total order amount',
            example: '25000',
          },
          {
            key: 'ITEMS_COUNT',
            type: 'number',
            description: 'Number of items',
            example: 5,
          },
          {
            key: 'VIEW_ORDER_URL',
            type: 'string',
            description: 'URL to view order',
            example: 'https://app.jooav.com/orders/ORD-001',
          },
        ],
      },
      {
        alias: EMAIL_TEMPLATES.ADMIN_NEW_ORDER,
        name: 'Admin New Order Alert',
        description: 'Sent to admins when new orders are placed',
        variables: [
          {
            key: 'ORDER_NUMBER',
            type: 'string',
            description: 'Order reference number',
            example: 'ORD-001',
          },
          {
            key: 'CUSTOMER_NAME',
            type: 'string',
            description: 'Customer full name',
            example: 'John Doe',
          },
          {
            key: 'ORDER_TOTAL',
            type: 'string',
            description: 'Total order amount',
            example: '25000',
          },
          {
            key: 'ADMIN_ORDER_URL',
            type: 'string',
            description: 'Admin panel order URL',
            example: 'https://admin.jooav.com/orders/ORD-001',
          },
        ],
      },
      {
        alias: EMAIL_TEMPLATES.SYSTEM_MAINTENANCE,
        name: 'System Maintenance Notification',
        description: 'Sent during scheduled maintenance',
        variables: [
          {
            key: 'USER_NAME',
            type: 'string',
            description: 'User full name',
            example: 'John Doe',
          },
          {
            key: 'MAINTENANCE_DATE',
            type: 'string',
            description: 'Maintenance date',
            example: '2024-02-26',
          },
          {
            key: 'MAINTENANCE_DURATION',
            type: 'string',
            description: 'Expected duration',
            example: '2 hours',
          },
          {
            key: 'MAINTENANCE_REASON',
            type: 'string',
            description: 'Reason for maintenance',
            example: 'System upgrades',
          },
        ],
      },
    ];

    return { templates };
  }
}
