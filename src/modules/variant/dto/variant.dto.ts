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
    description: 'Pack sizes for this variant (replaces all existing)',
    type: [UpdateVariantPackSizeDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateVariantPackSizeDto)
  packSizes?: UpdateVariantPackSizeDto[];

  @ApiPropertyOptional({
    description: 'Pack types for this variant (replaces all existing)',
    type: [UpdateVariantPackTypeDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateVariantPackTypeDto)
  packTypes?: UpdateVariantPackTypeDto[];
}
