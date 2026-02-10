import {
  IsArray,
  IsNotEmpty,
  IsString,
  ArrayMinSize,
  IsEnum,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BulkDeleteProductDto {
  @ApiProperty({
    description: 'Array of product IDs to delete',
    example: ['clx123abc', 'clx456def', 'clx789ghi'],
    type: [String],
  })
  @IsArray()
  @IsNotEmpty()
  @ArrayMinSize(1, { message: 'At least one product ID is required' })
  @IsString({ each: true, message: 'Each product ID must be a string' })
  productIds: string[];
}

export class BulkDeleteResultDto {
  @ApiProperty({
    description: 'Number of products successfully deleted',
    example: 3,
  })
  deletedCount: number;

  @ApiProperty({
    description: 'Array of product IDs that were successfully deleted',
    example: ['clx123abc', 'clx456def'],
    type: [String],
  })
  deletedIds: string[];

  @ApiProperty({
    description:
      'Array of product IDs that failed to delete with error messages',
    example: [{ id: 'clx789ghi', error: 'Product not found' }],
    type: [Object],
  })
  failedIds: Array<{ id: string; error: string }>;
}

export class BulkUpdateStatusDto {
  @ApiProperty({
    description: 'Array of product IDs to update',
    example: ['clx123abc', 'clx456def', 'clx789ghi'],
    type: [String],
  })
  @IsArray()
  @IsNotEmpty()
  @ArrayMinSize(1, { message: 'At least one product ID is required' })
  @IsString({ each: true, message: 'Each product ID must be a string' })
  productIds: string[];

  @ApiProperty({
    description: 'New status to apply to all products',
    example: 'LIVE',
    enum: ['DRAFT', 'QUEUE', 'LIVE', 'ARCHIVED'],
  })
  @IsEnum(['DRAFT', 'QUEUE', 'LIVE', 'ARCHIVED'])
  status: 'DRAFT' | 'QUEUE' | 'LIVE' | 'ARCHIVED';
}

export class BulkUpdateStatusResultDto {
  @ApiProperty({
    description: 'Number of products successfully updated',
    example: 3,
  })
  updatedCount: number;

  @ApiProperty({
    description: 'Array of product IDs that were successfully updated',
    example: ['clx123abc', 'clx456def'],
    type: [String],
  })
  updatedIds: string[];

  @ApiProperty({
    description:
      'Array of product IDs that failed to update with error messages',
    example: [{ id: 'clx789ghi', error: 'Product not found' }],
    type: [Object],
  })
  failedIds: Array<{ id: string; error: string }>;
}
