import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthService } from '../auth.service';
import { CacheService } from '../../cache/cache.service';

export interface JwtPayload {
  sub: string; // user id
  email: string;
  role: string;
  iat?: number;
  exp?: number;
  jti?: string; // JWT ID for token tracking
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private authService: AuthService,
    private cacheService: CacheService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('security.jwtSecret') || 'your-secret-key',
    });
  }

  async validate(payload: JwtPayload) {
    const { sub: userId, iat, jti } = payload;

    try {
      // First, check if token is blacklisted (fast Redis check)
      if (jti) {
        const isBlacklisted = await this.cacheService.isTokenBlacklisted(jti);
        if (isBlacklisted) {
          throw new UnauthorizedException('Token has been revoked');
        }
      }

      // Try to get user from cache first (using token issued time)
      if (iat) {
        const cachedUser = await this.cacheService.getUserFromCache(
          userId,
          iat,
        );
        if (cachedUser) {
          // Validate cached user data
          if (cachedUser.status !== 'ACTIVE') {
            throw new UnauthorizedException('User not found or inactive');
          }

          // Check if token was issued before password change (if cached data has this info)
          if (cachedUser.passwordChangedAt && iat) {
            const passwordChangedTimestamp = Math.floor(
              new Date(cachedUser.passwordChangedAt).getTime() / 1000,
            );
            if (iat < passwordChangedTimestamp) {
              // Invalidate cache for this user since password changed
              await this.cacheService.invalidateUserCache(userId);
              throw new UnauthorizedException(
                'Token invalidated due to password change',
              );
            }
          }

          return cachedUser;
        }
      }

      // Cache miss - get user from database
      const user = await this.authService.validateUserById(userId);
      if (!user) {
        throw new UnauthorizedException('User not found or inactive');
      }

      // Check if token was issued before password change
      if (user.passwordChangedAt && iat) {
        const passwordChangedTimestamp = Math.floor(
          user.passwordChangedAt.getTime() / 1000,
        );
        if (iat < passwordChangedTimestamp) {
          throw new UnauthorizedException(
            'Token invalidated due to password change',
          );
        }
      }

      // Cache the user for future requests (15-minute TTL)
      if (iat) {
        await this.cacheService.setUserInCache(user, iat, 900);
      }

      return user;
    } catch (error) {
      // If it's already an UnauthorizedException, re-throw it
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      // For other errors, log and fall back to database validation
      console.warn('JWT validation cache error:', error.message);

      // Fallback to original database validation
      const user = await this.authService.validateUserById(userId);
      if (!user) {
        throw new UnauthorizedException('User not found or inactive');
      }

      // Check password change timestamp
      if (user.passwordChangedAt && iat) {
        const passwordChangedTimestamp = Math.floor(
          user.passwordChangedAt.getTime() / 1000,
        );
        if (iat < passwordChangedTimestamp) {
          throw new UnauthorizedException(
            'Token invalidated due to password change',
          );
        }
      }

      return user;
    }
  }
}
