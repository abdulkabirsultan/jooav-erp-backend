import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CategoryStatus } from '@prisma/client';

export class CategorySubcategoryDto {
  @ApiProperty({
    description: 'Subcategory ID',
    example: 'ckl123456789',
  })
  id: string;

  @ApiProperty({
    description: 'Subcategory name',
    example: 'Soft Drinks',
  })
  name: string;

  @ApiProperty({
    description: 'Subcategory description',
    example: 'Computer hardware including laptops, desktops, etc.',
    required: false,
  })
  description?: string | null;

  @ApiProperty({
    description: 'Subcategory slug',
    example: 'soft-drinks',
  })
  slug: string;

  @ApiProperty({
    description: 'Product count in this subcategory',
    example: 15,
  })
  productCount: number;

  @ApiProperty({
    description: 'Creation timestamp',
    example: '2023-01-01T00:00:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Last update timestamp',
    example: '2023-01-01T00:00:00.000Z',
  })
  updatedAt: Date;
}

export class CategoryResponseDto {
  @ApiProperty({
    description: 'Category ID',
    example: 'ckl123456789',
  })
  id: string;

  @ApiProperty({
    description: 'Category name',
    example: 'Food & Beverages',
  })
  name: string;

  @ApiProperty({
    description: 'Category description',
    example: 'Electronic devices and accessories',
    required: false,
  })
  description?: string | null;

  @ApiProperty({
    description: 'Category slug',
    example: 'food-beverages',
  })
  slug: string;

  @ApiProperty({
    description: 'Category status',
    enum: CategoryStatus,
    example: CategoryStatus.ACTIVE,
  })
  status: CategoryStatus;

  @ApiProperty({
    description: 'Creation timestamp',
    example: '2023-01-01T00:00:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Last update timestamp',
    example: '2023-01-01T00:00:00.000Z',
  })
  updatedAt: Date;

  @ApiProperty({
    description: 'Created by user ID',
    example: 'user123',
  })
  createdBy: string;

  @ApiProperty({
    description: 'Updated by user ID',
    example: 'user123',
  })
  updatedBy: string;

  @ApiPropertyOptional({
    description: 'Subcategories under this category',
    type: [CategorySubcategoryDto],
  })
  subcategories?: CategorySubcategoryDto[];

  @ApiPropertyOptional({
    description: 'Total subcategory count',
    example: 5,
  })
  subcategoryCount?: number;

  @ApiPropertyOptional({
    description: 'Total product count across all subcategories',
    example: 150,
  })
  totalProductCount?: number;
}
