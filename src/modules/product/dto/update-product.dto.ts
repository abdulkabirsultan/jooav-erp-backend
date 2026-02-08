import { PartialType } from '@nestjs/swagger';
import { CreateProductDto } from './create-product.dto';
import { IsOptional, IsBoolean, IsEnum, IsArray, IsUrl } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class UpdateProductDto extends PartialType(CreateProductDto) {
  @ApiPropertyOptional({
    description: 'Product status',
    example: 'LIVE',
    enum: ['DRAFT', 'QUEUE', 'LIVE', 'ARCHIVED'],
  })
  @IsOptional()
  @IsEnum(['DRAFT', 'QUEUE', 'LIVE', 'ARCHIVED'])
  status?: 'DRAFT' | 'QUEUE' | 'LIVE' | 'ARCHIVED';

  @ApiPropertyOptional({
    description: 'New images to upload',
    type: 'array',
    items: {
      type: 'string',
      format: 'binary',
    },
  })
  @IsOptional()
  createImages?: Express.Multer.File[];

  @ApiPropertyOptional({
    description: 'Array of existing image URLs to delete',
    type: 'array',
    items: {
      type: 'string',
    },
    example: ['https://res.cloudinary.com/app/image/upload/v123/product1.jpg'],
  })
  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true })
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return [value]; // Convert single string to array
    }
    if (Array.isArray(value)) {
      return value; // Keep arrays as they are
    }
    return []; // Default to empty array for other types
  })
  deleteImages?: string[];

  @ApiPropertyOptional({
    description: 'New thumbnail image file',
    type: 'string',
    format: 'binary',
  })
  @IsOptional()
  thumbnail?: Express.Multer.File;

  @ApiPropertyOptional({
    description: 'Whether to delete the current thumbnail',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value === 'true' || value === '1';
    }
    return Boolean(value);
  })
  deleteThumbnail?: boolean;
}
