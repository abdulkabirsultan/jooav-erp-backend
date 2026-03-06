import { Controller, Get, HttpStatus, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UnifiedAuthGuard } from '../../common/guards/unified-auth.guard';
import { RolesGuard } from '../../modules/auth/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUserId } from '../../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';
import { OrderService } from '../../modules/order/order.service';

@ApiTags('Admin Dashboard')
@Controller('admin/dashboard')
@UseGuards(UnifiedAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminDashboardController {
  constructor(private readonly orderService: OrderService) {}

  @Get()
  @ApiBearerAuth('admin-access-token')
  @ApiOperation({
    summary: 'Get admin dashboard data',
    description:
      'Returns active orders, recent users, and statistics for admin/super admin users',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Dashboard data retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        data: {
          type: 'object',
          properties: {
            activeOrders: {
              type: 'array',
              description: 'Recent 20 active orders with full details',
            },
            recentUsers: {
              type: 'array',
              description:
                'Recent 20 users (admins see users below their level)',
            },
            stats: {
              type: 'object',
              properties: {
                totalRevenue: {
                  type: 'number',
                  description: 'Total revenue from completed orders',
                },
                completedOrders: {
                  type: 'number',
                  description: 'Total completed orders count',
                },
                liveProducts: {
                  type: 'number',
                  description: 'Total live products count',
                },
                allOrders: {
                  type: 'number',
                  description: 'Total orders count',
                },
              },
            },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Access denied - Admin/Super Admin role required',
  })
  async getDashboard(@CurrentUserId() userId: string) {
    return this.orderService.getDashboard(userId);
  }
}
