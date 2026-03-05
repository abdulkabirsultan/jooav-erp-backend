import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request } from 'express';

// Extend Express Request to include user property
interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    [key: string]: any;
  };
}

import { AuditService } from '../../modules/audit/audit.service';
import {
  AUDIT_LOG_KEY,
  AuditLogOptions,
} from '../decorators/audit-log.decorator';

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(
    private reflector: Reflector,
    private auditService: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const auditOptions = this.reflector.get<AuditLogOptions>(
      AUDIT_LOG_KEY,
      context.getHandler(),
    );

    if (!auditOptions) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const { action, resource, includeRequestBody, includeResponseBody } =
      auditOptions;

    // Extract user ID from request
    const userId = request.user?.id;

    const auditData = {
      action,
      resource,
      userId,
      ipAddress: request.ip,
      userAgent: request.get('User-Agent'),
      metadata: {
        method: request.method,
        url: request.url,
        params: request.params,
        query: request.query,
        ...(includeRequestBody && request.body
          ? { requestBody: request.body }
          : {}),
      },
    };

    return next.handle().pipe(
      tap({
        next: (data) => {
          // Log successful operation
          this.auditService.createAuditLog({
            ...auditData,
            metadata: {
              ...auditData.metadata,
              status: 'SUCCESS',
              ...(includeResponseBody && data ? { responseBody: data } : {}),
            },
          });
        },
        error: (error) => {
          // Log failed operation
          this.auditService.createAuditLog({
            ...auditData,
            metadata: {
              ...auditData.metadata,
              status: 'ERROR',
              error: error.message,
            },
          });
        },
      }),
    );
  }
}
