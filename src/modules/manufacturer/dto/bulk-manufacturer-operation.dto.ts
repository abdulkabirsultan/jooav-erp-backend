import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString, ArrayNotEmpty } from 'class-validator';

export class BulkManufacturerOperationDto {
  @ApiProperty({
    description: 'Array of manufacturer IDs to perform bulk operation on',
    example: [
      'b8e6cc4d-9e52-4a3b-9c6d-1f2a3b4c5d6e', // Nestlé
      'c9f7dd4d-9e52-4a3b-9c6d-1f2a3b4c5d6f', // Unilever
      'd0g8ee4d-9e52-4a3b-9c6d-1f2a3b4c5d70', // P&G
    ],
    type: [String],
  })
  @IsArray({ message: 'Manufacturer IDs must be an array' })
  @ArrayNotEmpty({ message: 'Manufacturer IDs array cannot be empty' })
  @IsString({ each: true, message: 'Each manufacturer ID must be a string' })
  manufacturerIds: string[];
}

export class BulkOperationResultDto {
  @ApiProperty({
    description: 'Number of manufacturers successfully processed',
    example: 3,
  })
  deletedCount: number;

  @ApiProperty({
    description: 'List of manufacturers that were successfully deleted',
    example: ['Nestlé', 'Unilever', 'P&G'],
    type: [String],
  })
  deletedManufacturers: string[];

  @ApiProperty({
    description:
      'List of manufacturers that could not be deleted (with reasons)',
    example: [
      {
        name: 'Coca-Cola',
        reason:
          'Cannot delete manufacturer with 15 active product(s). Please deactivate all products first.',
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
