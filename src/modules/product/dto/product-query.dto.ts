import {
  IsOptional,
  IsString,
  IsBoolean,
  IsEnum,
  IsArray,
  Matches,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class ProductQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Filter by brand ID',
    example: '',
  })
  @IsOptional()
  @Matches(/^c[a-z0-9]{24}$/, {
    message: 'brandId must be a valid ObjectId',
  })
  brandId?: string;

  @ApiPropertyOptional({
    description: 'Filter by category ID',
    example: '',
  })
  @IsOptional()
  @Matches(/^c[a-z0-9]{24}$/, {
    message: 'categoryId must be a valid ObjectId',
  })
  categoryId?: string;

  @ApiPropertyOptional({
    description: 'Filter by subcategory ID',
    example: '',
  })
  @IsOptional()
  @Matches(/^c[a-z0-9]{24}$/, {
    message: 'subcategoryId must be a valid ObjectId',
  })
  subcategoryId?: string;

  @ApiPropertyOptional({
    description:
      'Filter by multiple subcategory IDs (supports comma-separated string or repeated query params)',
    example: [],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @Matches(/^c[a-z0-9]{24}$/, {
    message: 'Each subcategoryId must be a valid ObjectId',
    each: true,
  })
  @Transform(({ value }) => {
    if (!value) {
      return undefined;
    }

    if (Array.isArray(value)) {
      return value.flatMap((item) =>
        typeof item === 'string'
          ? item
              .split(',')
              .map((v) => v.trim())
              .filter(Boolean)
          : [],
      );
    }

    if (typeof value === 'string') {
      return value
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
    }

    return undefined;
  })
  subcategoryIds?: string[];

  @ApiPropertyOptional({
    description: 'Filter by product variant',
    example: '',
  })
  @IsOptional()
  @IsString()
  variant?: string;

  @ApiPropertyOptional({
    description: 'Filter by product status',
    example: 'LIVE',
    enum: ['DRAFT', 'QUEUE', 'LIVE', 'ARCHIVED'],
  })
  @IsOptional()
  @IsEnum(['DRAFT', 'QUEUE', 'LIVE', 'ARCHIVED'], {
    message: 'status must be one of: DRAFT, QUEUE, LIVE, ARCHIVED',
  })
  status?: 'DRAFT' | 'QUEUE' | 'LIVE' | 'ARCHIVED';

  @ApiPropertyOptional({
    description:
      'Sort by price (asc = least price first, desc = highest price first)',
    example: 'asc',
    enum: ['asc', 'desc'],
  })
  @IsOptional()
  @IsEnum(['asc', 'desc'], {
    message: 'priceSort must be either asc or desc',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  priceSort?: 'asc' | 'desc';

  @ApiPropertyOptional({
    description: 'Include related data (brand, category, manufacturer)',
    example: true,
    type: 'boolean',
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }
    return value;
  })
  includeRelations?: boolean;
}
