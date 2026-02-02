import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  ValidateNested,
  MaxLength,
} from 'class-validator';

export class CreateSubcategoryInput {
  @ApiProperty({
    description: 'Subcategory name',
    example: 'Soft Drinks',
    maxLength: 100,
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({
    description: 'Subcategory description',
    example: 'Carbonated and non-carbonated soft drinks',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class CreateCategoryDto {
  @ApiProperty({
    description: 'Category name',
    example: 'Food and Beverages',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({
    description: 'Category description',
    example: 'All food and beverage products',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    description: 'Array of subcategories to create along with the category',
    type: [CreateSubcategoryInput],
    example: [
      {
        name: 'Soft Drinks',
        description: 'Carbonated and non-carbonated beverages',
      },
      {
        name: 'Energy Drinks',
        description: 'High-energy beverages and sports drinks',
      },
    ],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSubcategoryInput)
  subcategories?: CreateSubcategoryInput[];
}
