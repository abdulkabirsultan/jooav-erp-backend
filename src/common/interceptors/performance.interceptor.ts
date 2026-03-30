import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { Request, Response } from 'express';
import { throwError } from 'rxjs';

interface PerformanceMetrics {
  method: string;
  url: string;
  duration: number;
  statusCode: number;
  responseSize?: number;
  memoryUsage?: NodeJS.MemoryUsage;
  timestamp: Date;
}

@Injectable()
export class PerformanceInterceptor implements NestInterceptor {
  private readonly logger = new Logger(PerformanceInterceptor.name);
  private metricsBuffer: PerformanceMetrics[] = [];
  private readonly BUFFER_SIZE = 100;
  private readonly SLOW_REQUEST_THRESHOLD = 1000; // 1 second

  constructor() {
    // Log aggregated metrics every 5 minutes
    setInterval(
      () => {
        this.logAggregatedMetrics();
      },
      5 * 60 * 1000,
    );
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const startTime = performance.now();
    const startMemory = process.memoryUsage();

    return next.handle().pipe(
      tap((data) => {
        const duration = performance.now() - startTime;
        const endMemory = process.memoryUsage();

        const metrics: PerformanceMetrics = {
          method: request.method,
          url: this.sanitizeUrl(request.url),
          duration,
          statusCode: response.statusCode,
          responseSize: this.estimateDataSize(data),
          memoryUsage: {
            rss: endMemory.rss - startMemory.rss,
            heapUsed: endMemory.heapUsed - startMemory.heapUsed,
            heapTotal: endMemory.heapTotal - startMemory.heapTotal,
            external: endMemory.external - startMemory.external,
            arrayBuffers: endMemory.arrayBuffers - startMemory.arrayBuffers,
          },
          timestamp: new Date(),
        };

        this.recordMetrics(metrics);

        // Log slow requests immediately
        if (duration > this.SLOW_REQUEST_THRESHOLD) {
          this.logger.warn(
            `Slow request detected: ${request.method} ${request.url}`,
            {
              duration: `${duration.toFixed(2)}ms`,
              memoryIncrease: `${((metrics.memoryUsage?.heapUsed || 0) / 1024 / 1024).toFixed(2)}MB`,
              statusCode: response.statusCode,
            },
          );
        }
      }),
      catchError((error) => {
        const duration = performance.now() - startTime;

        const metrics: PerformanceMetrics = {
          method: request.method,
          url: this.sanitizeUrl(request.url),
          duration,
          statusCode: response.statusCode || 500,
          timestamp: new Date(),
        };

        this.recordMetrics(metrics);

        this.logger.error(`Request error: ${request.method} ${request.url}`, {
          duration: `${duration.toFixed(2)}ms`,
          error: error.message,
          statusCode: response.statusCode || 500,
        });

        return throwError(() => error);
      }),
    );
  }

  private recordMetrics(metrics: PerformanceMetrics): void {
    this.metricsBuffer.push(metrics);

    // Keep buffer size manageable
    if (this.metricsBuffer.length > this.BUFFER_SIZE) {
      this.metricsBuffer.shift();
    }
  }

  private logAggregatedMetrics(): void {
    if (this.metricsBuffer.length === 0) return;

    const totalRequests = this.metricsBuffer.length;
    const avgDuration =
      this.metricsBuffer.reduce((sum, m) => sum + m.duration, 0) /
      totalRequests;
    const slowRequests = this.metricsBuffer.filter(
      (m) => m.duration > this.SLOW_REQUEST_THRESHOLD,
    ).length;
    const errorRequests = this.metricsBuffer.filter(
      (m) => m.statusCode >= 400,
    ).length;

    // Group by endpoint
    const endpointStats = new Map<
      string,
      { count: number; avgDuration: number }
    >();
    this.metricsBuffer.forEach((m) => {
      const key = `${m.method} ${m.url}`;
      const existing = endpointStats.get(key) || { count: 0, avgDuration: 0 };
      existing.count += 1;
      existing.avgDuration =
        (existing.avgDuration * (existing.count - 1) + m.duration) /
        existing.count;
      endpointStats.set(key, existing);
    });

    // Find slowest endpoints
    const slowestEndpoints = Array.from(endpointStats.entries())
      .sort((a, b) => b[1].avgDuration - a[1].avgDuration)
      .slice(0, 5);

    this.logger.log('Performance Summary (last 5 minutes)', {
      totalRequests,
      avgDuration: `${avgDuration.toFixed(2)}ms`,
      slowRequests: `${slowRequests} (${((slowRequests / totalRequests) * 100).toFixed(1)}%)`,
      errorRequests: `${errorRequests} (${((errorRequests / totalRequests) * 100).toFixed(1)}%)`,
      slowestEndpoints: slowestEndpoints.map(([endpoint, stats]) => ({
        endpoint,
        avgDuration: `${stats.avgDuration.toFixed(2)}ms`,
        requests: stats.count,
      })),
    });

    // Clear buffer
    this.metricsBuffer = [];
  }

  private sanitizeUrl(url: string): string {
    // Remove query parameters and IDs to group similar endpoints
    return url
      .split('?')[0] // Remove query string
      .replace(
        /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
        '/:id',
      ) // Replace UUIDs
      .replace(/\/\d+/g, '/:id'); // Replace numeric IDs
  }

  private estimateDataSize(data: any): number {
    if (!data) return 0;

    try {
      if (typeof data === 'string') {
        return data.length;
      }

      if (typeof data === 'object') {
        if (Array.isArray(data)) {
          return data.length * 100; // Rough estimate
        }
        return Object.keys(data).length * 50; // Rough estimate
      }

      return 0;
    } catch (error) {
      return 0;
    }
  }

  // Method to get current performance metrics (for health endpoints)
  getMetrics(): any {
    if (this.metricsBuffer.length === 0) {
      return {
        requests: 0,
        avgDuration: 0,
        slowRequests: 0,
        errors: 0,
      };
    }

    const totalRequests = this.metricsBuffer.length;
    const avgDuration =
      this.metricsBuffer.reduce((sum, m) => sum + m.duration, 0) /
      totalRequests;
    const slowRequests = this.metricsBuffer.filter(
      (m) => m.duration > this.SLOW_REQUEST_THRESHOLD,
    ).length;
    const errors = this.metricsBuffer.filter((m) => m.statusCode >= 400).length;

    return {
      requests: totalRequests,
      avgDuration: Number(avgDuration.toFixed(2)),
      slowRequests: Number(((slowRequests / totalRequests) * 100).toFixed(1)),
      errors: Number(((errors / totalRequests) * 100).toFixed(1)),
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime(),
    };
  }
}
