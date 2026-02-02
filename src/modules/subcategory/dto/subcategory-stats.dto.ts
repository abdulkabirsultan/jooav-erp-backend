import { ApiProperty } from '@nestjs/swagger';

export class SubcategoryStatsDto {
  @ApiProperty({
    description: 'Total number of subcategories',
    example: 25,
  })
  totalSubcategories: number;

  @ApiProperty({
    description: 'Number of active subcategories',
    example: 22,
  })
  activeSubcategories: number;

  @ApiProperty({
    description: 'Number of inactive subcategories',
    example: 3,
  })
  inactiveSubcategories: number;

  @ApiProperty({
    description: 'Total number of products across all subcategories',
    example: 450,
  })
  totalProducts: number;

  @ApiProperty({
    description: 'Top subcategories by product count',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        name: { type: 'string', example: 'Soft Drinks' },
        productCount: { type: 'number', example: 45 },
      },
    },
  })
  topSubcategoriesByProducts: Array<{
    name: string;
    productCount: number;
  }>;

  @ApiProperty({
    description: 'Subcategory distribution per category',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        categoryName: { type: 'string', example: 'Beverages' },
        subcategoryCount: { type: 'number', example: 8 },
      },
    },
  })
  subcategoryDistribution: Array<{
    categoryName: string;
    subcategoryCount: number;
  }>;
}
