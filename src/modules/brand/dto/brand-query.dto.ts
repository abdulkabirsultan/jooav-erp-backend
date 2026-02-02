import { IsOptional, IsEnum, Matches, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { BrandStatus } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import {
  SortByOptions,
  SortOrderOptions,
} from '../../../shared/constants/app.constants';

export class BrandQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    enum: BrandStatus,
    description: 'Filter by brand status',
  })
  @IsOptional()
  @IsEnum(BrandStatus)
  status?: BrandStatus;

  @ApiPropertyOptional({ description: 'Filter by manufacturer ID' })
  @IsOptional()
  @Matches(/^c[a-z0-9]{24}$/, {
    message: 'manufacturerId must be a valid ObjectId',
  })
  manufacturerId?: string;

  @ApiPropertyOptional({
    description: 'Sort by field',
    enum: ['name', 'createdAt', 'updatedAt'],
  })
  @IsOptional()
  @IsEnum(SortByOptions)
  sortBy?: 'name' | 'createdAt' | 'updatedAt';

  @ApiPropertyOptional({
    description: 'Sort order',
    enum: ['asc', 'desc'],
  })
  @IsOptional()
  @IsEnum(SortOrderOptions)
  sortOrder?: 'asc' | 'desc';

  @ApiPropertyOptional({
    description: 'Include manufacturer in response',
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
  includeManufacturer?: boolean;

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
    description: 'Include variants in response',
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
  includeVariants?: boolean;

  @ApiPropertyOptional({
    description: 'Include audit information (createdBy, updatedBy, etc.)',
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
