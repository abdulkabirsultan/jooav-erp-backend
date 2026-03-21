import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UserRole } from '@prisma/client';
import { AdminAuthService } from '../admin-auth.service';

export interface AdminJwtPayload {
  sub: string; // admin user id
  email: string;
  role: UserRole;
  type: 'admin'; // Distinguish admin tokens from regular user tokens
  regions?: string[]; // Assigned regions
  iat?: number;
  exp?: number;
}

@Injectable()
export class AdminJwtStrategy extends PassportStrategy(Strategy, 'admin-jwt') {
  constructor(
    private configService: ConfigService,
    private adminAuthService: AdminAuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('security.jwtSecret') || 'your-secret-key',
    });
  }

  async validate(payload: AdminJwtPayload) {
    // Ensure this is an admin token
    if (payload.type !== 'admin') {
      throw new UnauthorizedException('Invalid admin token');
    }

    // Ensure the user has admin privileges (SUPER_ADMIN, ADMIN, or PROCUREMENT_OFFICER)
    if (
      payload.role !== UserRole.SUPER_ADMIN &&
      payload.role !== UserRole.ADMIN &&
      payload.role !== UserRole.PROCUREMENT_OFFICER
    ) {
      throw new UnauthorizedException('Admin privileges required');
    }

    // Validate that the admin user still exists and is active
    const admin = await this.adminAuthService.validateAdminById(payload.sub);
    if (!admin) {
      throw new UnauthorizedException('Admin account not found or inactive');
    }

    // Check if token was issued before password change
    if (admin.passwordChangedAt && payload.iat) {
      const passwordChangedTimestamp = Math.floor(
        admin.passwordChangedAt.getTime() / 1000,
      );
      if (payload.iat < passwordChangedTimestamp) {
        throw new UnauthorizedException(
          'Token invalidated due to password change',
        );
      }
    }

    return admin;
  }
}
