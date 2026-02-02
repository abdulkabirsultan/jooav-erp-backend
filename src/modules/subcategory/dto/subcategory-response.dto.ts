import { ApiProperty } from '@nestjs/swagger';
import { SubcategoryStatus } from '@prisma/client';

export class SubcategoryCategoryDto {
  @ApiProperty({
    description: 'Category ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  id: string;

  @ApiProperty({
    description: 'Category name',
    example: 'Beverages',
  })
  name: string;

  @ApiProperty({
    description: 'Category slug',
    example: 'beverages',
  })
  slug: string;

  @ApiProperty({
    description: 'Category description',
    example: 'All beverage products',
    required: false,
  })
  description?: string | null;
}

export class SubcategoryResponseDto {
  @ApiProperty({
    description: 'Subcategory ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  id: string;

  @ApiProperty({
    description: 'Subcategory name',
    example: 'Soft Drinks',
  })
  name: string;

  @ApiProperty({
    description: 'URL-friendly slug',
    example: 'soft-drinks',
  })
  slug: string;

  @ApiProperty({
    description: 'Subcategory description',
    example: 'Carbonated and non-carbonated soft drinks',
    required: false,
  })
  description?: string | null;

  @ApiProperty({
    description: 'Subcategory status',
    enum: SubcategoryStatus,
    example: SubcategoryStatus.ACTIVE,
  })
  status: SubcategoryStatus;

  @ApiProperty({
    description: 'Category ID this subcategory belongs to',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  categoryId: string;

  @ApiProperty({
    description: 'Parent category details',
    type: SubcategoryCategoryDto,
  })
  category: SubcategoryCategoryDto;

  @ApiProperty({
    description: 'Number of products in this subcategory',
    example: 25,
  })
  productCount?: number;

  @ApiProperty({
    description: 'Creation timestamp',
    example: '2024-01-15T10:30:00Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Last update timestamp',
    example: '2024-01-15T10:30:00Z',
  })
  updatedAt: Date;

  @ApiProperty({
    description: 'ID of user who created this subcategory',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  createdBy: string;

  @ApiProperty({
    description: 'ID of user who last updated this subcategory',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  updatedBy: string;
}
