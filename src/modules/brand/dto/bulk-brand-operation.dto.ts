import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString, ArrayNotEmpty } from 'class-validator';

export class BulkBrandOperationDto {
  @ApiProperty({
    description: 'Array of brand IDs to perform bulk operation on',
    example: [
      'b8e6cc4d-9e52-4a3b-9c6d-1f2a3b4c5d6e', // Nestlé
      'c9f7dd4d-9e52-4a3b-9c6d-1f2a3b4c5d6f', // Maggi
      'd0g8ee4d-9e52-4a3b-9c6d-1f2a3b4c5d70', // KitKat
    ],
    type: [String],
  })
  @IsArray({ message: 'Brand IDs must be an array' })
  @ArrayNotEmpty({ message: 'Brand IDs array cannot be empty' })
  @IsString({ each: true, message: 'Each brand ID must be a string' })
  brandIds: string[];
}

export class BulkBrandOperationResultDto {
  @ApiProperty({
    description: 'Number of brands successfully processed',
    example: 3,
  })
  deletedCount: number;

  @ApiProperty({
    description:
      'List of brands that were successfully deleted with manufacturer info',
    example: [
      { brandName: 'KitKat', manufacturerName: 'Nestlé' },
      { brandName: 'Maggi', manufacturerName: 'Nestlé' },
      { brandName: 'Dove', manufacturerName: 'Unilever' },
    ],
    type: 'array',
    items: {
      type: 'object',
      properties: {
        brandName: { type: 'string' },
        manufacturerName: { type: 'string' },
      },
    },
  })
  deletedBrands: Array<{ brandName: string; manufacturerName: string }>;

  @ApiProperty({
    description: 'List of brands that could not be deleted (with reasons)',
    example: [
      {
        name: 'Coca-Cola',
        reason: 'Brand not found or already deleted',
      },
    ],
    type: 'array',
    items: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        reason: { type: 'string' },
      },
    },
  })
  failedDeletions: Array<{ name: string; reason: string }>;
}
