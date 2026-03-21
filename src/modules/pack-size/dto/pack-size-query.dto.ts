import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class PackSizeQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Filter by variant ID',
    example: 'cuid_example_variant_id',
  })
  @IsOptional()
  @IsString()
  variantId?: string;

  @ApiPropertyOptional({
    description: 'Sort by field',
    enum: ['name', 'createdAt', 'updatedAt'],
    default: 'createdAt',
    example: 'name',
  })
  @IsOptional()
  @IsEnum(['name', 'createdAt', 'updatedAt'])
  sortBy?: 'name' | 'createdAt' | 'updatedAt' = 'createdAt';

  @ApiPropertyOptional({
    description: 'Sort order',
    enum: ['asc', 'desc'],
    default: 'desc',
    example: 'asc',
  })
  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}
