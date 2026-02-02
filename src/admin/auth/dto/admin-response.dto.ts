import { ApiProperty } from '@nestjs/swagger';
import { UserRole, UserStatus } from '@prisma/client';

export class AdminProfileDto {
  @ApiProperty({
    description: 'Admin unique identifier',
    example: 'clk1x2y3z4a5b6c7d8e9f0',
  })
  id: string;

  @ApiProperty({
    description: 'Admin email address',
    example: 'admin@jooav.com',
  })
  email: string;

  @ApiProperty({
    description: 'Admin first name',
    example: 'John',
  })
  firstName?: string;

  @ApiProperty({
    description: 'Admin last name',
    example: 'Doe',
  })
  lastName?: string;

  @ApiProperty({
    description:
      'Admin role in the platform (SUPER_ADMIN, ADMIN, PROCUREMENT_OFFICER, SME_USER)',
    enum: UserRole,
    example: UserRole.SUPER_ADMIN,
  })
  role: UserRole;

  @ApiProperty({
    description: 'Admin account status',
    enum: UserStatus,
    example: UserStatus.ACTIVE,
  })
  status: UserStatus;

  @ApiProperty({
    description: 'Email verification status',
    example: true,
  })
  emailVerified: boolean;

  @ApiProperty({
    description: 'Last login timestamp',
    example: '2023-12-15T10:30:00Z',
  })
  lastLogin?: Date;

  @ApiProperty({
    description: 'Assigned regions for management',
    example: ['NG-LA', 'NG-AB', 'NG-KC'],
  })
  assignedRegions: string[];

  @ApiProperty({
    description: 'Platform permissions',
    example: {
      canModifySystemConfig: false,
      canSuspendAdmins: true,
      canChangeUserRoles: true,
      canChangeUserEmails: true,
    },
  })
  permissions: {
    canModifySystemConfig: boolean;
    canSuspendAdmins: boolean;
    canChangeUserRoles: boolean;
    canChangeUserEmails: boolean;
  };

  @ApiProperty({
    description: 'Account creation timestamp',
    example: '2023-12-01T10:30:00Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Account last update timestamp',
    example: '2023-12-15T10:30:00Z',
  })
  updatedAt: Date;
}

export class AdminAuthResponseDto {
  @ApiProperty({
    description: 'Access token for API requests',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  accessToken: string;

  @ApiProperty({
    description: 'Refresh token for renewing access tokens',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  refreshToken: string;

  @ApiProperty({
    description: 'Token expiration time in seconds',
    example: 86400,
  })
  expiresIn: number;

  @ApiProperty({
    description: 'Token type',
    example: 'Bearer',
  })
  tokenType: string;

  @ApiProperty({
    description: 'Admin profile information',
    type: () => AdminProfileDto,
  })
  admin: AdminProfileDto;
}

export class AdminPermissionsDto {
  @ApiProperty({
    description: 'Admin role in the platform',
    enum: UserRole,
    example: UserRole.ADMIN,
  })
  role: UserRole;

  @ApiProperty({
    description: 'Assigned regions for management',
    example: ['NG-LA', 'NG-AB'],
  })
  assignedRegions: string[];

  @ApiProperty({
    description: 'Platform-specific permissions',
    example: {
      manufacturers: {
        create: true,
        read: true,
        update: true,
        delete: true,
        approve: true,
      },
      smeUsers: {
        create: false,
        read: true,
        update: true,
        delete: false,
        approve: true,
      },
      subAdmins: {
        create: true,
        read: true,
        update: true,
        delete: true,
        assign: true,
      },
      orders: {
        read: true,
        update: true,
        cancel: true,
        override: true,
      },
      analytics: {
        access: true,
        export: true,
      },
      systemConfig: {
        read: true,
        update: false,
      },
    },
  })
  permissions: {
    manufacturers: {
      create: boolean;
      read: boolean;
      update: boolean;
      delete: boolean;
      approve: boolean;
    };
    smeUsers: {
      create: boolean;
      read: boolean;
      update: boolean;
      delete: boolean;
      approve: boolean;
    };
    subAdmins: {
      create: boolean;
      read: boolean;
      update: boolean;
      delete: boolean;
      assign: boolean;
    };
    orders: {
      read: boolean;
      update: boolean;
      cancel: boolean;
      override: boolean;
    };
    analytics: {
      access: boolean;
      export: boolean;
    };
    systemConfig: {
      read: boolean;
      update: boolean;
    };
  };
}
