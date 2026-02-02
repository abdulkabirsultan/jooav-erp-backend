import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  Request,
  HttpCode,
  HttpStatus,
  Patch,
  Delete,
  Param,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';

import { AuthService } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { UnifiedAuthGuard } from '../../common/guards/unified-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import {
  CurrentUser,
  CurrentUserId,
} from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditLog } from '../../common/decorators/audit-log.decorator';

import {
  LoginDto,
  RegisterDto,
  ChangePasswordDto,
  RefreshTokenDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from './dto/auth.dto';
import {
  AuthResponseDto,
  UserProfileDto,
  TokenValidationDto,
  SessionDto,
} from './dto/auth-response.dto';
import { UserRole } from '@prisma/client';
import { SuccessResponse } from '../../common/dto/api-response.dto';
import type { User } from '@prisma/client';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @UseGuards(LocalAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'User login' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @AuditLog({
    action: 'LOGIN',
    resource: 'AUTH',
    includeRequestBody: true,
  })
  async login(@Body() loginDto: LoginDto): Promise<SuccessResponse<any>> {
    const result = await this.authService.login(loginDto);
    return new SuccessResponse('User logged in successfully', result);
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'User registration' })
  @ApiBody({ type: RegisterDto })
  @ApiResponse({
    status: 201,
    description: 'Registration successful',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid registration data' })
  @ApiResponse({ status: 409, description: 'User already exists' })
  @AuditLog({
    action: 'REGISTER',
    resource: 'AUTH',
    includeRequestBody: true,
  })
  async register(
    @Body() registerDto: RegisterDto,
    @Request() req: any,
  ): Promise<SuccessResponse<AuthResponseDto>> {
    const result = await this.authService.register(registerDto, req);
    return new SuccessResponse('User registered successfully', result);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiBody({ type: RefreshTokenDto })
  @ApiResponse({
    status: 200,
    description: 'Token refreshed successfully',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid refresh token' })
  async refreshToken(
    @Body() refreshTokenDto: RefreshTokenDto,
    @Request() req: any,
  ): Promise<SuccessResponse<AuthResponseDto>> {
    const result = await this.authService.refreshToken(
      refreshTokenDto.refreshToken,
      req,
    );
    return new SuccessResponse('Token refreshed successfully', result);
  }

  @Post('logout')
  @UseGuards(UnifiedAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'User logout' })
  @ApiResponse({ status: 200, description: 'Logout successful' })
  @AuditLog({ action: 'LOGOUT', resource: 'AUTH' })
  async logout(
    @Body() body: { refreshToken: string },
    @CurrentUserId() userId: string,
  ): Promise<SuccessResponse<any>> {
    const result = await this.authService.logout(body.refreshToken, userId);
    return new SuccessResponse('User logged out successfully', result);
  }

  @Get('profile')
  @UseGuards(UnifiedAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({
    status: 200,
    description: 'User profile retrieved successfully',
    type: UserProfileDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getProfile(@CurrentUser() user: User): UserProfileDto {
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword as UserProfileDto;
  }

  @Patch('change-password')
  @UseGuards(UnifiedAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Change user password' })
  @ApiBody({ type: ChangePasswordDto })
  @ApiResponse({ status: 200, description: 'Password changed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid current password' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @AuditLog({
    action: 'PASSWORD_CHANGE',
    resource: 'AUTH',
    includeRequestBody: false, // Don't log passwords
  })
  async changePassword(
    @CurrentUserId() userId: string,
    @Body() changePasswordDto: ChangePasswordDto,
    @Request() req: any,
  ): Promise<{ message: string }> {
    await this.authService.changePassword(userId, changePasswordDto, req);
    return { message: 'Password changed successfully' };
  }

  @Get('sessions')
  @UseGuards(UnifiedAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get user active sessions' })
  @ApiResponse({
    status: 200,
    description: 'User sessions retrieved successfully',
    type: [SessionDto],
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getUserSessions(
    @CurrentUserId() userId: string,
  ): Promise<SuccessResponse<SessionDto[]>> {
    const sessions = await this.authService.getUserSessions(userId);
    return new SuccessResponse(
      'User sessions retrieved successfully',
      sessions,
    );
  }

  @Delete('sessions/:sessionId')
  @UseGuards(UnifiedAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Revoke a specific session' })
  @ApiResponse({ status: 200, description: 'Session revoked successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @AuditLog({ action: 'REVOKE_SESSION', resource: 'AUTH' })
  async revokeSession(
    @CurrentUserId() userId: string,
    @Param('sessionId') sessionId: string,
  ): Promise<{ message: string }> {
    await this.authService.revokeSession(userId, sessionId);
    return { message: 'Session revoked successfully' };
  }

  @Post('validate-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validate JWT token' })
  @ApiResponse({
    status: 200,
    description: 'Token validation result',
    type: TokenValidationDto,
  })
  async validateToken(
    @Body('token') token: string,
  ): Promise<SuccessResponse<TokenValidationDto>> {
    const result = await this.authService.validateToken(token);
    return new SuccessResponse('Token validation completed', result);
  }

  // ================================
  // ADMIN ONLY ENDPOINTS
  // ================================

  @Get('admin/users')
  @UseGuards(UnifiedAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get all users (Admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Users retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  async getAllUsers(@CurrentUser() currentUser: User) {
    // Implementation would go in UserService
    return {
      message: 'Admin endpoint - list all users',
      currentUser: currentUser.email,
    };
  }

  @Patch('admin/users/:userId/status')
  @UseGuards(UnifiedAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update user status (Admin only)' })
  @ApiResponse({ status: 200, description: 'User status updated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  @AuditLog({
    action: 'UPDATE_USER_STATUS',
    resource: 'USER',
    includeRequestBody: true,
  })
  async updateUserStatus(
    @Param('userId') userId: string,
    @Body('status') status: string,
    @CurrentUser() currentUser: User,
  ) {
    // Implementation would go in UserService
    return {
      message: 'Admin endpoint - update user status',
      targetUser: userId,
      newStatus: status,
      adminUser: currentUser.email,
    };
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request password reset',
    description: 'Send password reset email to user',
  })
  @ApiResponse({
    status: 200,
    description: 'Password reset email sent if email exists',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid email format' })
  @ApiBody({ type: ForgotPasswordDto })
  async forgotPassword(
    @Body() forgotPasswordDto: ForgotPasswordDto,
    @Request() req: any,
  ): Promise<SuccessResponse<any>> {
    const result = await this.authService.forgotPassword(
      forgotPasswordDto,
      req,
    );
    return new SuccessResponse(
      'Password reset instructions sent successfully',
      result,
    );
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reset password',
    description: 'Reset user password using reset token',
  })
  @ApiResponse({
    status: 200,
    description: 'Password reset successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  @ApiBody({ type: ResetPasswordDto })
  async resetPassword(
    @Body() resetPasswordDto: ResetPasswordDto,
    @Request() req: any,
  ): Promise<SuccessResponse<any>> {
    const result = await this.authService.resetPassword(resetPasswordDto, req);
    return new SuccessResponse('Password reset successfully', result);
  }
}
