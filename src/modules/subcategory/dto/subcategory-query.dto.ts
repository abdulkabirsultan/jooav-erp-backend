import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsEnum,
  IsBoolean,
  IsString,
  Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { SubcategoryStatus } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class SubcategoryQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Filter by subcategory status',
    enum: SubcategoryStatus,
    example: SubcategoryStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(SubcategoryStatus)
  status?: SubcategoryStatus;

  @ApiPropertyOptional({
    description: 'Filter by category ID',
    example: '',
  })
  @IsOptional()
  @Matches(/^c[a-z0-9]{24}$/, {
    message: 'Category ID must be a valid ObjectId',
  })
  categoryId?: string;

  @ApiPropertyOptional({
    description: 'Include category details',
    example: true,
    type: 'boolean',
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }
    return Boolean(value);
  })
  includeCategory?: boolean = true;

  @ApiPropertyOptional({
    description: 'Include product count',
    example: true,
    type: 'boolean',
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }
    return Boolean(value);
  })
  includeProductCount?: boolean = true;

  @ApiPropertyOptional({
    description: 'Include audit information (createdBy, updatedBy)',
    example: false,
    type: 'boolean',
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }
    return Boolean(value);
  })
  includeAuditInfo?: boolean = false;

  @ApiPropertyOptional({
    description: 'Sort by field',
    enum: ['name', 'createdAt', 'updatedAt'],
    default: 'createdAt',
  })
  @IsOptional()
  @IsString()
  sortBy?: 'name' | 'createdAt' | 'updatedAt' = 'createdAt';

  @ApiPropertyOptional({
    description: 'Sort order',
    enum: ['asc', 'desc'],
    default: 'desc',
  })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc' = 'desc';
}
