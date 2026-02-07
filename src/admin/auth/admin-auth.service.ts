import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserRole, UserStatus, AdminAction } from '@prisma/client';
import * as argon2 from 'argon2';

import { PrismaService } from '../../modules/prisma/prisma.service';
import { AuditService } from '../../modules/audit/audit.service';
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
import { AdminJwtPayload } from './strategies/admin-jwt.strategy';

@Injectable()
export class AdminAuthService {
  private readonly jwtSecret: string;
  private readonly jwtExpiresIn: string;
  private readonly argonOptions: any;

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private auditService: AuditService,
  ) {
    this.jwtSecret =
      this.configService.get('security.jwtSecret') || 'your-secret-key';
    this.jwtExpiresIn =
      this.configService.get('security.jwtExpiresIn') || '15m';
    this.argonOptions = {
      type: argon2.argon2id,
      memoryCost: 2 ** 16,
      timeCost: 3,
      parallelism: 1,
    };
  }

  /**
   * Admin Login
   */
  async login(
    loginDto: AdminLoginDto,
    request: any,
  ): Promise<AdminAuthResponseDto> {
    const { email, password } = loginDto;

    // Find admin user with profile
    const admin = await this.prisma.user.findUnique({
      where: {
        email,
        role: { in: [UserRole.SUPER_ADMIN, UserRole.ADMIN] },
        status: UserStatus.ACTIVE,
      },
      include: {
        adminProfile: true,
      },
    });

    if (
      !admin ||
      (admin.role !== UserRole.SUPER_ADMIN && admin.role !== UserRole.ADMIN)
    ) {
      await this.logAdminAuditEvent(
        'unknown',
        AdminAction.LOGIN_FAILED,
        'ADMIN_AUTH',
        null,
        request,
        { reason: 'Account not found' },
      );
      throw new UnauthorizedException('Invalid admin credentials');
    }

    // Check account status
    if (admin.status !== UserStatus.ACTIVE) {
      await this.logAdminAuditEvent(
        admin.id,
        AdminAction.LOGIN_FAILED,
        'ADMIN_AUTH',
        admin.id,
        request,
        { email, reason: 'Account not active', status: admin.status },
      );
      throw new UnauthorizedException(
        `Admin account is ${admin.status.toLowerCase()}`,
      );
    }

    // Check if account is temporarily locked
    if (
      admin.adminProfile?.accountLockUntil &&
      new Date() < admin.adminProfile.accountLockUntil
    ) {
      await this.logAdminAuditEvent(
        admin.id,
        AdminAction.LOGIN_FAILED,
        'ADMIN_AUTH',
        admin.id,
        request,
        { email, reason: 'Account locked' },
      );
      throw new UnauthorizedException('Admin account is temporarily locked');
    }

    // Verify password
    const isPasswordValid = await argon2.verify(
      admin.password,
      password,
      this.argonOptions,
    );

    if (!isPasswordValid) {
      // Increment failed login attempts
      await this.handleFailedLogin(admin.id);

      await this.logAdminAuditEvent(
        admin.id,
        'LOGIN_FAILED',
        'ADMIN_AUTH',
        admin.id,
        request,
        { email, reason: 'Invalid password' },
      );
      throw new UnauthorizedException('Invalid admin credentials');
    }

    // Reset failed login attempts on successful login
    await this.resetFailedLoginAttempts(admin.id);

    // Generate tokens
    const tokens = await this.generateTokens(admin);

    // Update last login
    await this.prisma.user.update({
      where: { id: admin.id },
      data: { lastLogin: new Date() },
    });

    // Update admin profile activity
    if (admin.adminProfile) {
      await this.prisma.adminProfile.update({
        where: { userId: admin.id },
        data: { lastActivity: new Date() },
      });
    }

    // Create session record
    await this.createAdminSession(admin.id, tokens.refreshToken, request);

    // Log successful admin login
    await this.auditService.logAuthEvent(admin.id, 'LOGIN', request, {
      email,
    });

    return {
      ...tokens,
      admin: await this.transformToAdminProfile(admin),
    };
  }

  /**
   * Refresh admin tokens
   */
  async refreshToken(
    refreshTokenDto: AdminRefreshTokenDto,
    request: any,
  ): Promise<Omit<AdminAuthResponseDto, 'admin'>> {
    const { refreshToken } = refreshTokenDto;

    try {
      const payload = this.jwtService.verify(refreshToken);

      if (payload.type !== 'admin-refresh') {
        throw new UnauthorizedException('Invalid admin refresh token');
      }

      const admin = await this.validateAdminById(payload.sub);
      if (!admin) {
        throw new UnauthorizedException('Admin not found');
      }

      // Generate new tokens
      const tokens = await this.generateTokens(admin);

      // Log token refresh
      await this.logAdminAuditEvent(
        admin.id,
        AdminAction.TOKEN_REFRESH,
        'ADMIN_AUTH',
        admin.id,
        request,
      );

      return tokens;
    } catch (error) {
      await this.logAdminAuditEvent(
        'unknown',
        AdminAction.TOKEN_REFRESH_FAILED,
        'ADMIN_AUTH',
        null,
        request,
        { error: error.message },
      );
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  /**
   * Admin logout
   */
  async logout(adminId: string, request: any): Promise<void> {
    // Invalidate all sessions for this admin
    await this.prisma.userSession.deleteMany({
      where: { userId: adminId },
    });

    // Log logout
    await this.logAdminAuditEvent(
      adminId,
      AdminAction.LOGOUT,
      'ADMIN_AUTH',
      adminId,
      request,
    );
  }

  /**
   * Get admin profile
   */
  async getAdminProfile(adminId: string): Promise<AdminProfileDto> {
    const admin = await this.prisma.user.findUnique({
      where: { id: adminId },
      include: {
        adminProfile: true,
      },
    });

    if (!admin) {
      throw new NotFoundException('Admin not found');
    }

    return this.transformToAdminProfile(admin);
  }

  /**
   * Get admin permissions
   */
  async getAdminPermissions(adminId: string): Promise<AdminPermissionsDto> {
    const admin = await this.prisma.user.findUnique({
      where: { id: adminId },
      include: {
        adminProfile: true,
      },
    });

    if (!admin) {
      throw new NotFoundException('Admin not found');
    }

    const isSuperAdmin = admin.role === UserRole.SUPER_ADMIN;
    const isAdmin = admin.role === UserRole.ADMIN;

    // Simplified permissions based on actual usage
    return {
      role: admin.role,
      assignedRegions: admin.adminProfile?.assignedRegions || [],
      permissions: {
        manufacturers: {
          create: true, // All admins can manage manufacturers
          read: true,
          update: true,
          delete: isSuperAdmin, // Only super admin can delete
          approve: true,
        },
        wholesalers: {
          create: false, // Wholesalers register themselves
          read: true,
          update: true,
          delete: isSuperAdmin,
          approve: true,
        },
        subAdmins: {
          create: isSuperAdmin, // Only super admin can create other admins
          read: true,
          update: isSuperAdmin,
          delete: isSuperAdmin,
          assign: isSuperAdmin,
        },
        orders: {
          read: true,
          update: true,
          cancel: true,
          override: isSuperAdmin,
        },
        analytics: {
          access: true, // All admins have analytics access
          export: true,
        },
        systemConfig: {
          read: true,
          update:
            isSuperAdmin &&
            (admin.adminProfile?.canModifySystemConfig ?? false),
        },
      },
    };
  }

  /**
   * Seed Super Admin (Internal use only)
   */
  async seedSuperAdmin(seedDto: AdminSeedDto): Promise<AdminProfileDto> {
    // Check if Super Admin already exists
    const existingAdmin = await this.prisma.user.findFirst({
      where: { role: UserRole.SUPER_ADMIN },
    });

    if (existingAdmin) {
      throw new ConflictException('Super Admin already exists');
    }

    // Hash password
    const hashedPassword = await argon2.hash(
      seedDto.password,
      this.argonOptions,
    );
    const passwordString = hashedPassword.toString();

    // Create Super Admin
    const superAdmin = await this.prisma.user.create({
      data: {
        email: seedDto.email,
        password: passwordString,
        firstName: seedDto.firstName,
        lastName: seedDto.lastName,
        role: UserRole.SUPER_ADMIN,
        status: UserStatus.ACTIVE,
        emailVerified: true,
        adminProfile: {
          create: {
            // Super Admin is platform owner - no regional restrictions
            permissions: undefined,
            canModifySystemConfig: true,
            canSuspendAdmins: true,
            canChangeUserRoles: true,
            canChangeUserEmails: true,
          },
        },
      },
      include: {
        adminProfile: true,
      },
    });

    return this.transformToAdminProfile(superAdmin);
  }

  /**
   * Validate admin by ID
   */
  async validateAdminById(adminId: string): Promise<any> {
    const admin = await this.prisma.user.findUnique({
      where: {
        id: adminId,
        role: { in: [UserRole.SUPER_ADMIN, UserRole.ADMIN] },
        status: UserStatus.ACTIVE,
      },
      include: {
        adminProfile: true,
      },
    });

    return admin;
  }

  /**
   * Generate JWT tokens
   */
  private async generateTokens(
    admin: any,
  ): Promise<Omit<AdminAuthResponseDto, 'admin'>> {
    const payload: AdminJwtPayload = {
      sub: admin.id,
      email: admin.email,
      role: admin.role,
      type: 'admin',
      regions: [], // Admins don't have regional assignments
    };

    const accessToken = this.jwtService.sign(payload as any);
    const refreshToken = this.jwtService.sign({
      sub: admin.id,
      type: 'admin-refresh',
    } as any);

    return {
      accessToken,
      refreshToken,
      expiresIn: 86400, // 24 hours
      tokenType: 'Bearer',
    };
  }

  /**
   * Handle failed login attempt
   */
  private async handleFailedLogin(adminId: string): Promise<void> {
    const profile = await this.prisma.adminProfile.findUnique({
      where: { userId: adminId },
    });

    if (!profile) return;

    const newAttempts = profile.loginAttempts + 1;
    const maxAttempts = 5;

    const updateData: any = { loginAttempts: newAttempts };

    // Lock account if too many failed attempts
    if (newAttempts >= maxAttempts) {
      updateData.accountLockUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
    }

    await this.prisma.adminProfile.update({
      where: { userId: adminId },
      data: updateData,
    });
  }

  /**
   * Reset failed login attempts
   */
  private async resetFailedLoginAttempts(adminId: string): Promise<void> {
    await this.prisma.adminProfile.updateMany({
      where: { userId: adminId },
      data: {
        loginAttempts: 0,
        accountLockUntil: null,
      },
    });
  }

  /**
   * Create admin session
   */
  private async createAdminSession(
    adminId: string,
    refreshToken: string,
    request: any,
  ): Promise<void> {
    await this.prisma.userSession.create({
      data: {
        userId: adminId,
        token: refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        ipAddress: request.ip || null,
        userAgent: request.get('User-Agent') || null,
      },
    });
  }

  /**
   * Transform user to admin profile DTO
   */
  private async transformToAdminProfile(admin: any): Promise<AdminProfileDto> {
    return {
      id: admin.id,
      email: admin.email,
      firstName: admin.firstName,
      lastName: admin.lastName,
      role: admin.role,
      status: admin.status,
      emailVerified: admin.emailVerified,
      lastLogin: admin.lastLogin,
      assignedRegions: [], // Admins don't have regional assignments
      permissions: {
        canModifySystemConfig:
          admin.adminProfile?.canModifySystemConfig ?? false,
        canSuspendAdmins: admin.adminProfile?.canSuspendAdmins ?? false,
        canChangeUserRoles: admin.adminProfile?.canChangeUserRoles ?? false,
        canChangeUserEmails: admin.adminProfile?.canChangeUserEmails ?? false,
      },
      createdAt: admin.createdAt,
      updatedAt: admin.updatedAt,
    };
  }

  /**
   * Log admin audit events
   */
  private async logAdminAuditEvent(
    adminId: string,
    action: AdminAction,
    resource: string,
    resourceId: string | null,
    request?: any,
    metadata?: any,
  ): Promise<void> {
    try {
      await this.prisma.adminAuditLog.create({
        data: {
          adminId,
          action: action as any,
          resource: resource as any,
          resourceId,
          metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : null,
          ipAddress: request?.ip || null,
          userAgent: request?.get('User-Agent') || null,
        },
      });
    } catch (error) {
      // Log to application logger if audit log fails
      console.error('Failed to create admin audit log:', error);
    }
  }
}
