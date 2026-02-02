import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';
import { CategoryStatus } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class CategoryQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Filter by category status',
    enum: CategoryStatus,
    example: CategoryStatus.ACTIVE,
  })
  @IsEnum(CategoryStatus)
  @IsOptional()
  status?: CategoryStatus;

  @ApiPropertyOptional({
    description: 'Include subcategory details with product counts',
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
  includeSubcategories?: boolean = true;

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
    description: 'Sort field',
    example: 'name',
    default: 'createdAt',
  })
  @IsString()
  @IsOptional()
  sortBy?: string = 'createdAt';

  @ApiPropertyOptional({
    description: 'Sort order',
    example: 'asc',
    default: 'desc',
  })
  @IsString()
  @IsOptional()
  sortOrder?: 'asc' | 'desc' = 'desc';
}
