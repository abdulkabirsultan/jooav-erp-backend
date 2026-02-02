import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppLogger } from '../../common/utils/logger.service';

export interface AuditLogData {
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  oldData?: any;
  newData?: any;
  ipAddress?: string;
  userAgent?: string;
  metadata?: any;
}

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create an audit log entry in the database
   */
  async createAuditLog(data: AuditLogData): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: data.userId,
          action: data.action,
          resource: data.resource,
          resourceId: data.resourceId,
          oldData: data.oldData ? JSON.stringify(data.oldData) : undefined,
          newData: data.newData ? JSON.stringify(data.newData) : undefined,
          ipAddress: data.ipAddress,
          userAgent: data.userAgent,
        },
      });

      // Also log to Winston for immediate visibility
      AppLogger.info(
        `Audit: ${data.action} on ${data.resource}${data.resourceId ? ` (${data.resourceId})` : ''}`,
        'AuditLog',
        {
          userId: data.userId,
          action: data.action,
          resource: data.resource,
          resourceId: data.resourceId,
          ipAddress: data.ipAddress,
          metadata: data.metadata,
        },
      );
    } catch (error) {
      AppLogger.error(
        `Failed to create audit log: ${error.message}`,
        error.stack,
        'AuditLogService',
        data,
      );
    }
  }

  /**
   * Log user actions
   */
  async logUserAction(
    userId: string,
    action: string,
    resource: string,
    resourceId?: string,
    metadata?: any,
    req?: any,
  ): Promise<void> {
    await this.createAuditLog({
      userId,
      action,
      resource,
      resourceId,
      ipAddress: req?.ip,
      userAgent: req?.get('User-Agent'),
      metadata,
    });
  }

  /**
   * Log data changes (for update operations)
   */
  async logDataChange(
    userId: string,
    action: string,
    resource: string,
    resourceId: string,
    oldData: any,
    newData: any,
    req?: any,
  ): Promise<void> {
    await this.createAuditLog({
      userId,
      action,
      resource,
      resourceId,
      oldData,
      newData,
      ipAddress: req?.ip,
      userAgent: req?.get('User-Agent'),
    });
  }

  /**
   * Log system events
   */
  async logSystemEvent(
    action: string,
    resource: string,
    metadata?: any,
  ): Promise<void> {
    await this.createAuditLog({
      action,
      resource,
      metadata,
    });
  }

  /**
   * Log authentication events
   */
  async logAuthEvent(
    userId: string,
    action:
      | 'LOGIN'
      | 'LOGOUT'
      | 'LOGIN_FAILED'
      | 'PASSWORD_CHANGED'
      | 'REGISTER',
    req?: any,
    metadata?: any,
  ): Promise<void> {
    await this.createAuditLog({
      userId,
      action,
      resource: 'AUTH',
      ipAddress: req?.ip,
      userAgent: req?.get('User-Agent'),
      metadata,
    });
  }

  /**
   * Log security events
   */
  async logSecurityEvent(
    action: string,
    resource: string,
    userId?: string,
    req?: any,
    metadata?: any,
  ): Promise<void> {
    await this.createAuditLog({
      userId,
      action,
      resource,
      ipAddress: req?.ip,
      userAgent: req?.get('User-Agent'),
      metadata,
    });
  }

  /**
   * Get audit logs with filtering and pagination
   */
  async getAuditLogs(options: {
    userId?: string;
    resource?: string;
    action?: string;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
  }) {
    const {
      userId,
      resource,
      action,
      startDate,
      endDate,
      page = 1,
      limit = 50,
    } = options;

    const where: any = {};

    if (userId) where.userId = userId;
    if (resource) where.resource = resource;
    if (action) where.action = action;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      logs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }
}
