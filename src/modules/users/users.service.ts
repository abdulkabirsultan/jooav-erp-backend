import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { UserRole, UserStatus, User } from '@prisma/client';
import * as argon2 from 'argon2';

import { PrismaService } from '../prisma/prisma.service';
import { generatePasswordResetToken } from '../../common/utils/token.util';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../email/email.service';
import { ConfigService } from '@nestjs/config';
import { PaginationDto, PaginatedResponse } from '../../common/dto';
import {
  CreateUserDto,
  UpdateUserDto,
  UpdateUserStatusDto,
  UpdateUserRoleDto,
  UpdateUserProfileDto,
  UpdateAdminPermissionsDto,
} from './dto/user.dto';
import { UserProfileDto } from '../auth/dto/auth-response.dto';

@Injectable()
export class UsersService {
  private readonly argon2Options = {
    memoryCost: 65536, // 64MB
    timeCost: 3,
    parallelism: 1,
    type: argon2.argon2id,
  };

  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
    private emailService: EmailService,
    private configService: ConfigService,
  ) {}

  // ================================
  // USER CRUD OPERATIONS
  // ================================

  /**
   * Get all users with pagination and filtering
   */
  async findAll(
    paginationDto: PaginationDto,
    filters?: {
      role?: UserRole;
      status?: UserStatus;
      search?: string;
    },
    currentUserId?: string,
  ): Promise<PaginatedResponse<UserProfileDto>> {
    const { page, limit, search } = paginationDto;
    const { role, status } = filters || {};

    // Get current user to check permissions
    const currentUser = currentUserId
      ? await this.prisma.user.findUnique({
          where: { id: currentUserId },
          include: { adminProfile: true },
        })
      : null;

    const where: any = {};

    // Role-based filtering: Regular ADMIN cannot see SUPER_ADMIN or other ADMIN accounts
    if (currentUser && currentUser.role === UserRole.ADMIN) {
      where.role = {
        not: { in: [UserRole.SUPER_ADMIN, UserRole.ADMIN] },
      };
    }

    // Apply filters
    if (role) {
      if (where.role) {
        // Combine with existing role filter
        if (role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN) {
          if (currentUser?.role !== UserRole.SUPER_ADMIN) {
            // Regular admin trying to filter admin roles - deny
            where.role = {
              not: { in: [UserRole.SUPER_ADMIN, UserRole.ADMIN] },
            };
          } else {
            where.role = role;
          }
        } else {
          where.role = role;
        }
      } else {
        where.role = role;
      }
    }
    if (status) where.status = status;

    // Apply search
    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { username: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          username: true,
          firstName: true,
          lastName: true,
          phone: true,
          avatar: true,
          role: true,
          status: true,
          emailVerified: true,
          lastLogin: true,
          createdAt: true,
          updatedAt: true,
          profile: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: ((page || 1) - 1) * (limit || 10),
        take: limit || 10,
      }),
      this.prisma.user.count({ where }),
    ]);

    return new PaginatedResponse(
      users as UserProfileDto[],
      page || 1,
      limit || 10,
      total,
    );
  }

  /**
   * Get user by ID
   */
  async findOne(id: string): Promise<UserProfileDto> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        phone: true,
        avatar: true,
        role: true,
        status: true,
        emailVerified: true,
        lastLogin: true,
        passwordChangedAt: true,
        createdAt: true,
        updatedAt: true,
        profile: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user as UserProfileDto;
  }

  /**
   * Create new user (Admin only)
   */
  async create(
    createUserDto: CreateUserDto,
    createdBy: string,
    request?: any,
  ): Promise<UserProfileDto> {
    // Get current user to check permissions
    const currentUser = await this.prisma.user.findUnique({
      where: { id: createdBy },
      include: { adminProfile: true },
    });

    if (!currentUser) {
      throw new NotFoundException('Current user not found');
    }

    // Check permissions for creating admin accounts
    // Only users with canChangeUserRoles permission can create ADMIN or SUPER_ADMIN accounts
    if (
      (createUserDto.role === UserRole.ADMIN ||
        createUserDto.role === UserRole.SUPER_ADMIN) &&
      !currentUser.adminProfile?.canChangeUserRoles
    ) {
      throw new BadRequestException(
        'Insufficient permissions to create admin accounts',
      );
    }

    // Check if user already exists
    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: createUserDto.email.toLowerCase() },
          ...(createUserDto.username
            ? [{ username: createUserDto.username.toLowerCase() }]
            : []),
        ],
      },
    });

    if (existingUser) {
      const field =
        existingUser.email === createUserDto.email.toLowerCase()
          ? 'email'
          : 'username';
      throw new ConflictException(`User with this ${field} already exists`);
    }

    // Generate a temporary password (will be reset via email)
    const temporaryPassword = this.generateTemporaryPassword();
    const hashedPassword = await argon2.hash(
      temporaryPassword,
      this.argon2Options,
    );
    console.log(temporaryPassword);

    // Create user
    const userData: any = {
      email: createUserDto.email.toLowerCase(),
      username: createUserDto.username?.toLowerCase(),
      password: hashedPassword,
      firstName: createUserDto.firstName,
      lastName: createUserDto.lastName,
      phone: createUserDto.phone,
      role: createUserDto.role,
      status: createUserDto.status || UserStatus.ACTIVE,
      profile: {
        create: {
          // Initialize empty profile
        },
      },
    };

    // Auto-create admin profile for admin roles
    if (
      createUserDto.role === UserRole.SUPER_ADMIN ||
      createUserDto.role === UserRole.ADMIN
    ) {
      const isSuperAdmin = createUserDto.role === UserRole.SUPER_ADMIN;

      userData.adminProfile = {
        create: {
          assignedRegions: [], // Can be updated later
          canModifySystemConfig: isSuperAdmin, // Only SUPER_ADMIN can modify system config
          canSuspendAdmins: isSuperAdmin, // Only SUPER_ADMIN can suspend other admins
          canChangeUserRoles: isSuperAdmin, // Only SUPER_ADMIN can change user roles
          canChangeUserEmails: isSuperAdmin, // Only SUPER_ADMIN can change user emails
        },
      };
    }

    const user = await this.prisma.user.create({
      data: userData,
      include: { profile: true, adminProfile: true },
    });

    // Generate password reset token
    const { token: resetToken, expiresAt } = generatePasswordResetToken(24);

    // Store password reset token
    await this.prisma.passwordReset.create({
      data: {
        email: user.email,
        token: resetToken,
        expiresAt,
      },
    });

    // Send password setup email
    try {
      const resetUrl = `${this.configService.get('email.baseUrl')}/reset-password?token=${resetToken}`;

      await this.emailService.sendTemplatedEmail(user.email, 'passwordSetup', {
        firstName: user.firstName || 'User',
        resetUrl,
        platformName: 'JOOAV ERP',
      });
    } catch (error) {
      // Log email error but don't fail user creation
      console.error('Failed to send password setup email:', error);
    }

    // Log user creation
    await this.auditService.logUserAction(
      createdBy,
      'CREATE_USER',
      'USER',
      user.id,
      {
        email: user.email,
        role: user.role,
      },
      request,
    );

    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword as UserProfileDto;
  }

  /**
   * Update user information
   */
  async update(
    id: string,
    updateUserDto: UpdateUserDto,
    updatedBy: string,
    request?: any,
  ): Promise<UserProfileDto> {
    const existingUser = await this.findOne(id);

    // Get current user to check permissions
    const currentUser = await this.prisma.user.findUnique({
      where: { id: updatedBy },
      include: { adminProfile: true },
    });

    if (!currentUser) {
      throw new NotFoundException('Current user not found');
    }

    // Check permissions for updating admin accounts
    // Only users with canSuspendAdmins permission can update ADMIN or SUPER_ADMIN accounts
    if (
      (existingUser.role === UserRole.ADMIN ||
        existingUser.role === UserRole.SUPER_ADMIN) &&
      !currentUser.adminProfile?.canSuspendAdmins
    ) {
      throw new BadRequestException(
        'Insufficient permissions to update admin accounts',
      );
    }

    // Check for conflicts if username is being updated
    if (updateUserDto.username) {
      const conflictUser = await this.prisma.user.findFirst({
        where: {
          username: updateUserDto.username.toLowerCase(),
          id: { not: id },
        },
      });

      if (conflictUser) {
        throw new ConflictException('Username already taken');
      }
    }

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: {
        ...updateUserDto,
        username: updateUserDto.username?.toLowerCase(),
        updatedAt: new Date(),
      },
      select: {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        phone: true,
        avatar: true,
        role: true,
        status: true,
        emailVerified: true,
        lastLogin: true,
        createdAt: true,
        updatedAt: true,
        profile: true,
      },
    });

    // Log user update
    await this.auditService.logDataChange(
      updatedBy,
      'UPDATE_USER',
      'USER',
      id,
      existingUser,
      updatedUser,
      request,
    );

    return updatedUser as UserProfileDto;
  }

  /**
   * Update user status
   */
  async updateStatus(
    id: string,
    updateStatusDto: UpdateUserStatusDto,
    updatedBy: string,
    request?: any,
  ): Promise<UserProfileDto> {
    const existingUser = await this.findOne(id);

    // Get current user to check permissions
    const currentUser = await this.prisma.user.findUnique({
      where: { id: updatedBy },
      include: { adminProfile: true },
    });

    if (!currentUser) {
      throw new NotFoundException('Current user not found');
    }

    // Check permissions for status updates
    // Only users with canSuspendAdmins permission can update admin account status
    if (
      (existingUser.role === UserRole.ADMIN ||
        existingUser.role === UserRole.SUPER_ADMIN) &&
      !currentUser.adminProfile?.canSuspendAdmins
    ) {
      throw new BadRequestException(
        'Insufficient permissions to update admin account status',
      );
    }

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: {
        status: updateStatusDto.status,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        phone: true,
        avatar: true,
        role: true,
        status: true,
        emailVerified: true,
        lastLogin: true,
        createdAt: true,
        updatedAt: true,
        profile: true,
      },
    });

    // If user is being deactivated, invalidate all sessions
    if (updateStatusDto.status !== UserStatus.ACTIVE) {
      await this.prisma.userSession.deleteMany({
        where: { userId: id },
      });
    }

    // Log status change
    await this.auditService.logDataChange(
      updatedBy,
      'UPDATE_USER_STATUS',
      'USER',
      id,
      { status: existingUser.status },
      { status: updatedUser.status },
      request,
    );

    return updatedUser as UserProfileDto;
  }

  /**
   * Update user role
   */
  async updateRole(
    id: string,
    updateRoleDto: UpdateUserRoleDto,
    updatedBy: string,
    request?: any,
  ): Promise<UserProfileDto> {
    const existingUser = await this.findOne(id);

    // Get current user to check permissions
    const currentUser = await this.prisma.user.findUnique({
      where: { id: updatedBy },
      include: { adminProfile: true },
    });

    if (!currentUser) {
      throw new NotFoundException('Current user not found');
    }

    // Check permissions for role updates
    // Only users with canChangeUserRoles permission can update roles of admin accounts or create new admin accounts
    if (
      (existingUser.role === UserRole.ADMIN ||
        existingUser.role === UserRole.SUPER_ADMIN ||
        updateRoleDto.role === UserRole.ADMIN ||
        updateRoleDto.role === UserRole.SUPER_ADMIN) &&
      !currentUser.adminProfile?.canChangeUserRoles
    ) {
      throw new BadRequestException(
        'Insufficient permissions to manage admin account roles',
      );
    }

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: {
        role: updateRoleDto.role,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        phone: true,
        avatar: true,
        role: true,
        status: true,
        emailVerified: true,
        lastLogin: true,
        createdAt: true,
        updatedAt: true,
        profile: true,
      },
    });

    // Log role change
    await this.auditService.logDataChange(
      updatedBy,
      'UPDATE_USER_ROLE',
      'USER',
      id,
      { role: existingUser.role },
      { role: updatedUser.role },
      request,
    );

    return updatedUser as UserProfileDto;
  }

  /**
   * Update user profile
   */
  async updateProfile(
    id: string,
    updateProfileDto: UpdateUserProfileDto,
    updatedBy: string,
    request?: any,
  ): Promise<UserProfileDto> {
    const user = await this.findOne(id);

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: {
        profile: {
          upsert: {
            create: updateProfileDto,
            update: updateProfileDto,
          },
        },
        updatedAt: new Date(),
      },
      select: {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        phone: true,
        avatar: true,
        role: true,
        status: true,
        emailVerified: true,
        lastLogin: true,
        createdAt: true,
        updatedAt: true,
        profile: true,
      },
    });

    // Log profile update
    await this.auditService.logUserAction(
      updatedBy,
      'UPDATE_PROFILE',
      'USER',
      id,
      updateProfileDto,
      request,
    );

    return updatedUser as UserProfileDto;
  }

  /**
   * Update admin permissions (Super Admin only)
   */
  async updateAdminPermissions(
    id: string,
    updatePermissionsDto: UpdateAdminPermissionsDto,
    updatedBy: string,
    request?: any,
  ): Promise<UserProfileDto> {
    const existingUser = await this.findOne(id);

    // Get current user to check permissions
    const currentUser = await this.prisma.user.findUnique({
      where: { id: updatedBy },
      include: { adminProfile: true },
    });

    if (!currentUser) {
      throw new NotFoundException('Current user not found');
    }

    // Only SUPER_ADMIN can update admin permissions
    if (currentUser.role !== UserRole.SUPER_ADMIN) {
      throw new BadRequestException(
        'Only Super Admin can update admin permissions',
      );
    }

    // Target user must be an admin
    if (
      existingUser.role !== UserRole.ADMIN &&
      existingUser.role !== UserRole.SUPER_ADMIN
    ) {
      throw new BadRequestException(
        'Permissions can only be updated for admin accounts',
      );
    }

    // Prevent updating own permissions
    if (existingUser.id === updatedBy) {
      throw new BadRequestException('Cannot update your own permissions');
    }

    // Get current admin profile
    const currentAdminProfile = await this.prisma.adminProfile.findUnique({
      where: { userId: id },
    });

    if (!currentAdminProfile) {
      throw new NotFoundException('Admin profile not found');
    }

    // Update admin permissions
    await this.prisma.adminProfile.update({
      where: { userId: id },
      data: {
        canModifySystemConfig:
          updatePermissionsDto.canModifySystemConfig ??
          currentAdminProfile.canModifySystemConfig,
        canSuspendAdmins:
          updatePermissionsDto.canSuspendAdmins ??
          currentAdminProfile.canSuspendAdmins,
        canChangeUserRoles:
          updatePermissionsDto.canChangeUserRoles ??
          currentAdminProfile.canChangeUserRoles,
        canChangeUserEmails:
          updatePermissionsDto.canChangeUserEmails ??
          currentAdminProfile.canChangeUserEmails,
        assignedRegions:
          updatePermissionsDto.assignedRegions ??
          currentAdminProfile.assignedRegions,
        updatedAt: new Date(),
      },
    });

    // Get updated user with admin profile
    const updatedUser = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        phone: true,
        avatar: true,
        role: true,
        status: true,
        emailVerified: true,
        lastLogin: true,
        createdAt: true,
        updatedAt: true,
        profile: true,
        adminProfile: true,
      },
    });

    // Log permission change
    await this.auditService.logDataChange(
      updatedBy,
      'UPDATE_ADMIN_PERMISSIONS',
      'ADMIN_PROFILE',
      id,
      {
        canModifySystemConfig: currentAdminProfile.canModifySystemConfig,
        canSuspendAdmins: currentAdminProfile.canSuspendAdmins,
        canChangeUserRoles: currentAdminProfile.canChangeUserRoles,
        canChangeUserEmails: currentAdminProfile.canChangeUserEmails,
        assignedRegions: currentAdminProfile.assignedRegions,
      },
      updatePermissionsDto,
      request,
    );

    return updatedUser as UserProfileDto;
  }

  /**
   * Soft delete user (set status to deactivated)
   */
  async remove(id: string, deletedBy: string, request?: any): Promise<void> {
    const user = await this.findOne(id);

    // Get current user to check permissions
    const currentUser = await this.prisma.user.findUnique({
      where: { id: deletedBy },
      include: { adminProfile: true },
    });

    if (!currentUser) {
      throw new NotFoundException('Current user not found');
    }

    // Check permissions for deleting admin accounts
    // Only users with canSuspendAdmins permission can delete ADMIN or SUPER_ADMIN accounts
    if (
      (user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN) &&
      !currentUser.adminProfile?.canSuspendAdmins
    ) {
      throw new BadRequestException(
        'Insufficient permissions to delete admin accounts',
      );
    }

    // Prevent super admin from deleting themselves
    if (user.id === deletedBy && user.role === UserRole.SUPER_ADMIN) {
      throw new BadRequestException('Super Admin cannot delete themselves');
    }

    // Soft delete by setting status to deactivated
    await this.prisma.user.update({
      where: { id },
      data: {
        status: UserStatus.DEACTIVATED,
        updatedAt: new Date(),
      },
    });

    // Invalidate all user sessions
    await this.prisma.userSession.deleteMany({
      where: { userId: id },
    });

    // Log user deletion
    await this.auditService.logUserAction(
      deletedBy,
      'DELETE_USER',
      'USER',
      id,
      { email: user.email },
      request,
    );
  }

  // ================================
  // UTILITY METHODS
  // ================================

  /**
   * Get user statistics
   */
  async getUserStats() {
    const [totalUsers, activeUsers, deactivatedUsers, adminUsers] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.user.count({ where: { status: UserStatus.ACTIVE } }),
        this.prisma.user.count({ where: { status: UserStatus.DEACTIVATED } }),
        this.prisma.user.count({
          where: {
            role: { in: [UserRole.SUPER_ADMIN, UserRole.ADMIN] },
          },
        }),
      ]);

    return {
      totalUsers,
      activeUsers,
      deactivatedUsers,
      adminUsers,
      usersByRole: await this.getUsersByRole(),
      recentRegistrations: await this.getRecentRegistrations(),
    };
  }

  /**
   * Get users grouped by role
   */
  private async getUsersByRole() {
    const roles = await this.prisma.user.groupBy({
      by: ['role'],
      _count: { id: true },
    });

    return roles.map((role) => ({
      role: role.role,
      count: role._count.id,
    }));
  }

  /**
   * Get recent registrations (last 30 days)
   */
  private async getRecentRegistrations() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    return this.prisma.user.count({
      where: {
        createdAt: {
          gte: thirtyDaysAgo,
        },
      },
    });
  }

  /**
   * Generate temporary password for new users
   */
  private generateTemporaryPassword(): string {
    const chars =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let result = '';

    // Ensure password meets complexity requirements
    result += 'A'; // Uppercase
    result += 'a'; // Lowercase
    result += '1'; // Number
    result += '!'; // Special char

    // Add 8 more random characters
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    return result;
  }

  /**
   * Get user activity log (Admin only)
   */
  async getUserActivity(userId: string, paginationDto: PaginationDto) {
    // Verify user exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Get audit logs for this user
    const { page = 1, limit = 10 } = paginationDto;
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: { userId: userId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.auditLog.count({ where: { userId: userId } }),
    ]);

    return {
      data: logs,
      meta: {
        page,
        limit,
        totalItems: total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPreviousPage: page > 1,
      },
    };
  }
}
