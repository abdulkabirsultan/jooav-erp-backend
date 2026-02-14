import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsEnum } from 'class-validator';
import { OrderStatus } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class OrderQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Filter by order status',
    enum: OrderStatus,
    example: OrderStatus.DRAFT,
  })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiPropertyOptional({
    description: 'Sort by field',
    enum: ['orderNumber', 'totalAmount', 'orderDate', 'createdAt', 'updatedAt'],
    default: 'createdAt',
    example: 'orderDate',
  })
  @IsOptional()
  @IsEnum(['orderNumber', 'totalAmount', 'orderDate', 'createdAt', 'updatedAt'])
  sortBy?:
    | 'orderNumber'
    | 'totalAmount'
    | 'orderDate'
    | 'createdAt'
    | 'updatedAt' = 'createdAt';

  @ApiPropertyOptional({
    description: 'Sort order',
    enum: ['asc', 'desc'],
    default: 'desc',
    example: 'asc',
  })
  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}
