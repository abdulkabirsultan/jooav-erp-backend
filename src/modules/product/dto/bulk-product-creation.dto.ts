import {
  IsString,
  IsOptional,
  IsNotEmpty,
  IsNumber,
  Min,
  Max,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CSVProductRowDto {
  @ApiProperty({ description: 'Major category name' })
  @IsString()
  @IsNotEmpty()
  major_category: string;

  @ApiProperty({ description: 'Sub category name (optional)', required: false })
  @IsString()
  @IsOptional()
  sub_category?: string;

  @ApiProperty({ description: 'Manufacturer name' })
  @IsString()
  @IsNotEmpty()
  manufacturer: string;

  @ApiProperty({ description: 'Brand name' })
  @IsString()
  @IsNotEmpty()
  brand: string;

  @ApiProperty({ description: 'Variant name' })
  @IsString()
  @IsNotEmpty()
  variant: string;

  @ApiProperty({ description: 'Pack size (e.g., 70g, 500ml)' })
  @IsString()
  @IsNotEmpty()
  pack_size: string;

  @ApiProperty({ description: 'Pack type (e.g., Single Pack, Box)' })
  @IsString()
  @IsNotEmpty()
  pack_type: string;

  @ApiProperty({ description: 'Product price', required: false })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  price?: number;

  @ApiProperty({ description: 'Discount percentage (0-100)', required: false })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  @IsOptional()
  discount?: number;

  @ApiProperty({ description: 'Product description', required: false })
  @IsString()
  @IsOptional()
  product_description?: string;

  @ApiProperty({ description: 'Major category description', required: false })
  @IsString()
  @IsOptional()
  major_category_description?: string;

  @ApiProperty({ description: 'Sub category description', required: false })
  @IsString()
  @IsOptional()
  sub_category_description?: string;

  @ApiProperty({ description: 'Product thumbnail image URL', required: false })
  @IsString()
  @IsOptional()
  product_thumbnail?: string;

  @ApiProperty({
    description: 'Product images URLs (comma-separated)',
    required: false,
    example: 'https://example.com/image1.jpg,https://example.com/image2.jpg',
  })
  @IsString()
  @IsOptional()
  product_images?: string;
}

export class BulkProductCreationDto {
  @ApiProperty({ description: 'CSV data rows', type: [CSVProductRowDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CSVProductRowDto)
  data: CSVProductRowDto[];
}

// Response DTOs
export class EntityCreationResult {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  isNew: boolean;
}

export class ProductCreationResult extends EntityCreationResult {
  @ApiProperty()
  sku: string;

  @ApiProperty({ required: false })
  price?: number;

  @ApiProperty()
  discount?: number;
}

export class BulkCreationSummary {
  @ApiProperty()
  totalRows: number;

  @ApiProperty()
  successfulProducts: number;

  @ApiProperty()
  skippedRows: number;

  @ApiProperty({ type: [String] })
  errors: string[];

  @ApiProperty()
  manufacturersCreated: number;

  @ApiProperty()
  brandsCreated: number;

  @ApiProperty()
  variantsCreated: number;

  @ApiProperty()
  categoriesCreated: number;

  @ApiProperty({ type: [ProductCreationResult] })
  products: ProductCreationResult[];
}

export class BulkProductCreationResponse {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  message: string;

  @ApiProperty({ type: BulkCreationSummary })
  summary: BulkCreationSummary;
}
