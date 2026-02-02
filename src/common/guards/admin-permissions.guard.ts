import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../modules/prisma/prisma.service';

export const ADMIN_PERMISSIONS_KEY = 'adminPermissions';

/**
 * Decorator to specify required admin permissions for an endpoint
 * @param permissions Array of permission names that the admin must have
 */
export const RequireAdminPermissions = (...permissions: string[]) =>
  SetMetadata(ADMIN_PERMISSIONS_KEY, permissions);

@Injectable()
export class AdminPermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      ADMIN_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions) {
      return true; // No permissions required
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // Only check permissions for admin roles
    if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
      throw new ForbiddenException('Admin permissions required');
    }

    // SUPER_ADMIN always has all permissions
    if (user.role === 'SUPER_ADMIN') {
      return true;
    }

    // For regular ADMIN, check specific permissions
    const adminProfile = await this.prisma.adminProfile.findUnique({
      where: { userId: user.id },
    });

    if (!adminProfile) {
      throw new ForbiddenException('Admin profile not found');
    }

    // Check each required permission
    for (const permission of requiredPermissions) {
      const hasPermission = this.checkPermission(adminProfile, permission);
      if (!hasPermission) {
        throw new ForbiddenException(`Missing permission: ${permission}`);
      }
    }

    return true;
  }

  private checkPermission(adminProfile: any, permission: string): boolean {
    switch (permission) {
      case 'canModifySystemConfig':
        return adminProfile.canModifySystemConfig;
      case 'canSuspendAdmins':
        return adminProfile.canSuspendAdmins;
      case 'canChangeUserRoles':
        return adminProfile.canChangeUserRoles;
      case 'canChangeUserEmails':
        return adminProfile.canChangeUserEmails;
      default:
        return false;
    }
  }
}
