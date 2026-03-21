import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { Resend } from 'resend';
import {
  EmailRequest,
  BatchEmailRequest,
  QueueEmailRequest,
  EmailResponse,
  BatchEmailResponse,
  TemplateEmailRequest,
} from '../interfaces/email.interface';
import { EmailConfig } from '../../../config/email.config';
import { EmailPriority } from '../types/email.types';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend;
  private readonly emailConfig: EmailConfig;

  constructor(
    private readonly configService: ConfigService,
    @InjectQueue('email') private readonly emailQueue: Queue,
  ) {
    this.emailConfig = this.configService.get<EmailConfig>('email')!;
    this.resend = new Resend(this.emailConfig.apiKey);
  }

  /**
   * Filter out undefined values from template variables
   */
  private filterUndefinedValues(
    variables: Record<string, string | number | undefined>,
  ): Record<string, string | number> {
    const filtered: Record<string, string | number> = {};
    for (const [key, value] of Object.entries(variables)) {
      if (value !== undefined) {
        filtered[key] = value;
      }
    }
    return filtered;
  }

  /**
   * Send single email with template (synchronous)
   */
  async sendTemplateEmail(
    request: TemplateEmailRequest,
  ): Promise<EmailResponse> {
    if (!this.emailConfig.enabled) {
      this.logger.warn('Email service is disabled');
      return { success: false, error: 'Email service is disabled' };
    }

    try {
      const response = await this.resend.emails.send({
        from: request.from || this.getDefaultSender(),
        to: request.to,
        cc: request.cc,
        bcc: request.bcc,
        replyTo: request.replyTo,
        template: {
          id: request.templateAlias,
          variables: this.filterUndefinedValues(request.variables),
        },
        headers: request.options?.headers,
        tags: request.options?.tags,
      });

      this.logger.log(
        `Email sent successfully: ${request.templateAlias} to ${Array.isArray(request.to) ? request.to.join(', ') : request.to}`,
      );
      await this.logEmailSent(request, response);

      return { success: true, messageId: response.data?.id };
    } catch (error) {
      this.logger.error(`Failed to send email: ${error.message}`, error.stack);
      await this.handleEmailError(request, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send batch emails (synchronous)
   */
  async sendBatchEmails(
    requests: BatchEmailRequest[],
  ): Promise<BatchEmailResponse> {
    if (!this.emailConfig.enabled) {
      this.logger.warn('Email service is disabled');
      return { success: false, errors: ['Email service is disabled'] };
    }

    // Split into chunks of 100 (Resend's batch limit)
    const chunks = this.chunkArray(requests, 100);
    const allMessageIds: string[] = [];
    const allErrors: string[] = [];

    for (const chunk of chunks) {
      try {
        const batchPayload = chunk.map((req) => ({
          from: req.from || this.getDefaultSender(),
          to: req.to,
          cc: req.cc,
          bcc: req.bcc,
          replyTo: req.replyTo,
          template: {
            id: req.templateAlias,
            variables: this.filterUndefinedValues(req.variables),
          },
        }));

        const response = await this.resend.batch.send(batchPayload);
        const messageIds = Array.isArray(response.data)
          ? response.data.map((r) => r.id)
          : [];
        allMessageIds.push(...messageIds);

        this.logger.log(
          `Batch emails sent successfully: ${chunk.length} emails`,
        );
        await this.logBatchEmailSent(chunk, response);
      } catch (error) {
        this.logger.error(
          `Failed to send batch emails: ${error.message}`,
          error.stack,
        );
        allErrors.push(error.message);
        await this.handleBatchEmailError(chunk, error);
      }
    }

    return {
      success: allErrors.length === 0,
      messageIds: allMessageIds.length > 0 ? allMessageIds : undefined,
      errors: allErrors.length > 0 ? allErrors : undefined,
    };
  }

  /**
   * Queue email for async processing
   */
  async queueEmail(request: QueueEmailRequest): Promise<void> {
    if (!this.emailConfig.enabled) {
      this.logger.warn('Email service is disabled - email not queued');
      return;
    }

    await this.emailQueue.add('send-template-email', request, {
      priority: this.getPriority(request.priority || EmailPriority.NORMAL),
      attempts: request.retries || 3,
      backoff: { type: 'exponential', delay: 2000 },
      delay: request.delay,
      removeOnComplete: 100,
      removeOnFail: 50,
    });

    this.logger.log(
      `Email queued: ${request.templateAlias} to ${Array.isArray(request.to) ? request.to.join(', ') : request.to}`,
    );
  }

  /**
   * Queue batch emails for async processing
   */
  async queueBatchEmails(
    requests: BatchEmailRequest[],
    priority: EmailPriority = EmailPriority.NORMAL,
  ): Promise<void> {
    if (!this.emailConfig.enabled) {
      this.logger.warn('Email service is disabled - batch emails not queued');
      return;
    }

    // Split into chunks for processing
    const chunks = this.chunkArray(requests, 100);

    for (const chunk of chunks) {
      await this.emailQueue.add(
        'send-batch-emails',
        { requests: chunk, priority },
        {
          priority: this.getPriority(priority),
          attempts: 2,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: 50,
          removeOnFail: 25,
        },
      );
    }

    this.logger.log(
      `Batch emails queued: ${requests.length} emails in ${chunks.length} chunks`,
    );
  }

  /**
   * Get default sender
   */
  private getDefaultSender(): string {
    return `${this.emailConfig.fromName} <${this.emailConfig.fromAddress}>`;
  }

  /**
   * Get priority value for Bull queue
   */
  private getPriority(priority: EmailPriority): number {
    switch (priority) {
      case EmailPriority.HIGH:
        return 10;
      case EmailPriority.NORMAL:
        return 5;
      case EmailPriority.LOW:
        return 1;
      default:
        return 5;
    }
  }

  /**
   * Split array into chunks
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Log successful email send (placeholder for future implementation)
   */
  private async logEmailSent(
    request: TemplateEmailRequest,
    response: any,
  ): Promise<void> {
    // TODO: Implement email logging to database
    this.logger.debug(
      `Email logged: ${JSON.stringify({ template: request.templateAlias, messageId: response.data?.id })}`,
    );
  }

  /**
   * Log successful batch email send (placeholder for future implementation)
   */
  private async logBatchEmailSent(
    requests: BatchEmailRequest[],
    response: any,
  ): Promise<void> {
    // TODO: Implement batch email logging to database
    this.logger.debug(`Batch emails logged: ${requests.length} emails`);
  }

  /**
   * Handle email error (placeholder for future implementation)
   */
  private async handleEmailError(
    request: TemplateEmailRequest,
    error: any,
  ): Promise<void> {
    // TODO: Implement error handling and logging
    this.logger.error(
      `Email error handled for template: ${request.templateAlias}`,
    );
  }

  /**
   * Handle batch email error (placeholder for future implementation)
   */
  private async handleBatchEmailError(
    requests: BatchEmailRequest[],
    error: any,
  ): Promise<void> {
    // TODO: Implement batch error handling and logging
    this.logger.error(
      `Batch email error handled for ${requests.length} emails`,
    );
  }
}
