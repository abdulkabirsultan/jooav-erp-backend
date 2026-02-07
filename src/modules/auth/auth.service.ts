import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserRole, UserStatus, User } from '@prisma/client';
import * as argon2 from 'argon2';
import { v4 as uuidv4 } from 'uuid';

import { PrismaService } from '../prisma/prisma.service';
import { generatePasswordResetToken } from '../../common/utils/token.util';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../email/email.service';
import { JwtPayload } from './strategies/jwt.strategy';
import {
  LoginDto,
  RegisterDto,
  ChangePasswordDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from './dto/auth.dto';
import {
  AuthResponseDto,
  UserProfileDto,
  TokenValidationDto,
} from './dto/auth-response.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly jwtSecret: string;
  private readonly jwtExpiresIn: string;
  private readonly argon2Options = {
    memoryCost: 65536, // 64MB
    timeCost: 3,
    parallelism: 1,
    type: argon2.argon2id,
  };
  private readonly blacklistedTokens = new Set<string>();

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private auditService: AuditService,
    private emailService: EmailService,
  ) {
    this.jwtSecret =
      this.configService.get('security.jwtSecret') || 'your-secret-key';
    this.jwtExpiresIn =
      this.configService.get('security.jwtExpiresIn') || '15m';
  }

  // ================================
  // AUTHENTICATION METHODS
  // ================================

  /**
   * Validate user credentials for login
   */
  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { profile: true },
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      return null;
    }

    const isPasswordValid = await argon2.verify(user.password, password);
    if (!isPasswordValid) {
      return null;
    }

    // Update last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    return user;
  }

  /**
   * Validate user by ID (for JWT strategy)
   */
  async validateUserById(id: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        profile: true,
        wholesalerProfile: true,
        procurementOfficerProfile: true,
        adminProfile: true,
      },
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      return null;
    }

    return user;
  }

  /**
   * Login user and return tokens
   */
  async login(loginDto: LoginDto, request?: any): Promise<AuthResponseDto> {
    const user = await this.validateUser(loginDto.email, loginDto.password);

    if (!user) {
      // Log failed login attempt
      await this.auditService.logAuthEvent('unknown', 'LOGIN_FAILED', request, {
        email: loginDto.email,
        reason: 'Invalid credentials',
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = await this.generateTokens(user);

    // Create user session
    await this.createUserSession(user.id, tokens.refreshToken, request);

    // Log successful login
    await this.auditService.logAuthEvent(user.id, 'LOGIN', request, {
      email: user.email,
    });

    return {
      ...tokens,
      user: this.transformUserToProfile(user),
    };
  }

  /**
   * Register new user
   */
  async register(
    registerDto: RegisterDto,
    request?: any,
  ): Promise<AuthResponseDto> {
    // Check if user already exists
    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: registerDto.email.toLowerCase() },
          ...(registerDto.username ? [{ username: registerDto.username }] : []),
        ],
      },
    });

    if (existingUser) {
      const field =
        existingUser.email === registerDto.email.toLowerCase()
          ? 'email'
          : 'username';
      throw new ConflictException(`User with this ${field} already exists`);
    }

    // Hash password
    const hashedPassword = await this.hashPassword(registerDto.password);
    // Create user
    const user = await this.prisma.user.create({
      data: {
        email: registerDto.email.toLowerCase(),
        username: registerDto.username?.toLowerCase(),
        password: hashedPassword,
        firstName: registerDto.firstName,
        lastName: registerDto.lastName,
        phone: registerDto.phone,
        role: UserRole.WHOLESALER, // Default role
        status: UserStatus.ACTIVE,
        profile: {
          create: {
            // Initialize empty profile
          },
        },
      },
      include: { profile: true },
    });

    const tokens = await this.generateTokens(user);

    // Create user session
    await this.createUserSession(user.id, tokens.refreshToken, request);

    // Log registration
    await this.auditService.logAuthEvent(user.id, 'REGISTER', request, {
      email: user.email,
    });

    return {
      ...tokens,
      user: this.transformUserToProfile(user),
    };
  }

  /**
   * Refresh access token
   */
  async refreshToken(
    refreshToken: string,
    request?: any,
  ): Promise<AuthResponseDto> {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.jwtSecret,
      });

      const user = await this.validateUserById(payload.sub);
      if (!user) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Verify session exists
      const session = await this.prisma.userSession.findFirst({
        where: {
          userId: user.id,
          token: refreshToken,
          expiresAt: { gt: new Date() },
        },
      });

      if (!session) {
        throw new UnauthorizedException('Invalid or expired refresh token');
      }

      const tokens = await this.generateTokens(user);

      // Update session with new refresh token
      await this.prisma.userSession.update({
        where: { id: session.id },
        data: {
          token: tokens.refreshToken,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        },
      });

      return {
        ...tokens,
        user: this.transformUserToProfile(user),
      };
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  /**
   * Logout user and invalidate tokens
   */
  async logout(userId: string, tokenId?: string, request?: any): Promise<void> {
    // Invalidate all user sessions
    await this.prisma.userSession.deleteMany({
      where: { userId },
    });

    // Add token to blacklist if provided
    if (tokenId) {
      this.blacklistedTokens.add(tokenId);
    }

    // Log logout
    await this.auditService.logAuthEvent(userId, 'LOGOUT', request);
  }

  /**
   * Change user password
   */
  async changePassword(
    userId: string,
    changePasswordDto: ChangePasswordDto,
    request?: any,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Verify current password
    const isCurrentPasswordValid = await argon2.verify(
      user.password,
      changePasswordDto.currentPassword,
    );

    if (!isCurrentPasswordValid) {
      throw new BadRequestException('Current password is incorrect');
    }

    // Hash new password
    const hashedPassword = await this.hashPassword(
      changePasswordDto.newPassword,
    );

    // Update password
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
        passwordChangedAt: new Date(),
      },
    });

    // Invalidate all user sessions (force re-login)
    await this.prisma.userSession.deleteMany({
      where: { userId },
    });

    // Send password change confirmation email
    try {
      await this.emailService.sendTemplatedEmail(
        user.email,
        'passwordChanged',
        {
          name: user.firstName
            ? `${user.firstName} ${user.lastName || ''}`.trim()
            : user.email,
          changeTime: new Date().toLocaleString(),
          ipAddress:
            request?.ip || request?.connection?.remoteAddress || 'Unknown',
          userAgent: request?.get?.('User-Agent') || 'Unknown',
        },
      );
    } catch (error) {
      this.logger.error(
        'Failed to send password change confirmation email:',
        error,
      );
      // Don't throw error as password was already changed successfully
    }

    // Log password change
    await this.auditService.logAuthEvent(userId, 'PASSWORD_CHANGED', request);
  }

  // ================================
  // UTILITY METHODS
  // ================================

  /**
   * Generate JWT tokens for user
   */
  private async generateTokens(user: User): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    tokenType: string;
  }> {
    const jwtId = uuidv4();

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = this.jwtService.sign(payload as any);

    const refreshToken = this.jwtService.sign({
      sub: user.id,
      tokenType: 'refresh',
    } as any);

    return {
      accessToken,
      refreshToken,
      expiresIn: 86400, // 24 hours in seconds
      tokenType: 'Bearer',
    };
  }

  /**
   * Hash password using Argon2
   */
  private async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, this.argon2Options);
  }

  /**
   * Transform user entity to profile DTO
   */
  private transformUserToProfile(user: User): UserProfileDto {
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword as UserProfileDto;
  }

  /**
   * Create user session
   */
  private async createUserSession(
    userId: string,
    refreshToken: string,
    request?: any,
  ): Promise<void> {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await this.prisma.userSession.create({
      data: {
        userId,
        token: refreshToken,
        expiresAt,
        ipAddress: request?.ip,
        userAgent: request?.get('User-Agent'),
      },
    });
  }

  /**
   * Check if token is blacklisted
   */
  async isTokenBlacklisted(tokenId: string): Promise<boolean> {
    return this.blacklistedTokens.has(tokenId);
  }

  /**
   * Validate token and return user info
   */
  async validateToken(token: string): Promise<TokenValidationDto> {
    try {
      const payload = this.jwtService.verify(token, {
        secret: this.jwtSecret,
      });

      // Check if token is blacklisted
      if (payload.jti && this.blacklistedTokens.has(payload.jti)) {
        return { valid: false };
      }

      const user = await this.validateUserById(payload.sub);
      if (!user) {
        return { valid: false };
      }

      return {
        valid: true,
        user: this.transformUserToProfile(user),
        expiresAt: new Date(payload.exp * 1000),
      };
    } catch (error) {
      return { valid: false };
    }
  }

  /**
   * Get user sessions
   */
  async getUserSessions(userId: string) {
    return this.prisma.userSession.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Revoke specific session
   */
  async revokeSession(userId: string, sessionId: string): Promise<void> {
    await this.prisma.userSession.deleteMany({
      where: {
        id: sessionId,
        userId,
      },
    });
  }

  /**
   * Request password reset
   */
  async forgotPassword(
    forgotPasswordDto: ForgotPasswordDto,
    request?: any,
  ): Promise<{ message: string }> {
    const { email } = forgotPasswordDto;

    // Check if user exists
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    // Don't reveal if email exists or not for security
    if (!user) {
      return {
        message: 'If the email exists, a reset link has been sent.',
      };
    }

    // Check if user is active
    if (user.status !== UserStatus.ACTIVE) {
      return {
        message: 'If the email exists, a reset link has been sent.',
      };
    }

    // Generate reset token
    const { token: resetToken, expiresAt } = generatePasswordResetToken(1); // 1 hour expiry

    // Invalidate any existing reset tokens for this email
    await this.prisma.passwordReset.updateMany({
      where: {
        email: email.toLowerCase(),
        used: false,
        expiresAt: { gt: new Date() },
      },
      data: { used: true },
    });

    // Create new password reset record
    await this.prisma.passwordReset.create({
      data: {
        email: email.toLowerCase(),
        token: resetToken,
        expiresAt,
      },
    });

    // Send password reset email
    const resetUrl = `${this.configService.get('email.baseUrl')}/reset-password?token=${resetToken}`;

    try {
      await this.emailService.sendTemplatedEmail(email, 'passwordReset', {
        name: user.firstName
          ? `${user.firstName} ${user.lastName || ''}`.trim()
          : user.email,
        resetUrl,
        expiresIn: '1 hour',
      });
    } catch (error) {
      this.logger.error('Failed to send password reset email:', error);
      // Don't throw error to avoid revealing if email exists
    }

    // Log password reset request
    await this.auditService.logAuthEvent(user.id, 'PASSWORD_CHANGED', request, {
      email,
      action: 'reset_requested',
    });

    return {
      message: 'If the email exists, a reset link has been sent.',
    };
  }

  /**
   * Reset password using token
   */
  async resetPassword(
    resetPasswordDto: ResetPasswordDto,
    request?: any,
  ): Promise<{ message: string }> {
    const { token, password } = resetPasswordDto;

    // Find valid reset token
    const passwordReset = await this.prisma.passwordReset.findFirst({
      where: {
        token,
        used: false,
        expiresAt: { gt: new Date() },
      },
    });

    if (!passwordReset) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    // Find user
    const user = await this.prisma.user.findUnique({
      where: { email: passwordReset.email },
    });

    if (!user) {
      throw new BadRequestException('Invalid reset token');
    }

    // Check if user is active
    if (user.status !== UserStatus.ACTIVE) {
      throw new BadRequestException('Account is not active');
    }

    // Hash new password
    const hashedPassword = await argon2.hash(password, this.argon2Options);

    // Update user password and mark reset as used
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          password: hashedPassword,
          passwordChangedAt: new Date(),
        },
      }),
      this.prisma.passwordReset.update({
        where: { id: passwordReset.id },
        data: { used: true },
      }),
      // Revoke all user sessions
      this.prisma.userSession.deleteMany({
        where: { userId: user.id },
      }),
    ]);

    // Invalidate all JWT tokens for this user by updating passwordChangedAt
    // This will cause token validation to fail since tokens issued before passwordChangedAt are invalid

    // Send password reset success confirmation email
    try {
      await this.emailService.sendTemplatedEmail(
        user.email,
        'passwordResetSuccess',
        {
          name: user.firstName
            ? `${user.firstName} ${user.lastName || ''}`.trim()
            : user.email,
          resetTime: new Date().toLocaleString(),
          ipAddress:
            request?.ip || request?.connection?.remoteAddress || 'Unknown',
          userAgent: request?.get?.('User-Agent') || 'Unknown',
        },
      );
    } catch (error) {
      this.logger.error('Failed to send password reset success email:', error);
      // Don't throw error as password was already reset successfully
    }

    // Log password reset
    await this.auditService.logAuthEvent(user.id, 'PASSWORD_CHANGED', request, {
      resetToken: true,
    });

    return {
      message:
        'Password has been reset successfully. Please log in with your new password.',
    };
  }
}
