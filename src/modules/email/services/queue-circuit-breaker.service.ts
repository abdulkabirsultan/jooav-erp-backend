import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class QueueCircuitBreakerService {
  private readonly logger = new Logger(QueueCircuitBreakerService.name);
  private readonly failureThreshold = 3;
  private readonly openDurationMs = 60000;
  private failureCount = 0;
  private openUntil = 0;

  async executeWithFallback<T>(
    operation: () => Promise<T>,
    fallback: () => Promise<T>,
    context: string,
  ): Promise<T> {
    if (this.isOpen()) {
      this.logger.warn(
        `Queue circuit is open for ${context}. Using fallback path.`,
      );
      return fallback();
    }

    try {
      const result = await operation();
      this.resetOnSuccess();
      return result;
    } catch (error) {
      if (!this.isRedisQueueError(error)) {
        throw error;
      }

      this.recordFailure(context, error as Error);
      this.logger.warn(
        `Queue operation failed for ${context}. Falling back to direct send.`,
      );
      return fallback();
    }
  }

  private isOpen(): boolean {
    return this.openUntil > Date.now();
  }

  private resetOnSuccess(): void {
    if (this.failureCount > 0 || this.openUntil > 0) {
      this.logger.log('Queue circuit reset after successful operation.');
    }
    this.failureCount = 0;
    this.openUntil = 0;
  }

  private recordFailure(context: string, error: Error): void {
    this.failureCount += 1;
    this.logger.warn(
      `Queue failure ${this.failureCount}/${this.failureThreshold} for ${context}: ${error.message}`,
    );

    if (this.failureCount >= this.failureThreshold) {
      this.openUntil = Date.now() + this.openDurationMs;
      this.failureCount = 0;
      this.logger.error(
        `Queue circuit opened for ${this.openDurationMs / 1000}s due to repeated Redis failures.`,
      );
    }
  }

  private isRedisQueueError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    const msg = error.message.toLowerCase();
    return (
      msg.includes('command timed out') ||
      msg.includes('connection is closed') ||
      msg.includes('max retries per request') ||
      msg.includes('econnrefused') ||
      msg.includes('etimedout') ||
      msg.includes('redis')
    );
  }
}
