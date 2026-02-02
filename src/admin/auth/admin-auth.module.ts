import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { AdminAuthService } from './admin-auth.service';
import { AdminAuthController } from './admin-auth.controller';
import { PrismaService } from '../../modules/prisma/prisma.service';
import { AuditService } from '../../modules/audit/audit.service';

// Strategies
import { AdminJwtStrategy } from './strategies/admin-jwt.strategy';
import { AdminJwtRefreshStrategy } from './strategies/admin-jwt-refresh.strategy';

// Guards
import { AdminJwtAuthGuard } from './guards/admin-jwt-auth.guard';
import { AdminRolesGuard } from './guards/admin-roles.guard';

@Module({
  imports: [
    ConfigModule,
    PassportModule.register({ defaultStrategy: 'admin-jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get('security.jwtSecret'),
        signOptions: {
          expiresIn: configService.get('security.jwtExpiresIn'),
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AdminAuthController],
  providers: [
    AdminAuthService,
    PrismaService,
    AuditService,

    // Strategies
    AdminJwtStrategy,
    AdminJwtRefreshStrategy,

    // Guards
    AdminJwtAuthGuard,
    AdminRolesGuard,
  ],
  exports: [AdminAuthService, AdminJwtAuthGuard, AdminRolesGuard],
})
export class AdminAuthModule {}
