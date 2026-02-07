import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  IsOptional,
  IsEnum,
  MinLength,
  MaxLength,
  IsPhoneNumber,
  IsDateString,
  IsBoolean,
} from 'class-validator';
import { UserRole, UserStatus } from '@prisma/client';

export class CreateUserDto {
  @ApiProperty({
    description: 'Email address',
    example: 'user@jooav.com',
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;

  @ApiProperty({
    description: 'Username (optional)',
    example: 'johndoe',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MinLength(3, { message: 'Username must be at least 3 characters long' })
  @MaxLength(30, { message: 'Username cannot exceed 30 characters' })
  username?: string;

  @ApiProperty({
    description: 'First name',
    example: 'John',
  })
  @IsString()
  @MinLength(2, { message: 'First name must be at least 2 characters long' })
  @MaxLength(50, { message: 'First name cannot exceed 50 characters' })
  firstName: string;

  @ApiProperty({
    description: 'Last name',
    example: 'Doe',
  })
  @IsString()
  @MinLength(2, { message: 'Last name must be at least 2 characters long' })
  @MaxLength(50, { message: 'Last name cannot exceed 50 characters' })
  lastName: string;

  @ApiProperty({
    description: 'Phone number (optional)',
    example: '+234-801-234-5678',
    required: false,
  })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({
    description: 'User role',
    enum: UserRole,
    example: UserRole.WHOLESALER,
  })
  @IsEnum(UserRole)
  role: UserRole;

  @ApiProperty({
    description: 'User status',
    enum: UserStatus,
    example: UserStatus.ACTIVE,
    required: false,
  })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}

export class UpdateUserDto {
  @ApiProperty({
    description: 'Username (optional)',
    example: 'johndoe',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MinLength(3, { message: 'Username must be at least 3 characters long' })
  @MaxLength(30, { message: 'Username cannot exceed 30 characters' })
  username?: string;

  @ApiProperty({
    description: 'First name',
    example: 'John',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'First name must be at least 2 characters long' })
  @MaxLength(50, { message: 'First name cannot exceed 50 characters' })
  firstName?: string;

  @ApiProperty({
    description: 'Last name',
    example: 'Doe',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Last name must be at least 2 characters long' })
  @MaxLength(50, { message: 'Last name cannot exceed 50 characters' })
  lastName?: string;

  @ApiProperty({
    description: 'Phone number',
    example: '+234-801-234-5678',
    required: false,
  })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({
    description: 'Avatar URL',
    example: 'https://example.com/avatar.jpg',
    required: false,
  })
  @IsOptional()
  @IsString()
  avatar?: string;
}

export class UpdateUserStatusDto {
  @ApiProperty({
    description: 'User status',
    enum: UserStatus,
    example: UserStatus.ACTIVE,
  })
  @IsEnum(UserStatus)
  status: UserStatus;
}

export class UpdateUserRoleDto {
  @ApiProperty({
    description: 'User role',
    enum: UserRole,
    example: UserRole.WHOLESALER,
  })
  @IsEnum(UserRole)
  role: UserRole;
}

export class UpdateUserProfileDto {
  @ApiProperty({
    description: 'Address',
    example: '123 Main Street',
    required: false,
  })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({
    description: 'City',
    example: 'Lagos',
    required: false,
  })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiProperty({
    description: 'State',
    example: 'Lagos State',
    required: false,
  })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiProperty({
    description: 'Country',
    example: 'Nigeria',
    required: false,
  })
  @IsOptional()
  @IsString()
  country?: string;
}

export class UpdateAdminPermissionsDto {
  @ApiProperty({
    description: 'Can modify system configuration',
    example: false,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  canModifySystemConfig?: boolean;

  @ApiProperty({
    description: 'Can suspend other admins',
    example: false,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  canSuspendAdmins?: boolean;

  @ApiProperty({
    description: 'Can change user roles',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  canChangeUserRoles?: boolean;

  @ApiProperty({
    description: 'Can change user emails',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  canChangeUserEmails?: boolean;

  @ApiProperty({
    description: 'Assigned regions for management',
    example: ['NG-LA', 'NG-AB'],
    required: false,
  })
  @IsOptional()
  assignedRegions?: string[];
}
