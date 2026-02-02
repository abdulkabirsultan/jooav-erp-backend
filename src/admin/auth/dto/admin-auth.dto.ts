import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MinLength,
  IsArray,
  IsOptional,
} from 'class-validator';

export class AdminLoginDto {
  @ApiProperty({
    description: 'Admin email address',
    example: 'superadmin@jooav.com',
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  email: string;

  @ApiProperty({
    description: 'Admin password',
    example: 'password123',
    minLength: 8,
  })
  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  password: string;
}

export class AdminRefreshTokenDto {
  @ApiProperty({
    description: 'Refresh token for renewing access tokens',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsString()
  @IsNotEmpty({ message: 'Refresh token is required' })
  refreshToken: string;
}

export class AdminSeedDto {
  @ApiProperty({
    description: 'Super Admin email address',
    example: 'superadmin@jooav.com',
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;

  @ApiProperty({
    description: 'Admin password',
    example: 'SuperSecurePassword123!',
    minLength: 12,
  })
  @IsString()
  @MinLength(12, {
    message: 'Admin password must be at least 12 characters long',
  })
  password: string;

  @ApiProperty({
    description: 'Admin first name',
    example: 'John',
  })
  @IsString()
  @IsNotEmpty({ message: 'First name is required' })
  firstName: string;

  @ApiProperty({
    description: 'Admin last name',
    example: 'Doe',
  })
  @IsString()
  @IsNotEmpty({ message: 'Last name is required' })
  lastName: string;
}
