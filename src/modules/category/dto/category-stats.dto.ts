import { ApiProperty } from '@nestjs/swagger';

export class CategoryStatsDto {
  @ApiProperty({
    description: 'Total categories',
    example: 12,
  })
  totalCategories: number;

  @ApiProperty({
    description: 'Active categories',
    example: 10,
  })
  activeCategories: number;

  @ApiProperty({
    description: 'Inactive categories',
    example: 2,
  })
  inactiveCategories: number;

  @ApiProperty({
    description: 'Total subcategories',
    example: 45,
  })
  totalSubcategories: number;

  @ApiProperty({
    description: 'Categories with most subcategories',
    example: [
      { name: 'Food & Beverages', subcategoryCount: 8 },
      { name: 'Personal Care', subcategoryCount: 6 },
    ],
  })
  topCategoriesBySubcategories: Array<{
    name: string;
    subcategoryCount: number;
  }>;

  @ApiProperty({
    description: 'Categories with most products',
    example: [
      { name: 'Food & Beverages', productCount: 150 },
      { name: 'Personal Care', productCount: 89 },
    ],
  })
  topCategoriesByProducts: Array<{
    name: string;
    productCount: number;
  }>;
}
