import {
  Controller,
  Post,
  Get,
  Body,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { AdminAuthService } from './admin-auth.service';
import { AdminJwtAuthGuard } from './guards/admin-jwt-auth.guard';
import { AdminRolesGuard } from './guards/admin-roles.guard';
import {
  CurrentAdmin,
  CurrentAdminId,
} from './decorators/current-admin.decorator';
import { AdminRoles } from './decorators/admin-roles.decorator';
import {
  AdminLoginDto,
  AdminRefreshTokenDto,
  AdminSeedDto,
} from './dto/admin-auth.dto';
import {
  AdminAuthResponseDto,
  AdminProfileDto,
  AdminPermissionsDto,
} from './dto/admin-response.dto';
import { SuccessResponse } from '../../common/dto/api-response.dto';

@ApiTags('Admin Authentication')
@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Admin login',
    description:
      'Validates admin credentials and issues JWT tokens (access + refresh)',
  })
  @ApiBody({ type: AdminLoginDto })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    type: AdminAuthResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid credentials or account inactive',
  })
  @ApiResponse({
    status: 429,
    description: 'Too many failed login attempts',
  })
  async login(
    @Body() loginDto: AdminLoginDto,
    @Request() req: any,
  ): Promise<SuccessResponse<AdminAuthResponseDto>> {
    // Wrapped so ResponseInterceptor preserves the message. Returning the bare
    // service result made the interceptor substitute its generic POST string,
    // so admins saw "Resource created successfully" on login.
    const result = await this.adminAuthService.login(loginDto, req);
    return new SuccessResponse('User logged in successfully', result);
  }

  @Post('logout')
  @UseGuards(AdminJwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('admin-access-token')
  @ApiOperation({
    summary: 'Admin logout',
    description: 'Invalidates admin session and refresh token',
  })
  @ApiResponse({
    status: 200,
    description: 'Logout successful',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or expired token',
  })
  async logout(
    @CurrentAdminId() adminId: string,
    @Request() req: any,
  ): Promise<SuccessResponse<null>> {
    await this.adminAuthService.logout(adminId, req);
    return new SuccessResponse('Admin logged out successfully');
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh access token',
    description: 'Issues new access token using refresh token',
  })
  @ApiBody({ type: AdminRefreshTokenDto })
  @ApiResponse({
    status: 200,
    description: 'Token refreshed successfully',
    schema: {
      type: 'object',
      properties: {
        accessToken: { type: 'string' },
        refreshToken: { type: 'string' },
        expiresIn: { type: 'number' },
        tokenType: { type: 'string' },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid or expired refresh token',
  })
  async refresh(
    @Body() refreshTokenDto: AdminRefreshTokenDto,
    @Request() req: any,
  ): Promise<Omit<AdminAuthResponseDto, 'admin'>> {
    return this.adminAuthService.refreshToken(refreshTokenDto, req);
  }

  @Get('me')
  @UseGuards(AdminJwtAuthGuard)
  @ApiBearerAuth('admin-access-token')
  @ApiOperation({
    summary: 'Get authenticated admin profile',
    description: 'Returns authenticated admin profile information',
  })
  @ApiResponse({
    status: 200,
    description: 'Admin profile retrieved successfully',
    type: AdminProfileDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or expired token',
  })
  async getProfile(
    @CurrentAdminId() adminId: string,
  ): Promise<AdminProfileDto> {
    return this.adminAuthService.getAdminProfile(adminId);
  }

  @Get('permissions')
  @UseGuards(AdminJwtAuthGuard)
  @ApiBearerAuth('admin-access-token')
  @ApiOperation({
    summary: 'Get admin permissions',
    description: 'Returns role and permission scope for authenticated admin',
  })
  @ApiResponse({
    status: 200,
    description: 'Admin permissions retrieved successfully',
    type: AdminPermissionsDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or expired token',
  })
  async getPermissions(
    @CurrentAdminId() adminId: string,
  ): Promise<AdminPermissionsDto> {
    return this.adminAuthService.getAdminPermissions(adminId);
  }

  @Post('seed')
  @ApiOperation({
    summary: 'Seed Super Admin credentials',
    description:
      'Seeds Super Admin credentials (only works when no Super Admin exists)',
  })
  @ApiBody({ type: AdminSeedDto })
  @ApiResponse({
    status: 201,
    description: 'Super Admin created successfully',
    type: AdminProfileDto,
  })
  @ApiResponse({
    status: 409,
    description: 'Super Admin already exists',
  })
  @ApiResponse({
    status: 403,
    description: 'Seeding not allowed - Super Admin already exists',
  })
  async seedSuperAdmin(
    @Body() seedDto: AdminSeedDto,
  ): Promise<SuccessResponse<AdminProfileDto>> {
    const result = await this.adminAuthService.seedSuperAdmin(seedDto);
    return new SuccessResponse('Super admin created successfully', result);
  }
}
