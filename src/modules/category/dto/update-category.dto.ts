import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  ValidateNested,
  MaxLength,
  Matches,
} from 'class-validator';
import { CategoryStatus } from '@prisma/client';

export class CreateSubcategoryInput {
  @ApiPropertyOptional({
    description: 'Subcategory name',
    example: 'Soft Drinks',
    maxLength: 100,
  })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({
    description: 'Subcategory description',
    example: 'Carbonated and non-carbonated beverages',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class UpdateSubcategoryInput {
  @ApiPropertyOptional({
    description: 'Subcategory ID to update',
    example: 'sc1234567890abcdef12345678',
  })
  @Matches(/^c[a-z0-9]{24}$/, {
    message: 'subcategoryId must be a valid ObjectId',
  })
  id: string;

  @ApiPropertyOptional({
    description: 'Updated subcategory data',
    type: CreateSubcategoryInput,
  })
  @ValidateNested()
  @Type(() => CreateSubcategoryInput)
  data: Partial<CreateSubcategoryInput>;
}

export class UpdateCategoryDto {
  @ApiPropertyOptional({
    description: 'Category name',
    example: 'Food & Beverages',
  })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({
    description: 'Category description',
    example: 'All food and beverage products',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(CategoryStatus)
  @IsOptional()
  status?: CategoryStatus;

  @ApiPropertyOptional({
    description: 'New subcategories to create',
    type: [CreateSubcategoryInput],
    example: [
      {
        name: 'Organic Drinks',
        description: 'Natural and organic beverages',
      },
    ],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSubcategoryInput)
  createSubcategories?: CreateSubcategoryInput[];

  @ApiPropertyOptional({
    description: 'Subcategories to update',
    type: [UpdateSubcategoryInput],
    example: [
      {
        id: 'sc1234567890abcdef12345678',
        data: { name: 'Premium Soft Drinks' },
      },
    ],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateSubcategoryInput)
  updateSubcategories?: UpdateSubcategoryInput[];

  @ApiPropertyOptional({
    description:
      'Subcategory IDs to delete (will check for products and handle cascading)',
    type: [String],
    example: ['sc1234567890abcdef12345678', 'sc9876543210fedcba87654321'],
  })
  @IsOptional()
  @IsArray()
  @Matches(/^c[a-z0-9]{24}$/, {
    message: 'manufacturerId must be a valid ObjectId',
    each: true,
  })
  deleteSubcategoryIds?: string[];

  @ApiPropertyOptional({
    description:
      'Force delete subcategories even if they have products (cascade delete products)',
    example: false,
    default: false,
  })
  @IsOptional()
  forceDeleteSubcategories?: boolean;
}
