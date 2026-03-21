import { ApiProperty } from '@nestjs/swagger';

export class BulkDeleteItemResult {
  @ApiProperty({
    description: 'ID of the item that was attempted to be deleted',
    example: 'cm5abcd1234567890',
  })
  id: string;

  @ApiProperty({
    description: 'Whether the deletion was successful',
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: 'Error message if deletion failed',
    example: 'Item not found',
    required: false,
  })
  error?: string;
}

export class BulkDeleteResultDto {
  @ApiProperty({
    description: 'Results for each item deletion attempt',
    type: [BulkDeleteItemResult],
  })
  results: BulkDeleteItemResult[];

  @ApiProperty({
    description: 'Total number of items requested for deletion',
    example: 5,
  })
  totalRequested: number;

  @ApiProperty({
    description: 'Number of successful deletions',
    example: 3,
  })
  successful: number;

  @ApiProperty({
    description: 'Number of failed deletions',
    example: 2,
  })
  failed: number;
}
