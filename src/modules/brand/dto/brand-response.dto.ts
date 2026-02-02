import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BrandStatus } from '@prisma/client';

export class BrandManufacturerDto {
  @ApiProperty({ example: 'c9f7cc4d-9e52-4a3b-9c6d-1f2a3b4c5d6e' })
  id: string;

  @ApiProperty({ example: 'Nestle Nigeria Plc' })
  name: string;

  @ApiProperty({ example: 'ACTIVE' })
  status: string;
}

export class BrandProductDto {
  @ApiProperty({ example: 'p8e6cc4d-9e52-4a3b-9c6d-1f2a3b4c5d6e' })
  id: string;

  @ApiProperty({ example: 'KitKat Bar 45g' })
  name: string;

  @ApiProperty({ example: 'KITKAT-BAR-45G' })
  sku: string;

  @ApiProperty({ example: 'ACTIVE' })
  status: string;

  @ApiProperty({ example: '150.00' })
  price: string;
}

export class BrandUserDto {
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

export class BrandVariantDto {
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
    description: 'Products count for this variant',
    example: 5,
  })
  _count?: {
    products: number;
  };
}

export class BrandResponseDto {
  @ApiProperty({ example: 'b8e6cc4d-9e52-4a3b-9c6d-1f2a3b4c5d6e' })
  id: string;

  @ApiProperty({ example: 'KitKat' })
  name: string;

  @ApiProperty({
    example:
      'https://res.cloudinary.com/jooav/image/upload/v1234567890/brands/kitkat-logo.png',
    nullable: true,
  })
  logo: string | null;

  @ApiProperty({
    example: 'Premium chocolate wafer bar for break moments',
    nullable: true,
  })
  description: string | null;

  @ApiProperty({ enum: BrandStatus })
  status: BrandStatus;

  @ApiProperty({ example: 'c9f7cc4d-9e52-4a3b-9c6d-1f2a3b4c5d6e' })
  manufacturerId: string;

  @ApiProperty({ example: '2023-01-01T00:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2023-01-01T00:00:00.000Z' })
  updatedAt: Date;

  @ApiProperty({ example: 'b8e6cc4d-9e52-4a3b-9c6d-1f2a3b4c5d6e' })
  createdBy: string;

  @ApiProperty({
    example: 'b8e6cc4d-9e52-4a3b-9c6d-1f2a3b4c5d6e',
    nullable: true,
  })
  updatedBy: string | null;

  @ApiPropertyOptional({
    description: 'Manufacturer information',
    type: BrandManufacturerDto,
  })
  manufacturer?: BrandManufacturerDto;

  @ApiPropertyOptional({
    description: 'Products under this brand',
    type: [BrandProductDto],
  })
  products?: BrandProductDto[];

  @ApiPropertyOptional({
    description: 'Variants under this brand',
    type: [BrandVariantDto],
  })
  variants?: BrandVariantDto[];

  @ApiPropertyOptional({
    description: 'User who created this brand',
    type: BrandUserDto,
  })
  createdByUser?: BrandUserDto;

  @ApiPropertyOptional({
    description: 'User who last updated this brand',
    type: BrandUserDto,
  })
  updatedByUser?: BrandUserDto;

  @ApiPropertyOptional({
    description: 'User who deleted this brand',
    type: BrandUserDto,
  })
  deletedByUser?: BrandUserDto;

  @ApiPropertyOptional({
    description: 'Count aggregations for this brand',
    example: { products: 15, variants: 3 },
  })
  _count?: {
    products: number;
    variants: number;
  };

  @ApiPropertyOptional({
    description:
      'Count of products under this brand (deprecated - use _count.products)',
    example: 15,
  })
  productsCount?: number;
}

export class BrandStatsDto {
  @ApiProperty({ example: 85, description: 'Total number of brands' })
  total: number;

  @ApiProperty({ example: 78, description: 'Number of active brands' })
  active: number;

  @ApiProperty({ example: 7, description: 'Number of inactive brands' })
  inactive: number;

  @ApiProperty({ example: 3, description: 'Brands added in last 7 days' })
  recentlyAdded: number;

  @ApiProperty({ example: 25, description: 'Total number of manufacturers' })
  totalManufacturers: number;
}
