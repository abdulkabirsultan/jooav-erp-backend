import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const { method, url, body, query, params } = request;
    const userAgent = request.get('User-Agent') || '';
    const ip = request.ip;
    const startTime = performance.now();

    // Async logging for incoming request - don't block the request
    setImmediate(() => {
      this.logger.log(`Incoming Request: ${method} ${url}`, {
        method,
        url,
        body: this.sanitizeBody(body),
        query: Object.keys(query || {}).length > 0 ? query : undefined,
        params: Object.keys(params || {}).length > 0 ? params : undefined,
        userAgent: userAgent.substring(0, 100), // Truncate long user agents
        ip,
      });
    });

    return next.handle().pipe(
      tap({
        next: (data) => {
          const duration = performance.now() - startTime;

          // Async logging for successful responses - don't block the response
          setImmediate(() => {
            // Estimate response size without full serialization
            const responseSize = this.estimateResponseSize(data);
            const responseInfo = {
              method,
              url,
              duration: `${duration.toFixed(2)}ms`,
              responseSize: `${responseSize}B`,
              status: 'SUCCESS',
            };

            // Log performance warnings for slow requests
            if (duration > 1000) {
              this.logger.warn(
                `Slow request: ${method} ${url} - ${duration.toFixed(2)}ms`,
                responseInfo,
              );
            } else {
              this.logger.log(
                `Request completed: ${method} ${url} - ${duration.toFixed(2)}ms`,
                responseInfo,
              );
            }
          });
        },
        error: (error) => {
          const duration = performance.now() - startTime;

          // Async logging for errors - don't block error handling
          setImmediate(() => {
            this.logger.error(
              `Request failed: ${method} ${url} - ${duration.toFixed(2)}ms`,
              {
                method,
                url,
                duration: `${duration.toFixed(2)}ms`,
                error: error.message,
                status: 'ERROR',
              },
            );
          });
        },
      }),
    );
  }

  private sanitizeBody(body: any): any {
    if (!body || typeof body !== 'object') return body;

    const sanitized = { ...body };
    const sensitiveFields = [
      'password',
      'token',
      'secret',
      'key',
      'authorization',
      'currentPassword',
      'newPassword',
      'confirmPassword',
    ];

    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    }

    return sanitized;
  }

  /**
   * Estimate response size without expensive JSON.stringify
   */
  private estimateResponseSize(data: any): number {
    if (!data) return 0;

    try {
      if (typeof data === 'string') {
        return data.length;
      }

      if (typeof data === 'object') {
        // Quick size estimation without full serialization
        if (Array.isArray(data)) {
          return data.length * 100; // Rough estimate: 100 bytes per array item
        }

        const keys = Object.keys(data);
        return keys.length * 50; // Rough estimate: 50 bytes per object property
      }

      return JSON.stringify(data).length;
    } catch (error) {
      // Fallback for circular references or other issues
      return 0;
    }
  }
}
