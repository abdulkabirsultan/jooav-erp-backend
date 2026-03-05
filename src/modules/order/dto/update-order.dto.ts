import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  MinLength,
  IsArray,
  ValidateNested,
  IsInt,
  Min,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateOrderDto } from './create-order.dto';

export class UpdateOrderItemDto {
  @ApiPropertyOptional({
    description: 'Action to perform on the item',
    enum: ['ADD', 'UPDATE', 'REMOVE'],
  })
  @IsOptional()
  @IsIn(['ADD', 'UPDATE', 'REMOVE'])
  action: 'ADD' | 'UPDATE' | 'REMOVE';

  @ApiPropertyOptional({
    description: 'Item ID (required for UPDATE and REMOVE actions)',
  })
  @IsOptional()
  @IsString()
  itemId?: string;

  @ApiPropertyOptional({
    description: 'Product ID (required for ADD action)',
  })
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiPropertyOptional({
    description: 'New quantity (for ADD and UPDATE actions)',
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(10, { message: 'Quantity must be at least 10' })
  quantity?: number;
}

export class UpdateOrderDto extends PartialType(
  OmitType(CreateOrderDto, ['items'] as const),
) {
  @ApiPropertyOptional({
    description: 'Assign procurement officer ID',
    example: 'procurement_officer_123',
  })
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Procurement officer ID cannot be empty' })
  assignedProcurementOfficerId?: string;

  @ApiPropertyOptional({
    description: 'Array of item modifications',
    type: [UpdateOrderItemDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateOrderItemDto)
  items?: UpdateOrderItemDto[];
}
