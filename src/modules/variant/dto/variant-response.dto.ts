import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class VariantPackSizeDto {
  @ApiProperty({
    description: 'Pack size ID',
    example: 'cmj123456789',
  })
  id: string;

  @ApiProperty({
    description: 'Pack size name',
    example: '70g',
  })
  name: string;

  @ApiProperty({
    description: 'Pack size status',
    example: 'ACTIVE',
  })
  status: string;

  @ApiProperty({
    description: 'Creation timestamp',
    example: '2025-12-26T14:24:58.795Z',
  })
  createdAt: Date;
}

export class VariantPackTypeDto {
  @ApiProperty({
    description: 'Pack type ID',
    example: 'cmj123456789',
  })
  id: string;

  @ApiProperty({
    description: 'Pack type name',
    example: 'Single Pack',
  })
  name: string;

  @ApiProperty({
    description: 'Pack type status',
    example: 'ACTIVE',
  })
  status: string;

  @ApiProperty({
    description: 'Creation timestamp',
    example: '2025-12-26T14:24:58.795Z',
  })
  createdAt: Date;
}

export class VariantBrandDto {
  @ApiProperty({
    description: 'Brand ID',
    example: 'cmj123456789',
  })
  id: string;

  @ApiProperty({
    description: 'Brand name',
    example: 'Indomie',
  })
  name: string;
}

export class VariantUserDto {
  @ApiProperty({
    description: 'User ID',
    example: 'cmj123456789',
  })
  id: string;

  @ApiProperty({
    description: 'User email',
    example: 'admin@jooav.com',
  })
  email: string;

  @ApiPropertyOptional({
    description: 'User first name',
    example: 'John',
  })
  firstName?: string;

  @ApiPropertyOptional({
    description: 'User last name',
    example: 'Doe',
  })
  lastName?: string;
}

export class VariantResponseDto {
  @ApiProperty({
    description: 'Variant ID',
    example: 'cmj123456789',
  })
  id: string;

  @ApiProperty({
    description: 'Variant name',
    example: 'Chicken',
  })
  name: string;

  @ApiPropertyOptional({
    description: 'Variant description',
    example: 'Delicious chicken flavored variant',
  })
  description?: string;

  @ApiProperty({
    description: 'Brand ID',
    example: 'cmj123456789',
  })
  brandId: string;

  @ApiProperty({
    description: 'Created by user ID',
    example: 'cmj123456789',
  })
  createdBy: string;

  @ApiProperty({
    description: 'Updated by user ID',
    example: 'cmj123456789',
  })
  updatedBy: string;

  @ApiPropertyOptional({
    description: 'Deleted by user ID',
    example: 'cmj123456789',
  })
  deletedBy?: string;

  @ApiProperty({
    description: 'Creation timestamp',
    example: '2025-12-26T14:24:58.795Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Last update timestamp',
    example: '2025-12-26T14:24:58.795Z',
  })
  updatedAt: Date;

  @ApiPropertyOptional({
    description: 'Deletion timestamp',
    example: '2025-12-26T14:24:58.795Z',
  })
  deletedAt?: Date;

  @ApiPropertyOptional({
    description: 'Associated brand information',
    type: VariantBrandDto,
  })
  brand?: VariantBrandDto;

  @ApiPropertyOptional({
    description: 'Pack sizes for this variant',
    type: [VariantPackSizeDto],
  })
  packSizes?: VariantPackSizeDto[];

  @ApiPropertyOptional({
    description: 'Pack types for this variant',
    type: [VariantPackTypeDto],
  })
  packTypes?: VariantPackTypeDto[];

  @ApiPropertyOptional({
    description: 'Products count',
    example: 5,
  })
  _count?: {
    products: number;
  };

  @ApiPropertyOptional({
    description: 'Created by user information',
    type: VariantUserDto,
  })
  createdByUser?: VariantUserDto;

  @ApiPropertyOptional({
    description: 'Updated by user information',
    type: VariantUserDto,
  })
  updatedByUser?: VariantUserDto;

  @ApiPropertyOptional({
    description: 'Deleted by user information',
    type: VariantUserDto,
  })
  deletedByUser?: VariantUserDto;
}

export class VariantStatsDto {
  @ApiProperty({
    description: 'Total number of variants',
    example: 150,
  })
  totalVariants: number;

  @ApiProperty({
    description: 'Variants by brand',
    example: { Indomie: 10, Peak: 8, 'Coca-Cola': 5 },
  })
  variantsByBrand: Record<string, number>;

  @ApiProperty({
    description: 'Most popular variants (by product count)',
    example: [
      { name: 'Chicken', productCount: 15 },
      { name: 'Beef', productCount: 12 },
    ],
  })
  popularVariants: Array<{
    name: string;
    productCount: number;
  }>;
}
