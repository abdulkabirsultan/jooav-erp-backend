import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
  IsInt,
  Min,
  IsIn,
  ValidateIf,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateOrderDto } from './create-order.dto';

export class UpdateOrderItemDto {
  @ApiPropertyOptional({
    description:
      'Action to perform on the item (required when item is provided)',
    enum: ['ADD', 'UPDATE', 'REMOVE'],
    required: true,
  })
  @IsNotEmpty({ message: 'Action is required when updating an item' })
  @IsIn(['ADD', 'UPDATE', 'REMOVE'])
  action: 'ADD' | 'UPDATE' | 'REMOVE';

  @ApiPropertyOptional({
    description: 'Item ID (required for UPDATE and REMOVE actions)',
  })
  @ValidateIf((o) => ['UPDATE', 'REMOVE'].includes(o.action))
  @IsNotEmpty({ message: 'Item ID is required for UPDATE and REMOVE actions' })
  @IsString()
  itemId?: string;

  @ApiPropertyOptional({
    description: 'Product ID (required for ADD action)',
  })
  @ValidateIf((o) => o.action === 'ADD')
  @IsNotEmpty({ message: 'Product ID is required for ADD action' })
  @IsString()
  productId?: string;

  @ApiPropertyOptional({
    description: 'New quantity (required for ADD and UPDATE actions)',
    minimum: 10,
  })
  @ValidateIf((o) => ['ADD', 'UPDATE'].includes(o.action))
  @IsNotEmpty({ message: 'Quantity is required for ADD and UPDATE actions' })
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
    description: 'Single item modification',
    type: UpdateOrderItemDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateOrderItemDto)
  item?: UpdateOrderItemDto;
}
