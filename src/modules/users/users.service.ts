import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UserRole, UserStatus, User, OrderStatus } from '@prisma/client';
import * as argon2 from 'argon2';

import { PrismaService } from '../prisma/prisma.service';
import { generatePasswordResetToken } from '../../common/utils/token.util';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../email/services/notification.service';
import { CacheService } from '../cache/cache.service';
import { CacheInvalidationService } from '../cache/cache-invalidation.service';
import { ConfigService } from '@nestjs/config';
import { PaginationDto, PaginatedResponse } from '../../common/dto';
import {
  CreateUserDto,
  UpdateUserDto,
  UpdateUserStatusDto,
  UpdateUserRoleDto,
  UpdateUserProfileDto,
  UpdateAdminPermissionsDto,
  AddWholesalerUserAddressDto,
  WholesalerUserAddressListDto,
} from './dto/user.dto';
import { BulkDeleteUserDto } from './dto/bulk-delete-user.dto';
import { UserProfileDto } from '../auth/dto/auth-response.dto';
import { BulkDeleteResultDto } from '../../common/dto';
import { EmailEvent } from '../email/types/email.types';

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
    private notificationService: NotificationService,
    private configService: ConfigService,
    private cacheService: CacheService,
    private cacheInvalidationService: CacheInvalidationService,
    private eventEmitter: EventEmitter2,
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

    // For archived/deactivated users, include soft-deleted users
    // For all other queries, exclude soft-deleted users
    if (status !== UserStatus.DEACTIVATED) {
      where.deletedAt = null;
    }

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
          wholesalerProfile: true,
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

  async findArchived(
    paginationDto: PaginationDto,
    filters?: {
      role?: UserRole;
      search?: string;
    },
    currentUserId?: string,
  ): Promise<PaginatedResponse<UserProfileDto>> {
    return this.findAll(
      paginationDto,
      {
        ...filters,
        status: UserStatus.DEACTIVATED,
      },
      currentUserId,
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
        wholesalerProfile: true,
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

    // Check if user already exists (exclude soft-deleted users)
    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: createUserDto.email.toLowerCase() },
          ...(createUserDto.username
            ? [{ username: createUserDto.username.toLowerCase() }]
            : []),
        ],
        deletedAt: null, // Only check non-deleted users
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

    // Auto-create procurement officer profile
    if (createUserDto.role === UserRole.PROCUREMENT_OFFICER) {
      userData.procurementOfficerProfile = {
        create: {
          availabilityStatus: 'AVAILABLE',
          maxActiveOrders: 5, // Default max orders
          specializations: [], // Can be updated later
          ordersProcessed: 0,
        },
      };
    }

    // Auto-create wholesaler profile
    if (createUserDto.role === UserRole.WHOLESALER) {
      userData.wholesalerProfile = {
        create: {
          totalOrders: 0,
          totalSpent: 0,
        },
      };
    }

    let user = await this.prisma.user.create({
      data: userData,
      include: {
        profile: true,
        adminProfile: true,
        procurementOfficerProfile: true,
        wholesalerProfile: true,
      },
    });

    if (createUserDto.role === UserRole.WHOLESALER) {
      await this.ensureWholesalerDraftCart(user.id);

      const refreshedUser = await this.prisma.user.findUnique({
        where: { id: user.id },
        include: {
          profile: true,
          adminProfile: true,
          procurementOfficerProfile: true,
          wholesalerProfile: true,
        },
      });

      if (refreshedUser) {
        user = refreshedUser;
      }
    }

    // Generate password reset token
    const { token: resetToken, expiresAt } = generatePasswordResetToken(72); // 72 hours validity for initial password setup

    // Store password reset token
    await this.prisma.passwordReset.create({
      data: {
        email: user.email,
        token: resetToken,
        expiresAt,
      },
    });

    const resetBaseUrl =
      user.role === UserRole.WHOLESALER
        ? this.configService.get<string>('email.wholesalerBaseUrl')
        : this.configService.get<string>('email.baseUrl');
    const resetUrl = `${resetBaseUrl}/reset-password?token=${resetToken}`;

    // Send password setup email
    try {
      await this.notificationService.notifyAccountCreatedInvite(
        {
          id: user.id,
          firstName: user.firstName || 'User',
          lastName: user.lastName || '',
          email: user.email,
          role: user.role,
        },
        resetUrl,
        '72 hours',
      );
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

    // Invalidate users cache after creation
    await this.cacheInvalidationService.invalidateUsers();

    return {
      ...userWithoutPassword,
      resetUrl,
      resetTokenExpiry: expiresAt,
    } as UserProfileDto & { resetUrl: string; resetTokenExpiry: Date };
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

    // Check for conflicts if username is being updated (exclude soft-deleted users)
    if (updateUserDto.username) {
      const conflictUser = await this.prisma.user.findFirst({
        where: {
          username: updateUserDto.username.toLowerCase(),
          id: { not: id },
          deletedAt: null, // Exclude soft-deleted users
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

    // Invalidate users cache after update
    await this.cacheInvalidationService.invalidateUsers();

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

    // Prepare update data
    const updateData: any = {
      status: updateStatusDto.status,
      updatedAt: new Date(),
    };

    // If setting to DEACTIVATED, also set deletedAt
    if (updateStatusDto.status === UserStatus.DEACTIVATED) {
      updateData.deletedAt = new Date();
      updateData.deletedBy = updatedBy;
    }

    // If reactivating from DEACTIVATED, clear deletedAt
    if (
      updateStatusDto.status !== UserStatus.DEACTIVATED &&
      existingUser.status === UserStatus.DEACTIVATED
    ) {
      updateData.deletedAt = null;
      updateData.deletedBy = null;
    }

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: updateData,
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

    if (updateStatusDto.status === UserStatus.DEACTIVATED) {
      this.eventEmitter.emit(EmailEvent.USER_ACCOUNT_DEACTIVATED, {
        user: {
          id: updatedUser.id,
          firstName: updatedUser.firstName || '',
          lastName: updatedUser.lastName || '',
          email: updatedUser.email,
        },
        reason: 'Account deactivated by administrator',
      });
    }

    // Invalidate users cache after status update
    await this.cacheInvalidationService.invalidateUsers();

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

    this.eventEmitter.emit(EmailEvent.USER_ROLE_UPDATED, {
      user: {
        id: updatedUser.id,
        firstName: updatedUser.firstName || '',
        lastName: updatedUser.lastName || '',
        email: updatedUser.email,
      },
      previousRole: existingUser.role,
      newRole: updatedUser.role,
    });

    // Invalidate users cache after role update
    await this.cacheInvalidationService.invalidateUsers();

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

    // Invalidate users cache after profile update
    await this.cacheInvalidationService.invalidateUsers();

    return updatedUser as UserProfileDto;
  }

  async addMyUserAddress(
    userId: string,
    addAddressDto: AddWholesalerUserAddressDto,
  ): Promise<WholesalerUserAddressListDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { wholesalerProfile: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.role !== UserRole.WHOLESALER) {
      throw new BadRequestException(
        'Only wholesalers can manage user addresses',
      );
    }

    if (!user.wholesalerProfile) {
      throw new NotFoundException('Wholesaler profile not found');
    }

    const existingAddresses = Array.isArray(user.wholesalerProfile.userAddress)
      ? (user.wholesalerProfile.userAddress as any[])
      : [];

    const sanitizedAddress = {
      ...(addAddressDto.address ? { address: addAddressDto.address } : {}),
      ...(addAddressDto.state ? { state: addAddressDto.state } : {}),
      ...(addAddressDto.city ? { city: addAddressDto.city } : {}),
      ...(addAddressDto.phone ? { phone: addAddressDto.phone } : {}),
      ...(addAddressDto.name ? { name: addAddressDto.name } : {}),
    };

    const updatedWholesalerProfile = await this.prisma.wholesaler.update({
      where: { userId },
      data: {
        userAddress: [...existingAddresses, sanitizedAddress],
      },
      select: {
        userAddress: true,
      },
    });

    return {
      userAddress: Array.isArray(updatedWholesalerProfile.userAddress)
        ? (updatedWholesalerProfile.userAddress as any[])
        : [],
    };
  }

  async getMyUserAddresses(
    userId: string,
  ): Promise<WholesalerUserAddressListDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { wholesalerProfile: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.role !== UserRole.WHOLESALER) {
      throw new BadRequestException(
        'Only wholesalers can access user addresses',
      );
    }

    if (!user.wholesalerProfile) {
      throw new NotFoundException('Wholesaler profile not found');
    }

    return {
      userAddress: Array.isArray(user.wholesalerProfile.userAddress)
        ? (user.wholesalerProfile.userAddress as any[])
        : [],
    };
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

    // Invalidate users cache after admin permissions update
    await this.cacheInvalidationService.invalidateUsers();

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

    // Soft delete by setting status to deactivated and marking deletion timestamp
    await this.prisma.user.update({
      where: { id },
      data: {
        status: UserStatus.DEACTIVATED,
        deletedAt: new Date(),
        deletedBy: deletedBy,
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

    this.eventEmitter.emit(EmailEvent.USER_ACCOUNT_DEACTIVATED, {
      user: {
        id: user.id,
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        email: user.email,
      },
      reason: 'Account archived by administrator',
    });

    // Invalidate users cache after removal
    await this.cacheInvalidationService.invalidateUsers();
  }

  /**
   * Delete own account (self-service)
   * Users can delete their own accounts with restrictions
   */
  async deleteMyAccount(userId: string, request?: any): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        assignedOrders: {
          where: {
            status: {
              in: [OrderStatus.IN_PROGRESS, OrderStatus.ASSIGNED],
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check for assigned orders (procurement officers)
    if (
      user.role === UserRole.PROCUREMENT_OFFICER &&
      user.assignedOrders.length > 0
    ) {
      throw new BadRequestException(
        `Cannot delete account with ${user.assignedOrders.length} order(s) in progress. Please complete or reassign all orders first.`,
      );
    }

    // Soft delete by setting status to deactivated and marking deletion timestamp
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        status: UserStatus.DEACTIVATED,
        deletedAt: new Date(),
        deletedBy: null, // null indicates self-delete
        updatedAt: new Date(),
      },
    });

    // Invalidate all user sessions
    await this.prisma.userSession.deleteMany({
      where: { userId },
    });

    // Invalidate user cache
    await this.cacheService.del(`user:${userId}`);

    // Log account deletion
    await this.auditService.logUserAction(
      userId,
      'DELETE_OWN_ACCOUNT',
      'USER',
      userId,
      { email: user.email, role: user.role },
      request,
    );

    // Emit event for notifications
    this.eventEmitter.emit(EmailEvent.USER_ACCOUNT_DEACTIVATED, {
      user: {
        id: user.id,
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        email: user.email,
      },
      reason: 'Account deleted by user',
    });

    // Invalidate users cache after account deletion
    await this.cacheInvalidationService.invalidateUsers();
  }

  /**
   * Reactivate a deleted user account
   * @param id - User ID to reactivate
   * @param activatedBy - ID of admin performing reactivation
   * @returns Reactivated user profile
   */
  async activate(
    id: string,
    activatedBy: string,
    request?: any,
  ): Promise<UserProfileDto> {
    // Find deleted user
    const deletedUser = await this.prisma.user.findFirst({
      where: {
        id,
        deletedAt: { not: null }, // Must be soft-deleted
      },
    });

    if (!deletedUser) {
      throw new NotFoundException('User not found or is not in deleted state');
    }

    // Check for conflicts with active users (same email or username)
    const conflictUser = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: deletedUser.email },
          ...(deletedUser.username ? [{ username: deletedUser.username }] : []),
        ],
        deletedAt: null, // Active user
        NOT: { id }, // Exclude the user being reactivated
      },
    });

    if (conflictUser) {
      const field =
        conflictUser.email === deletedUser.email ? 'email' : 'username';
      throw new ConflictException(
        `Cannot reactivate: another user with this ${field} already exists`,
      );
    }

    // Get current admin user for permission check
    const currentUser = await this.prisma.user.findUnique({
      where: { id: activatedBy },
      include: { adminProfile: true },
    });

    if (!currentUser) {
      throw new NotFoundException('Current user not found');
    }

    // Permission check: reactivating admin accounts requires canSuspendAdmins permission
    if (
      (deletedUser.role === UserRole.ADMIN ||
        deletedUser.role === UserRole.SUPER_ADMIN) &&
      !currentUser.adminProfile?.canSuspendAdmins
    ) {
      throw new BadRequestException(
        'Insufficient permissions to reactivate admin accounts',
      );
    }

    // Reactivate user
    const reactivatedUser = await this.prisma.user.update({
      where: { id },
      data: {
        status: UserStatus.ACTIVE,
        deletedAt: null,
        deletedBy: null,
        updatedAt: new Date(),
      },
      include: {
        profile: true,
        adminProfile: true,
        procurementOfficerProfile: true,
        wholesalerProfile: true,
      },
    });

    // Log activity
    await this.auditService.logUserAction(
      activatedBy,
      'REACTIVATE_USER',
      'USER',
      id,
      {
        reactivatedUserEmail: reactivatedUser.email,
        reactivatedUserRole: reactivatedUser.role,
      },
      request,
    );

    // Invalidate users cache after reactivation
    await this.cacheInvalidationService.invalidateUsers();

    const { password, ...userWithoutPassword } = reactivatedUser;
    return userWithoutPassword as UserProfileDto;
  }

  /**
   * Bulk soft delete users
   */
  async bulkDelete(
    userIds: string[],
    deletedBy: string,
    request?: any,
  ): Promise<{
    deletedCount: number;
    deletedIds: string[];
    failedIds: Array<{ id: string; error: string }>;
  }> {
    const deletedIds: string[] = [];
    const failedIds: Array<{ id: string; error: string }> = [];

    // Get current user to check permissions
    const currentUser = await this.prisma.user.findUnique({
      where: { id: deletedBy },
      include: { adminProfile: true },
    });

    if (!currentUser) {
      throw new NotFoundException('Current user not found');
    }

    // Process each user deletion individually to handle errors gracefully
    for (const userId of userIds) {
      try {
        // Check if user exists and is not already deleted
        const user = await this.prisma.user.findFirst({
          where: {
            id: userId,
            status: { not: UserStatus.DEACTIVATED },
          },
        });

        if (!user) {
          failedIds.push({
            id: userId,
            error: 'User not found or already deleted',
          });
          continue;
        }

        // Check if user is trying to delete themselves
        if (user.id === deletedBy) {
          failedIds.push({
            id: userId,
            error: 'Cannot delete yourself',
          });
          continue;
        }

        // Check permissions for deleting admin accounts
        if (
          (user.role === UserRole.ADMIN ||
            user.role === UserRole.SUPER_ADMIN) &&
          !currentUser.adminProfile?.canSuspendAdmins
        ) {
          failedIds.push({
            id: userId,
            error: 'Insufficient permissions to delete admin accounts',
          });
          continue;
        }

        // Prevent deletion of super admin accounts by anyone
        if (user.role === UserRole.SUPER_ADMIN) {
          failedIds.push({
            id: userId,
            error: 'Super Admin accounts cannot be deleted',
          });
          continue;
        }

        // Perform soft delete
        await this.prisma.user.update({
          where: { id: userId },
          data: {
            status: UserStatus.DEACTIVATED,
            updatedAt: new Date(),
          },
        });

        // Invalidate all user sessions
        await this.prisma.userSession.deleteMany({
          where: { userId },
        });

        // Log user deletion for each user
        await this.auditService.logUserAction(
          deletedBy,
          'BULK_DELETE_USER',
          'USER',
          userId,
          {
            email: user.email,
            bulkOperation: true,
          },
          request,
        );

        this.eventEmitter.emit(EmailEvent.USER_ACCOUNT_DEACTIVATED, {
          user: {
            id: user.id,
            firstName: user.firstName || '',
            lastName: user.lastName || '',
            email: user.email,
          },
          reason: 'Account archived by bulk administrative action',
        });

        deletedIds.push(userId);
      } catch (error) {
        failedIds.push({
          id: userId,
          error:
            error instanceof Error ? error.message : 'Unknown error occurred',
        });
      }
    }

    return {
      deletedCount: deletedIds.length,
      deletedIds,
      failedIds,
    };
  }

  // ================================
  // UTILITY METHODS
  // ================================

  /**
   * Get user activity logs with pagination
   */

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
        deletedAt: null, // Exclude soft-deleted users from registration stats
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

  private async ensureWholesalerDraftCart(
    wholesalerUserId: string,
  ): Promise<string | null> {
    const wholesalerUser = await this.prisma.user.findUnique({
      where: { id: wholesalerUserId },
      include: { wholesalerProfile: true },
    });

    if (
      !wholesalerUser ||
      wholesalerUser.role !== UserRole.WHOLESALER ||
      !wholesalerUser.wholesalerProfile
    ) {
      return null;
    }

    const existingDraftCart = wholesalerUser.wholesalerProfile.draftCart;
    if (existingDraftCart) {
      const existingDraftOrder = await this.prisma.order.findFirst({
        where: {
          orderNumber: existingDraftCart,
          wholesalerId: wholesalerUserId,
          status: OrderStatus.DRAFT,
        },
      });

      if (existingDraftOrder) {
        return existingDraftCart;
      }
    }

    const reusableDraftOrder = await this.prisma.order.findFirst({
      where: {
        wholesalerId: wholesalerUserId,
        status: OrderStatus.DRAFT,
        items: { none: {} },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (reusableDraftOrder) {
      await this.prisma.wholesaler.update({
        where: { userId: wholesalerUserId },
        data: { draftCart: reusableDraftOrder.orderNumber },
      });
      return reusableDraftOrder.orderNumber;
    }

    const draftOrderNumber = await this.generateOrderNumber('DRAFT-');

    await this.prisma.order.create({
      data: {
        orderNumber: draftOrderNumber,
        wholesalerId: wholesalerUserId,
        createdById: wholesalerUserId,
        status: OrderStatus.DRAFT,
        subtotal: 0,
        totalAmount: 0,
        items: {
          create: [], // Start with empty items, can be added to later
        },
      },
    });

    await this.prisma.wholesaler.update({
      where: { userId: wholesalerUserId },
      data: { draftCart: draftOrderNumber },
    });

    return draftOrderNumber;
  }

  private async generateOrderNumber(prefix: string = 'JOO-'): Promise<string> {
    const timestamp = Date.now().toString().slice(-7);
    const random = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, '0');
    return `${prefix}${timestamp}${random}`;
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

  /**
   * Regenerate password reset token for a user (Admin only)
   */
  async regenerateResetToken(
    userId: string,
    requestedBy: string,
    request?: any,
  ): Promise<{ resetUrl: string; resetTokenExpiry: Date }> {
    // Verify user exists
    const user = await this.findOne(userId);

    // Get current user to check permissions
    const currentUser = await this.prisma.user.findUnique({
      where: { id: requestedBy },
      include: { adminProfile: true },
    });

    if (!currentUser) {
      throw new NotFoundException('Current user not found');
    }

    // Check permissions for regenerating reset tokens
    if (
      (user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN) &&
      !currentUser.adminProfile?.canSuspendAdmins
    ) {
      throw new BadRequestException(
        'Insufficient permissions to regenerate reset token for admin accounts',
      );
    }

    // Delete any existing reset tokens for this user
    await this.prisma.passwordReset.deleteMany({
      where: { email: user.email },
    });

    // Generate new password reset token
    const { token: resetToken, expiresAt } = generatePasswordResetToken(24);

    // Store password reset token
    await this.prisma.passwordReset.create({
      data: {
        email: user.email,
        token: resetToken,
        expiresAt,
      },
    });

    // Log token regeneration
    await this.auditService.logUserAction(
      requestedBy,
      'REGENERATE_RESET_TOKEN',
      'USER',
      userId,
      {
        email: user.email,
        tokenExpiry: expiresAt,
      },
      request,
    );

    const resetBaseUrl =
      user.role === UserRole.WHOLESALER
        ? this.configService.get<string>('email.wholesalerBaseUrl')
        : this.configService.get<string>('email.baseUrl');
    const resetUrl = `${resetBaseUrl}/reset-password?token=${resetToken}`;

    return {
      resetUrl,
      resetTokenExpiry: expiresAt,
    };
  }

  /**
   * Get user statistics
   */
  async getUserStats(): Promise<{
    totalUsers: number;
    archived: number;
  }> {
    const [totalUsers, archived] = await Promise.all([
      this.prisma.user.count({
        where: { deletedAt: null }, // Only count active users (not soft-deleted)
      }),
      this.prisma.user.count({
        where: {
          status: UserStatus.DEACTIVATED,
          // Note: We don't filter by deletedAt here because we want both old and new deactivated users
        },
      }),
    ]);

    return {
      totalUsers,
      archived,
    };
  }

  /**
   * Check for user dependencies before deletion
   */
  private async checkUserDependencies(userId: string): Promise<string[]> {
    const dependencies: string[] = [];

    try {
      // Check for created orders
      const ordersCount = await this.prisma.order.count({
        where: { createdById: userId },
      });
      if (ordersCount > 0) {
        dependencies.push(`${ordersCount} orders`);
      }

      // Check for other relations that might prevent deletion
      // Add more dependency checks as needed based on your business logic
    } catch (error) {
      // If we can't check dependencies, assume there are some to be safe
      dependencies.push('unknown dependencies');
    }

    return dependencies;
  }

  async removeMany(
    userIds: string[],
    currentUserId: string,
  ): Promise<BulkDeleteResultDto> {
    const results: Array<{ id: string; success: boolean; error?: string }> = [];

    const currentUser = await this.prisma.user.findUnique({
      where: { id: currentUserId },
      include: { adminProfile: true },
    });

    if (!currentUser) {
      throw new NotFoundException('Current user not found');
    }

    // Process each user deletion individually to handle errors gracefully
    for (const userId of userIds) {
      try {
        // Check if user exists
        const user = await this.prisma.user.findUnique({
          where: { id: userId },
        });

        if (!user) {
          results.push({
            id: userId,
            success: false,
            error: 'User not found',
          });
          continue;
        }

        if (user.status === UserStatus.DEACTIVATED) {
          results.push({
            id: userId,
            success: false,
            error: 'User is already deactivated',
          });
          continue;
        }

        // Prevent user from deleting themselves
        if (userId === currentUserId) {
          results.push({
            id: userId,
            success: false,
            error: 'Cannot delete your own account',
          });
          continue;
        }

        // Check permissions for deleting admin accounts
        if (
          (user.role === UserRole.ADMIN ||
            user.role === UserRole.SUPER_ADMIN) &&
          !currentUser.adminProfile?.canSuspendAdmins
        ) {
          results.push({
            id: userId,
            success: false,
            error: 'Insufficient permissions to delete admin accounts',
          });
          continue;
        }

        // Check if this is the last SUPER_ADMIN
        if (user.role === UserRole.SUPER_ADMIN) {
          const superAdminCount = await this.prisma.user.count({
            where: {
              role: UserRole.SUPER_ADMIN,
              status: UserStatus.ACTIVE,
              deletedAt: null, // Only count active super admins
            },
          });

          if (superAdminCount <= 1) {
            results.push({
              id: userId,
              success: false,
              error: 'Cannot delete the last SUPER_ADMIN user',
            });
            continue;
          }
        }

        await this.prisma.user.update({
          where: { id: userId },
          data: {
            status: UserStatus.DEACTIVATED,
            deletedAt: new Date(),
            deletedBy: currentUserId,
            updatedAt: new Date(),
          },
        });

        await this.prisma.userSession.deleteMany({
          where: { userId },
        });

        results.push({
          id: userId,
          success: true,
        });

        // Invalidate cache
        await this.cacheService.invalidateByTags(['users']);
      } catch (error) {
        results.push({
          id: userId,
          success: false,
          error:
            error instanceof Error ? error.message : 'Unknown error occurred',
        });
      }
    }

    return {
      results,
      totalRequested: userIds.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
    };
  }
}
