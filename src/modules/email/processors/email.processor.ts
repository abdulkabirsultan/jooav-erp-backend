import {
  Processor,
  Process,
  OnQueueActive,
  OnQueueCompleted,
  OnQueueFailed,
  OnQueueError,
  OnQueueWaiting,
} from '@nestjs/bull';
import { Logger, OnModuleInit } from '@nestjs/common';
import type { Job } from 'bull';
import { EmailService } from '../services/email.service';
import {
  QueueEmailRequest,
  BatchEmailRequest,
} from '../interfaces/email.interface';
import { EmailPriority } from '../types/email.types';

@Processor('email')
export class EmailProcessor implements OnModuleInit {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(private readonly emailService: EmailService) {
    this.logger.log('🚀 EmailProcessor instantiated - ready to process jobs');
  }

  onModuleInit() {
    this.logger.log('✅ EmailProcessor module initialized and ready');
    this.logger.log('📧 Listening for jobs on queue: "email"');
    this.logger.log(
      '📋 Registered job handlers: send-template-email, send-batch-emails',
    );
  }

  @OnQueueWaiting()
  onWaiting(jobId: number) {
    this.logger.log(`⏳ Job ${jobId} is waiting in queue`);
  }

  @OnQueueActive()
  onActive(job: Job) {
    this.logger.log(
      `🔄 Job ${job.id} (${job.name}) is now active - processing started`,
    );
  }

  @OnQueueCompleted()
  onCompleted(job: Job, result: any) {
    this.logger.log(`✅ Job ${job.id} (${job.name}) completed successfully`);
  }

  @OnQueueFailed()
  onFailed(job: Job, error: Error) {
    this.logger.error(
      `❌ Job ${job.id} (${job.name}) failed: ${error.message}`,
      error.stack,
    );
  }

  @OnQueueError()
  onError(error: Error) {
    this.logger.error(`❌ Queue error: ${error.message}`, error.stack);
  }

  @Process({ name: 'send-template-email', concurrency: 2 })
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

  @Process({ name: 'send-batch-emails', concurrency: 1 })
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
