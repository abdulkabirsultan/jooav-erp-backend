import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import {
  HealthCheckService,
  HealthCheck,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import { PrismaService } from '../modules/prisma/prisma.service';
import { CacheService } from '../modules/cache/cache.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private prismaHealth: PrismaHealthIndicator,
    private prismaService: PrismaService,
    private cacheService: CacheService,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Check application health' })
  @ApiResponse({ status: 200, description: 'Application is healthy' })
  @ApiResponse({ status: 503, description: 'Application is unhealthy' })
  check() {
    return this.health.check([
      () => this.prismaHealth.pingCheck('database', this.prismaService),
      async () => {
        const isRedisHealthy = await this.cacheService.ping();
        return {
          redis: {
            status: isRedisHealthy ? 'up' : 'down',
          },
        };
      },
    ]);
  }

  @Get('ready')
  @ApiOperation({ summary: 'Check if application is ready' })
  @ApiResponse({ status: 200, description: 'Application is ready' })
  ready() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    };
  }

  @Get('live')
  @ApiOperation({ summary: 'Liveness probe' })
  @ApiResponse({ status: 200, description: 'Application is alive' })
  live() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('cache')
  @ApiOperation({ summary: 'Check Redis cache connection and status' })
  @ApiResponse({ status: 200, description: 'Cache status information' })
  async cacheStatus() {
    const connectionInfo = await this.cacheService.getConnectionInfo();
    const connectionStatus = this.cacheService.getConnectionStatus();

    return {
      status: connectionStatus.connected ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      connection: connectionStatus,
      details: connectionInfo,
    };
  }
}
