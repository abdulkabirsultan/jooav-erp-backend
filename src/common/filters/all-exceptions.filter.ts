import {
  ExceptionFilter,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { Request, Response } from 'express';
import { SentryExceptionCaptured } from '@sentry/nestjs';
import * as Sentry from '@sentry/nestjs';
import { ErrorResponse } from '../dto/base-response.dto';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  @SentryExceptionCaptured()
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: number;
    let message: string;
    let code: string;
    let errors: any[] | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object') {
        const responseObj = exceptionResponse as any;
        message = responseObj.message || exception.message;
        errors = Array.isArray(responseObj.message)
          ? responseObj.message
          : undefined;
        code = responseObj.error || 'HTTP_EXCEPTION';
      } else {
        message = exceptionResponse;
        code = 'HTTP_EXCEPTION';
      }
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Internal server error';
      code = 'INTERNAL_SERVER_ERROR';

      // Log unexpected errors
      this.logger.error(
        `Unexpected error: ${exception}`,
        exception instanceof Error ? exception.stack : 'No stack trace',
        `${request.method} ${request.url}`,
      );
    }

    // Add Sentry context for better error tracking
    Sentry.withScope((scope) => {
      scope.setTag('component', 'error-filter');
      scope.setContext('http', {
        method: request.method,
        url: request.url,
        statusCode: status,
        userAgent: request.get('User-Agent'),
        ip: request.ip,
      });

      if (status >= 500) {
        // Only capture server errors, not client errors (4xx)
        scope.setLevel('error');
        if (exception instanceof Error) {
          Sentry.captureException(exception);
        } else {
          Sentry.captureMessage(
            `Unhandled exception: ${String(exception)}`,
            'error',
          );
        }
      }
    });

    const errorResponse = new ErrorResponse(message, code, errors);

    // Log error details
    this.logger.error(
      `${request.method} ${request.url} - ${status} - ${message}`,
      JSON.stringify({
        method: request.method,
        url: request.url,
        statusCode: status,
        message,
        code,
        errors,
        userAgent: request.get('User-Agent'),
        ip: request.ip,
      }),
    );

    response.status(status).json(errorResponse);
  }
}
