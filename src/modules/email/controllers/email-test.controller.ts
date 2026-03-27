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
import {
  EMAIL_TEMPLATES,
  TEMPLATE_REQUIRED_VARIABLES,
} from '../types/email.types';
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
  @IsOptional()
  @IsString()
  subject?: string;

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

        const requiredVariables =
          TEMPLATE_REQUIRED_VARIABLES[templateAlias] || [];
        const providedVariables = templateVariables;
        const missingVariables = requiredVariables.filter((key) => {
          const value = providedVariables[key];
          return (
            value === undefined ||
            value === null ||
            (typeof value === 'string' && value.trim().length === 0)
          );
        });

        if (missingVariables.length > 0) {
          return {
            success: false,
            message: `Missing required template variables for ${templateAlias}: ${missingVariables.join(', ')}`,
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
        if (!subject) {
          return {
            success: false,
            message: 'Subject is required when type is "custom"',
          };
        }

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
    const templates = Object.values(EMAIL_TEMPLATES).map((alias) => {
      const requiredVariables = TEMPLATE_REQUIRED_VARIABLES[alias] || [];

      return {
        alias,
        name: alias
          .split('-')
          .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
          .join(' '),
        description: `Template for ${alias.replace(/-/g, ' ')}`,
        variables: requiredVariables.map((key) => ({
          key,
          type: /COUNT|ITEMS|TOTAL|AMOUNT/i.test(key)
            ? 'number|string'
            : 'string',
          description: `Required variable: ${key}`,
          example:
            key.includes('URL') || key.includes('LINK')
              ? 'https://app.jooav.com/example'
              : 'Sample Value',
        })),
      };
    });

    return { templates };
  }
}
