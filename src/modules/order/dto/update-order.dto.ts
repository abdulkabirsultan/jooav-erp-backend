import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { CreateOrderDto } from './create-order.dto';

export enum UpdateOrderStatus {
  CONFIRMED = 'CONFIRMED',
  ASSIGNED = 'ASSIGNED',
  PROCESSING = 'PROCESSING',
  SHIPPED = 'SHIPPED',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}

export class UpdateOrderDto extends PartialType(CreateOrderDto) {
  @ApiPropertyOptional({
    description: 'Update order status',
    enum: UpdateOrderStatus,
  })
  @IsOptional()
  @IsEnum(UpdateOrderStatus)
  status?: UpdateOrderStatus;

  @ApiPropertyOptional({
    description: 'Assign procurement officer ID',
    example: 'procurement_officer_123',
  })
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Procurement officer ID cannot be empty' })
  assignedProcurementOfficerId?: string;
}
