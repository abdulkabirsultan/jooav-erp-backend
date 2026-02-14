import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsUrl,
  Min,
  Max,
  IsArray,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class ProductUploadRowDto {
  @ApiProperty({
    description: 'Product name (required, must be unique)',
    example: 'Coca Cola 330ml Can',
  })
  @IsString()
  @IsNotEmpty()
  product_name: string;

  @ApiProperty({
    description: 'Product description',
    example: 'Refreshing cola drink in 330ml aluminum can',
    required: false,
  })
  @IsOptional()
  @IsString()
  product_description?: string;

  @ApiProperty({
    description: 'Product price',
    example: 1.5,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price?: number;

  @ApiProperty({
    description: 'Discount percentage (0-100)',
    example: 10,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  discount?: number;

  @ApiProperty({
    description: 'Manufacturer name',
    example: 'The Coca-Cola Company',
  })
  @IsString()
  @IsNotEmpty()
  manufacturer: string;

  @ApiProperty({
    description: 'Brand name',
    example: 'Coca Cola',
  })
  @IsString()
  @IsNotEmpty()
  brand: string;

  @ApiProperty({
    description: 'Brand logo URL',
    example: 'https://example.com/coca-cola-logo.png',
    required: false,
  })
  @IsOptional()
  @IsUrl()
  brand_logo?: string;

  @ApiProperty({
    description: 'Variant name',
    example: 'Classic',
  })
  @IsString()
  @IsNotEmpty()
  variant: string;

  @ApiProperty({
    description: 'Category name',
    example: 'Beverages',
  })
  @IsString()
  @IsNotEmpty()
  category: string;

  @ApiProperty({
    description: 'Category description',
    example: 'All types of drinks and beverages',
    required: false,
  })
  @IsOptional()
  @IsString()
  category_description?: string;

  @ApiProperty({
    description: 'Subcategory name',
    example: 'Soft Drinks',
  })
  @IsString()
  @IsNotEmpty()
  subcategory: string;

  @ApiProperty({
    description: 'Subcategory description',
    example: 'Carbonated soft drinks and sodas',
    required: false,
  })
  @IsOptional()
  @IsString()
  subcategory_description?: string;

  @ApiProperty({
    description: 'Pack size (e.g., "330ml", "1L", "500g")',
    example: '330ml',
  })
  @IsString()
  @IsNotEmpty()
  pack_size: string;

  @ApiProperty({
    description: 'Pack type (e.g., "Can", "Bottle", "Box")',
    example: 'Can',
  })
  @IsString()
  @IsNotEmpty()
  pack_type: string;

  @ApiProperty({
    description: 'Product images URLs (comma-separated)',
    example: 'https://example.com/image1.jpg,https://example.com/image2.jpg',
    required: false,
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => {
    if (typeof value === 'string' && value.trim()) {
      return value
        .split(',')
        .map((url) => url.trim())
        .filter((url) => url.length > 0);
    }
    return [];
  })
  product_images?: string[];

  @ApiProperty({
    description: 'Product thumbnail URL',
    example: 'https://example.com/thumbnail.jpg',
    required: false,
  })
  @IsOptional()
  @IsUrl()
  product_thumbnail?: string;
}

export class BulkUploadResultDto {
  @ApiProperty({
    description: 'Total number of rows processed',
    example: 100,
  })
  totalRows: number;

  @ApiProperty({
    description: 'Number of successful products created',
    example: 85,
  })
  successfulRows: number;

  @ApiProperty({
    description: 'Number of failed rows',
    example: 15,
  })
  failedRows: number;

  @ApiProperty({
    description: 'Processing time in milliseconds',
    example: 5432,
  })
  processingTimeMs: number;

  @ApiProperty({
    description: 'Number of entities created during upload',
    type: 'object',
    additionalProperties: { type: 'number' },
  })
  entitiesCreated: {
    manufacturers: number;
    brands: number;
    categories: number;
    subcategories: number;
    variants: number;
    packSizes: number;
    packTypes: number;
    products: number;
  };

  @ApiProperty({
    description: 'Number of entities referenced (already existed)',
    type: 'object',
    additionalProperties: { type: 'number' },
  })
  entitiesReferenced: {
    manufacturers: number;
    brands: number;
    categories: number;
    subcategories: number;
    variants: number;
    packSizes: number;
    packTypes: number;
  };

  @ApiProperty({
    description: 'Detailed results for each row',
    type: [Object],
  })
  rowResults: RowResultDto[];

  @ApiProperty({
    description: 'Summary message of the upload operation',
    example:
      'Successfully created 85 products, 15 failed. Created 5 new manufacturers, 12 new brands.',
  })
  summary: string;
}

export class RowResultDto {
  @ApiProperty({
    description: 'Row number in the CSV file',
    example: 1,
  })
  rowNumber: number;

  @ApiProperty({
    description: 'Whether the row was processed successfully',
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: 'Created product ID',
    example: 'cm5xyz123',
    required: false,
  })
  productId?: string;

  @ApiProperty({
    description: 'Product name from the row',
    example: 'Coca Cola 330ml Can',
    required: false,
  })
  productName?: string;

  @ApiProperty({
    description: 'Generated SKU for the product',
    example: 'COCA-COLA-CLASSIC-330ML-CAN',
    required: false,
  })
  generatedSku?: string;

  @ApiProperty({
    description: 'Error message if processing failed',
    example: 'Product name already exists',
    required: false,
  })
  error?: string;

  @ApiProperty({
    description: 'Warning messages',
    example: [
      'Brand logo URL is invalid',
      'Subcategory was created automatically',
    ],
    required: false,
  })
  warnings?: string[];

  @ApiProperty({
    description: 'Entities that were created for this row',
    type: [Object],
  })
  createdEntities: EntityActionDto[];

  @ApiProperty({
    description: 'Entities that were referenced (already existed)',
    type: [Object],
  })
  referencedEntities: EntityActionDto[];
}

export class EntityActionDto {
  @ApiProperty({
    description: 'Type of entity',
    enum: [
      'manufacturer',
      'brand',
      'category',
      'subcategory',
      'variant',
      'packSize',
      'packType',
    ],
    example: 'brand',
  })
  type:
    | 'manufacturer'
    | 'brand'
    | 'category'
    | 'subcategory'
    | 'variant'
    | 'packSize'
    | 'packType';

  @ApiProperty({
    description: 'Entity ID',
    example: 'cm5abc123',
  })
  id: string;

  @ApiProperty({
    description: 'Entity name',
    example: 'Coca Cola',
  })
  name: string;

  @ApiProperty({
    description: 'Action performed',
    enum: ['created', 'referenced'],
    example: 'created',
  })
  action: 'created' | 'referenced';
}

export class BulkUploadRequestDto {
  @ApiProperty({
    description: 'CSV file containing product data',
    type: 'string',
    format: 'binary',
  })
  file: Express.Multer.File;
}
