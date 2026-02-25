import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { EmailService } from '../services/email.service';
import {
  QueueEmailRequest,
  BatchEmailRequest,
} from '../interfaces/email.interface';
import { EmailPriority } from '../types/email.types';

@Processor('email')
export class EmailProcessor {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(private readonly emailService: EmailService) {}

  @Process('send-template-email')
  async handleSingleEmail(job: Job<QueueEmailRequest>) {
    const { data } = job;

    try {
      this.logger.log(
        `Processing email job: ${job.id} - ${data.templateAlias}`,
      );

      const result = await this.emailService.sendTemplateEmail({
        from: data.from,
        to: data.to,
        cc: data.cc,
        bcc: data.bcc,
        replyTo: data.replyTo,
        templateAlias: data.templateAlias,
        variables: data.variables,
        options: data.metadata
          ? { headers: { 'X-Metadata': JSON.stringify(data.metadata) } }
          : undefined,
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to send email');
      }

      this.logger.log(
        `Email job completed successfully: ${job.id} - ${result.messageId}`,
      );
      return result;
    } catch (error) {
      this.logger.error(
        `Email job failed: ${job.id} - ${error.message}`,
        error.stack,
      );
      throw error; // Let Bull handle retries
    }
  }

  @Process('send-batch-emails')
  async handleBatchEmails(
    job: Job<{ requests: BatchEmailRequest[]; priority: EmailPriority }>,
  ) {
    const { requests } = job.data;

    try {
      this.logger.log(
        `Processing batch email job: ${job.id} - ${requests.length} emails`,
      );

      const result = await this.emailService.sendBatchEmails(requests);

      if (!result.success && result.errors?.length) {
        throw new Error(`Batch email failed: ${result.errors.join(', ')}`);
      }

      this.logger.log(
        `Batch email job completed successfully: ${job.id} - ${result.messageIds?.length || 0} sent`,
      );
      return result;
    } catch (error) {
      this.logger.error(
        `Batch email job failed: ${job.id} - ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
