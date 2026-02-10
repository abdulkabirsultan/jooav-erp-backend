import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Request,
  ParseEnumPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { UserRole, UserStatus } from '@prisma/client';

import { UsersService } from './users.service';
import { UnifiedAuthGuard } from '../../common/guards/unified-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUserId } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditLog } from '../../common/decorators/audit-log.decorator';
import { PaginatedResponse } from '../../common/dto/paginated-response.dto';
import { SuccessResponse } from '../../common/dto/api-response.dto';
import { ResponseMessages } from '../../common/utils/response-messages.util';
import {
  CreateUserDto,
  UpdateUserDto,
  UpdateUserStatusDto,
  UpdateUserRoleDto,
  UpdateUserProfileDto,
  UpdateAdminPermissionsDto,
} from './dto/user.dto';
import {
  CreateUserResponseDto,
  RegenerateResetTokenResponseDto,
} from './dto/user-response.dto';
import { UserProfileDto } from '../auth/dto/auth-response.dto';
import { PaginationDto } from '../../common/dto';

@ApiTags('Users')
@Controller('users')
@UseGuards(UnifiedAuthGuard)
@ApiBearerAuth('access-token')
@ApiBearerAuth('admin-access-token')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // ================================
  // USER MANAGEMENT (ADMIN ONLY)
  // ================================

  @Get()
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Get all users with pagination and filters (Admin only)',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'role', required: false, enum: UserRole })
  @ApiQuery({ name: 'status', required: false, enum: UserStatus })
  @ApiResponse({
    status: 200,
    description: 'Users retrieved successfully',
    type: PaginatedResponse<UserProfileDto>,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  async findAll(
    @Query() paginationDto: PaginationDto,
    @Query('role') role?: UserRole,
    @Query('status') status?: UserStatus,
    @CurrentUserId() currentUserId?: string,
  ): Promise<PaginatedResponse<UserProfileDto>> {
    return this.usersService.findAll(
      paginationDto,
      { role, status },
      currentUserId,
    );
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Create new user (Admin only)' })
  @ApiBody({ type: CreateUserDto })
  @ApiResponse({
    status: 201,
    description: 'User created successfully with reset URL',
    type: CreateUserResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid user data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  @ApiResponse({ status: 409, description: 'User already exists' })
  @AuditLog({
    action: 'CREATE_USER',
    resource: 'USER',
    includeRequestBody: true,
  })
  async create(
    @Body() createUserDto: CreateUserDto,
    @CurrentUserId() currentUserId: string,
    @Request() req: any,
  ): Promise<SuccessResponse<CreateUserResponseDto>> {
    const user = await this.usersService.create(
      createUserDto,
      currentUserId,
      req,
    );
    return new SuccessResponse(
      ResponseMessages.created('User', user.email),
      user as CreateUserResponseDto,
    );
  }

  @Post(':id/regenerate-reset-token')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Regenerate password reset token for user (Admin only)',
    description: 'Generate a new password reset token for the specified user',
  })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({
    status: 200,
    description: 'Reset token regenerated successfully',
    type: RegenerateResetTokenResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin only' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @AuditLog({
    action: 'REGENERATE_RESET_TOKEN',
    resource: 'USER',
  })
  async regenerateResetToken(
    @Param('id') userId: string,
    @CurrentUserId() currentUserId: string,
    @Request() req: any,
  ): Promise<SuccessResponse<RegenerateResetTokenResponseDto>> {
    const result = await this.usersService.regenerateResetToken(
      userId,
      currentUserId,
      req,
    );
    return new SuccessResponse(
      'Password reset token regenerated successfully',
      result,
    );
  }

  @Get('stats')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Get user statistics',
    description: 'Get comprehensive user statistics',
  })
  @ApiResponse({
    status: 200,
    description: 'User statistics retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        data: {
          type: 'object',
          properties: {
            totalUsers: { type: 'number', example: 50 },
            archived: { type: 'number', example: 3 },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin only' })
  async getUserStats(): Promise<SuccessResponse<any>> {
    const stats = await this.usersService.getUserStats();
    return new SuccessResponse('User statistics retrieved successfully', stats);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({
    status: 200,
    description: 'User retrieved successfully',
    type: UserProfileDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async findOne(@Param('id') id: string): Promise<UserProfileDto> {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Update user information (Admin only)' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiBody({ type: UpdateUserDto })
  @ApiResponse({
    status: 200,
    description: 'User updated successfully',
    type: UserProfileDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid user data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 409, description: 'Username already taken' })
  @AuditLog({
    action: 'UPDATE_USER',
    resource: 'USER',
    includeRequestBody: true,
  })
  async update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @CurrentUserId() currentUserId: string,
    @Request() req: any,
  ): Promise<UserProfileDto> {
    return this.usersService.update(id, updateUserDto, currentUserId, req);
  }

  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({ summary: 'Update user status (Admin only)' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiBody({ type: UpdateUserStatusDto })
  @ApiResponse({
    status: 200,
    description: 'User status updated successfully',
    type: UserProfileDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  @AuditLog({
    action: 'UPDATE_USER_STATUS',
    resource: 'USER',
    includeRequestBody: true,
  })
  async updateStatus(
    @Param('id') id: string,
    @Body() updateStatusDto: UpdateUserStatusDto,
    @CurrentUserId() currentUserId: string,
    @Request() req: any,
  ): Promise<UserProfileDto> {
    return this.usersService.updateStatus(
      id,
      updateStatusDto,
      currentUserId,
      req,
    );
  }

  @Patch(':id/role')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN) // Admin roles can change user roles
  @ApiOperation({ summary: 'Update user role (Admin only)' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiBody({ type: UpdateUserRoleDto })
  @ApiResponse({
    status: 200,
    description: 'User role updated successfully',
    type: UserProfileDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  @AuditLog({
    action: 'UPDATE_USER_ROLE',
    resource: 'USER',
    includeRequestBody: true,
  })
  async updateRole(
    @Param('id') id: string,
    @Body() updateRoleDto: UpdateUserRoleDto,
    @CurrentUserId() currentUserId: string,
    @Request() req: any,
  ): Promise<UserProfileDto> {
    return this.usersService.updateRole(id, updateRoleDto, currentUserId, req);
  }

  @Patch(':id/permissions')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update admin permissions (Super Admin only)' })
  @ApiParam({ name: 'id', description: 'Admin User ID' })
  @ApiBody({ type: UpdateAdminPermissionsDto })
  @ApiResponse({
    status: 200,
    description: 'Admin permissions updated successfully',
    type: UserProfileDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Super Admin access required',
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 400, description: 'Invalid permissions data' })
  @AuditLog({
    action: 'UPDATE_ADMIN_PERMISSIONS',
    resource: 'ADMIN_PROFILE',
    includeRequestBody: true,
  })
  async updateAdminPermissions(
    @Param('id') id: string,
    @Body() updatePermissionsDto: UpdateAdminPermissionsDto,
    @CurrentUserId() currentUserId: string,
    @Request() req: any,
  ): Promise<UserProfileDto> {
    return this.usersService.updateAdminPermissions(
      id,
      updatePermissionsDto,
      currentUserId,
      req,
    );
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN) // Only Super Admin can delete users
  @ApiOperation({ summary: 'Soft delete user (Admin only)' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  @AuditLog({
    action: 'DELETE_USER',
    resource: 'USER',
  })
  async remove(
    @Param('id') id: string,
    @CurrentUserId() currentUserId: string,
    @Request() req: any,
  ): Promise<{ message: string }> {
    await this.usersService.remove(id, currentUserId, req);
    return { message: 'User deleted successfully' };
  }

  // ================================
  // PROFILE MANAGEMENT (SELF)
  // ================================

  @Get('me/profile')
  @ApiOperation({ summary: 'Get own profile' })
  @ApiResponse({
    status: 200,
    description: 'Profile retrieved successfully',
    type: UserProfileDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getMyProfile(@CurrentUserId() userId: string): Promise<UserProfileDto> {
    return this.usersService.findOne(userId);
  }

  @Patch('me/profile')
  @ApiOperation({ summary: 'Update own profile' })
  @ApiBody({ type: UpdateUserDto })
  @ApiResponse({
    status: 200,
    description: 'Profile updated successfully',
    type: UserProfileDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid profile data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 409, description: 'Username already taken' })
  @AuditLog({
    action: 'UPDATE_OWN_PROFILE',
    resource: 'USER',
    includeRequestBody: true,
  })
  async updateMyProfile(
    @CurrentUserId() userId: string,
    @Body() updateUserDto: UpdateUserDto,
    @Request() req: any,
  ): Promise<UserProfileDto> {
    return this.usersService.update(userId, updateUserDto, userId, req);
  }

  @Patch('me/profile/details')
  @ApiOperation({ summary: 'Update own profile details (address, bio, etc.)' })
  @ApiBody({ type: UpdateUserProfileDto })
  @ApiResponse({
    status: 200,
    description: 'Profile details updated successfully',
    type: UserProfileDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid profile data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @AuditLog({
    action: 'UPDATE_PROFILE_DETAILS',
    resource: 'USER',
    includeRequestBody: true,
  })
  async updateMyProfileDetails(
    @CurrentUserId() userId: string,
    @Body() updateProfileDto: UpdateUserProfileDto,
    @Request() req: any,
  ): Promise<UserProfileDto> {
    return this.usersService.updateProfile(
      userId,
      updateProfileDto,
      userId,
      req,
    );
  }

  // ================================
  // USER ACTIVITY LOGS (ADMIN ONLY)
  // ================================

  @Get(':id/activity')
  @UseGuards(RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Get user activity log',
    description: 'Retrieve activity logs for a specific user (Admin only)',
  })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page',
  })
  @ApiResponse({
    status: 200,
    description: 'User activity log retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin only' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getUserActivity(
    @Param('id') userId: string,
    @Query() paginationDto: PaginationDto,
  ) {
    return this.usersService.getUserActivity(userId, paginationDto);
  }
}
