import {
  IsString,
  IsNotEmpty,
  IsOptional,
  MaxLength,
  MinLength,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateVariantPackSizeDto {
  @ApiProperty({
    description: 'Pack size name',
    example: '70g',
    maxLength: 50,
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  name: string;
}

export class CreateVariantPackTypeDto {
  @ApiProperty({
    description: 'Pack type name',
    example: 'Single Pack',
    maxLength: 50,
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  name: string;
}

export class UpdateVariantPackSizeDto {
  @ApiPropertyOptional({
    description: 'Pack size ID (required for update/delete)',
    example: 'cuid_pack_size_id',
  })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty({
    description: 'Pack size name',
    example: '70g',
    maxLength: 50,
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  name: string;
}

export class UpdateVariantPackTypeDto {
  @ApiPropertyOptional({
    description: 'Pack type ID (required for update/delete)',
    example: 'cuid_pack_type_id',
  })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty({
    description: 'Pack type name',
    example: 'Single Pack',
    maxLength: 50,
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  name: string;
}

export class CreateVariantDto {
  @ApiProperty({
    description: 'Variant name',
    example: 'Chicken',
    minLength: 2,
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({
    description: 'Variant description',
    example: 'Delicious chicken flavored variant',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({
    description: 'Brand ID that this variant belongs to',
    example: 'cmj123456789',
  })
  @IsString()
  @IsNotEmpty()
  brandId: string;

  @ApiPropertyOptional({
    description: 'Pack sizes for this variant',
    type: [CreateVariantPackSizeDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateVariantPackSizeDto)
  packSizes?: CreateVariantPackSizeDto[];

  @ApiPropertyOptional({
    description: 'Pack types for this variant',
    type: [CreateVariantPackTypeDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateVariantPackTypeDto)
  packTypes?: CreateVariantPackTypeDto[];
}

export class CreatePackConfigInput {
  @ApiProperty({
    description: 'Pack configuration name',
    example: '100g',
    maxLength: 50,
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  name: string;
}

export class UpdatePackConfigInput {
  @ApiProperty({
    description: 'Pack configuration ID to update',
    example: 'pack_12345',
  })
  @IsString()
  @IsNotEmpty()
  id: string;

  @ApiProperty({
    description: 'Updated pack configuration name',
    example: '125g',
    maxLength: 50,
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  name: string;
}

export class UpdateVariantDto {
  @ApiPropertyOptional({
    description: 'Variant name',
    example: 'Chicken',
    minLength: 2,
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({
    description: 'Variant description',
    example: 'Delicious chicken flavored variant',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    description: 'Brand ID that this variant belongs to',
    example: 'cmj123456789',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  brandId?: string;

  @ApiPropertyOptional({
    description: 'New pack sizes to create',
    type: [CreatePackConfigInput],
    example: [{ name: '150g' }, { name: '300g' }],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePackConfigInput)
  createPackSizes?: CreatePackConfigInput[];

  @ApiPropertyOptional({
    description: 'Pack sizes to update',
    type: [UpdatePackConfigInput],
    example: [{ id: 'pack123', name: '125g' }],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdatePackConfigInput)
  updatePackSizes?: UpdatePackConfigInput[];

  @ApiPropertyOptional({
    description: 'Pack size IDs to delete',
    type: [String],
    example: ['pack456', 'pack789'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  deletePackSizeIds?: string[];

  @ApiPropertyOptional({
    description: 'New pack types to create',
    type: [CreatePackConfigInput],
    example: [{ name: 'Family Pack' }, { name: 'Travel Size' }],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePackConfigInput)
  createPackTypes?: CreatePackConfigInput[];

  @ApiPropertyOptional({
    description: 'Pack types to update',
    type: [UpdatePackConfigInput],
    example: [{ id: 'type123', name: 'Large Family Pack' }],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdatePackConfigInput)
  updatePackTypes?: UpdatePackConfigInput[];

  @ApiPropertyOptional({
    description: 'Pack type IDs to delete',
    type: [String],
    example: ['type456', 'type789'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  deletePackTypeIds?: string[];

  @ApiPropertyOptional({
    description: 'Force delete pack configurations even if products use them',
    example: false,
    default: false,
  })
  @IsOptional()
  forceDeleteConfigs?: boolean;
}
