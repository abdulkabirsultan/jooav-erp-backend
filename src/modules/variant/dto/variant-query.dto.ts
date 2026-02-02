import {
  IsString,
  IsOptional,
  IsEnum,
  MaxLength,
  IsBoolean,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  SortByOptions,
  SortOrderOptions,
} from '../../../shared/constants/app.constants';

export class VariantQueryDto {
  @ApiPropertyOptional({
    description: 'Page number (default: 1)',
    example: 1,
    minimum: 1,
    required: false,
  })
  @IsOptional()
  @IsString()
  page?: string;

  @ApiPropertyOptional({
    description: 'Items per page (default: 10, max: 100)',
    example: 10,
    minimum: 1,
    maximum: 100,
    required: false,
  })
  @IsOptional()
  @IsString()
  limit?: string;

  @ApiPropertyOptional({
    description: 'Search term for variant name or description',
    example: '',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter by brand ID',
    example: '',
    required: false,
  })
  @IsOptional()
  @IsString()
  brandId?: string;

  @ApiPropertyOptional({
    description: 'Sort field',
    example: 'name',
    enum: ['name', 'createdAt', 'updatedAt'],
    required: false,
  })
  @IsOptional()
  @IsEnum(SortByOptions)
  sortBy?: 'name' | 'createdAt' | 'updatedAt';

  @ApiPropertyOptional({
    description: 'Sort order',
    example: 'asc',
    enum: ['asc', 'desc'],
    required: false,
  })
  @IsOptional()
  @IsEnum(SortOrderOptions)
  sortOrder?: 'asc' | 'desc';

  @ApiPropertyOptional({
    description: 'Include brand in response',
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
  includeBrand?: boolean;

  @ApiPropertyOptional({
    description: 'Include products count in response',
    example: true,
    required: false,
    type: Boolean,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return Boolean(value);
  })
  @IsBoolean()
  includeProductsCount?: boolean;

  @ApiPropertyOptional({
    description: 'Include audit information (createdBy, updatedBy, etc.)',
    example: false,
    type: Boolean,
    required: false,
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
