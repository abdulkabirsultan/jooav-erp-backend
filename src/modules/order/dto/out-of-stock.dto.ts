import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class OutOfStockReportItemDto {
  @ApiProperty({
    description: 'Order ID that contains the affected item',
    example: '',
  })
  @IsString()
  @IsNotEmpty()
  orderId: string;

  @ApiProperty({
    description: 'Order item ID being reported as out of stock',
    example: 'cm1abcxyz0002orderitemid',
  })
  @IsString()
  @IsNotEmpty()
  orderItemId: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantityAffected?: number;
}

export class CreateOutOfStockReportDto {
  @ApiProperty({
    description: 'One or more completed-order items to mark out of stock',
    type: [OutOfStockReportItemDto],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OutOfStockReportItemDto)
  items: OutOfStockReportItemDto[];
}

export class OutOfStockReportResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: 'Out-of-stock report created successfully' })
  message: string;

  @ApiProperty({ description: 'Report data payload' })
  data: any;
}

export class OutOfStockReportListResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: 'Open out-of-stock reports retrieved successfully' })
  message: string;

  @ApiProperty({ description: 'All open reports (no pagination)' })
  data: any;
}
