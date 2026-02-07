import { ApiProperty } from '@nestjs/swagger';
import { UserRole, UserStatus } from '@prisma/client';

export class UserProfileDto {
  @ApiProperty({
    description: 'User unique identifier',
    example: 'clk1x2y3z4a5b6c7d8e9f0',
  })
  id: string;

  @ApiProperty({
    description: 'Email address',
    example: 'user@jooav.com',
  })
  email: string;

  @ApiProperty({
    description: 'Username',
    example: 'johndoe',
  })
  username?: string;

  @ApiProperty({
    description: 'First name',
    example: 'John',
  })
  firstName?: string;

  @ApiProperty({
    description: 'Last name',
    example: 'Doe',
  })
  lastName?: string;

  @ApiProperty({
    description: 'Phone number',
    example: '+234-801-234-5678',
  })
  phone?: string;

  @ApiProperty({
    description: 'Avatar URL',
    example: 'https://example.com/avatar.jpg',
  })
  avatar?: string;

  @ApiProperty({
    description: 'User role',
    enum: UserRole,
    example: UserRole.WHOLESALER,
  })
  role: UserRole;

  @ApiProperty({
    description: 'User status',
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
    example: '2023-12-08T10:30:00Z',
  })
  lastLogin?: Date;

  @ApiProperty({
    description: 'Account creation timestamp',
    example: '2023-12-01T10:30:00Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Account last update timestamp',
    example: '2023-12-08T10:30:00Z',
  })
  updatedAt: Date;
}

export class AuthResponseDto {
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
    description: 'User information',
    type: () => UserProfileDto,
  })
  user: UserProfileDto;
}

export class TokenValidationDto {
  @ApiProperty({
    description: 'Token validity status',
    example: true,
  })
  valid: boolean;

  @ApiProperty({
    description: 'User information if token is valid',
    type: UserProfileDto,
    required: false,
  })
  user?: UserProfileDto;

  @ApiProperty({
    description: 'Token expiration timestamp',
    example: '2023-12-09T10:30:00Z',
  })
  expiresAt?: Date;
}

export class SessionDto {
  @ApiProperty({
    description: 'Session unique identifier',
    example: 'clk1x2y3z4a5b6c7d8e9f0',
  })
  id: string;

  @ApiProperty({
    description: 'Session token',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  token: string;

  @ApiProperty({
    description: 'Session expiration time',
    example: '2023-12-09T10:30:00Z',
  })
  expiresAt: Date;

  @ApiProperty({
    description: 'IP address',
    example: '192.168.1.1',
    nullable: true,
  })
  ipAddress: string | null;

  @ApiProperty({
    description: 'User agent',
    example: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)...',
    nullable: true,
  })
  userAgent: string | null;

  @ApiProperty({
    description: 'Session creation time',
    example: '2023-12-08T10:30:00Z',
  })
  createdAt: Date;
}
