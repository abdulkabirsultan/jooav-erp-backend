import {
  IsString,
  IsOptional,
  IsEnum,
  IsNotEmpty,
  MaxLength,
  IsBoolean,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ManufacturerStatus } from '@prisma/client';

export class CreateManufacturerDto {
  @ApiProperty({
    description: 'Manufacturer name',
    example: 'Nestle',
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({
    description: 'Manufacturer description',
    example: 'Leading manufacturer of beverages',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({
    description: 'Manufacturer status',
    enum: ManufacturerStatus,
    default: ManufacturerStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(ManufacturerStatus)
  status?: ManufacturerStatus;
}

export class UpdateManufacturerDto {
  @ApiPropertyOptional({
    description: 'Manufacturer name',
    example: 'Nestle',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({
    description: 'Manufacturer description',
    example: 'Leading manufacturer of beverages',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}

export class UpdateManufacturerStatusDto {
  @ApiProperty({
    description: 'New manufacturer status',
    enum: ManufacturerStatus,
    example: ManufacturerStatus.ACTIVE,
  })
  @IsEnum(ManufacturerStatus)
  status: ManufacturerStatus;
}

export class ManufacturerFiltersDto {
  @ApiPropertyOptional({
    description: 'Search term for name or description',
    example: '',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter by status',
    enum: ManufacturerStatus,
    example: ManufacturerStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(ManufacturerStatus)
  status?: ManufacturerStatus;
}

export class ManufacturerQueryDto {
  @ApiPropertyOptional({
    description: 'Page number (default: 1)',
    example: 1,
    minimum: 1,
  })
  @IsOptional()
  @IsString()
  page?: string;

  @ApiPropertyOptional({
    description: 'Items per page (default: 10, max: 100)',
    example: 10,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @IsString()
  limit?: string;

  @ApiPropertyOptional({
    description: 'Search term for name or description',
    example: '',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter by status',
    enum: ManufacturerStatus,
    example: ManufacturerStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(ManufacturerStatus)
  status?: ManufacturerStatus;

  @ApiPropertyOptional({
    description: 'Include brands in response',
    example: true,
    type: Boolean,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return Boolean(value);
  })
  @IsBoolean()
  includeBrands?: boolean;

  @ApiPropertyOptional({
    description: 'Include products in response',
    example: true,
    type: Boolean,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return Boolean(value);
  })
  @IsBoolean()
  includeProducts?: boolean;

  @ApiPropertyOptional({
    description: 'Include user audit information (createdBy, updatedBy, etc.)',
    example: false,
    type: Boolean,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return Boolean(value);
  })
  @IsBoolean()
  includeAuditInfo?: boolean;
}
