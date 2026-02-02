import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ManufacturerStatus } from '@prisma/client';

export class UserInfoDto {
  @ApiProperty({
    description: 'User ID',
    example: 'clp12345678',
  })
  id: string;

  @ApiProperty({
    description: 'User email',
    example: 'admin@jooav.com',
  })
  email: string;

  @ApiProperty({
    description: 'User full name',
    example: 'John Doe',
  })
  name: string;
}

export class ManufacturerBrandDto {
  @ApiProperty({
    description: 'Brand ID',
    example: 'clp98765432',
  })
  id: string;

  @ApiProperty({
    description: 'Brand name',
    example: 'KitKat',
  })
  name: string;

  @ApiPropertyOptional({
    description: 'Brand description',
    example: 'Premium chocolate wafer bar for break moments',
  })
  description?: string;

  @ApiPropertyOptional({
    description: 'Brand logo URL',
    example:
      'https://res.cloudinary.com/jooav/image/upload/v1234567890/brands/kitkat-logo.png',
  })
  logo?: string;

  @ApiProperty({
    description: 'Brand status',
    example: 'ACTIVE',
  })
  status: string;
}

export class ManufacturerProductDto {
  @ApiProperty({
    description: 'Product ID',
    example: 'clp98765432',
  })
  id: string;

  @ApiProperty({
    description: 'Product name',
    example: 'Nestle WH-1000XM5 Headphones',
  })
  name: string;

  @ApiProperty({
    description: 'Product SKU',
    example: 'Nestle-WH1000XM5-BLK',
  })
  sku: string;

  @ApiProperty({
    description: 'Product status',
    example: 'ACTIVE',
  })
  status: string;

  @ApiProperty({
    description: 'Product price',
    example: 399.99,
  })
  price: number;
}

export class ManufacturerResponseDto {
  @ApiProperty({
    description: 'Manufacturer ID',
    example: 'clp12345678',
  })
  id: string;

  @ApiProperty({
    description: 'Manufacturer name',
    example: 'Nestle',
  })
  name: string;

  @ApiPropertyOptional({
    description: 'Manufacturer description',
    example: 'Leading manufacturer of beverages',
  })
  description?: string;

  @ApiProperty({
    description: 'Manufacturer status',
    enum: ManufacturerStatus,
    example: ManufacturerStatus.ACTIVE,
  })
  status: ManufacturerStatus;

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

  @ApiPropertyOptional({
    description: 'Deletion timestamp (if soft deleted)',
    example: '2024-01-20T15:45:00Z',
  })
  deletedAt?: Date;

  @ApiPropertyOptional({
    description: 'User who created this manufacturer',
    type: UserInfoDto,
  })
  createdBy?: UserInfoDto;

  @ApiPropertyOptional({
    description: 'User who last updated this manufacturer',
    type: UserInfoDto,
  })
  updatedBy?: UserInfoDto;

  @ApiPropertyOptional({
    description: 'User who deleted this manufacturer (if soft deleted)',
    type: UserInfoDto,
  })
  deletedBy?: UserInfoDto;

  @ApiProperty({
    description: 'Number of products by this manufacturer',
    example: 25,
  })
  productsCount: number;

  @ApiProperty({
    description: 'Number of orders for this manufacturer',
    example: 150,
  })
  ordersCount: number;

  @ApiPropertyOptional({
    description: 'Brands under this manufacturer',
    type: [ManufacturerBrandDto],
  })
  brands?: ManufacturerBrandDto[];

  @ApiPropertyOptional({
    description: 'Recent products (limited to 10)',
    type: [ManufacturerProductDto],
  })
  products?: ManufacturerProductDto[];
}

export class ManufacturerStatsDto {
  @ApiProperty({
    description: 'Total number of manufacturers',
    example: 45,
  })
  total: number;

  @ApiProperty({
    description: 'Number of active manufacturers',
    example: 40,
  })
  active: number;

  @ApiProperty({
    description: 'Number of inactive manufacturers',
    example: 3,
  })
  inactive: number;

  @ApiProperty({
    description: 'Number of suspended manufacturers',
    example: 2,
  })
  suspended: number;

  @ApiProperty({
    description: 'Total number of products by all manufacturers',
    example: 450,
  })
  totalProducts: number;

  @ApiProperty({
    description: 'Total number of orders processed',
    example: 789,
  })
  totalOrders: number;

  @ApiProperty({
    description: 'Number of manufacturers created this month',
    example: 5,
  })
  createdThisMonth: number;
}
