import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsOptional,
  IsString,
  ValidateNested,
  IsNumber,
  Min,
  IsInt,
  MinLength,
  MaxLength,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

export class DeliveryAddressDto {
  @ApiProperty({
    description: 'Full street address',
    example: '123 Main Street',
  })
  @IsString()
  @MinLength(5, { message: 'Address must be at least 5 characters' })
  @MaxLength(200, { message: 'Address must not exceed 200 characters' })
  address: string;

  @ApiProperty({ description: 'City', example: 'Lagos' })
  @IsString()
  @MinLength(2, { message: 'City must be at least 2 characters' })
  @MaxLength(50, { message: 'City must not exceed 50 characters' })
  city: string;

  @ApiProperty({ description: 'State', example: 'Lagos State' })
  @IsString()
  @MinLength(2, { message: 'State must be at least 2 characters' })
  @MaxLength(50, { message: 'State must not exceed 50 characters' })
  state: string;

  @ApiProperty({
    description: 'Contact name for delivery',
    example: 'John Doe',
  })
  @IsString()
  @MinLength(2, { message: 'Contact name must be at least 2 characters' })
  @MaxLength(100, { message: 'Contact name must not exceed 100 characters' })
  contactName: string;

  @ApiProperty({ description: 'Contact phone', example: '+234801234567' })
  @IsString()
  @MinLength(10, { message: 'Phone number must be at least 10 characters' })
  @MaxLength(20, { message: 'Phone number must not exceed 20 characters' })
  contactPhone: string;
}

export class OrderItemDto {
  @ApiProperty({ description: 'Product ID', example: 'product_123' })
  @IsString()
  @MinLength(1, { message: 'Product ID cannot be empty' })
  productId: string;

  @ApiProperty({
    description: 'Quantity (minimum 10)',
    example: 25,
    minimum: 10,
  })
  @IsNumber({}, { message: 'Quantity must be a number' })
  @IsInt({ message: 'Quantity must be an integer' })
  @Min(10, { message: 'Minimum order quantity is 10 for each product' })
  quantity: number;
}

export class CreateOrderDto {
  @ApiProperty({
    description: 'Order items with minimum 10 quantity per product',
    type: [OrderItemDto],
  })
  @IsArray({ message: 'Items must be an array' })
  @ArrayMinSize(1, { message: 'At least one item is required' })
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];

  @ApiProperty({
    description: 'Optional delivery address',
    type: DeliveryAddressDto,
    required: false,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => DeliveryAddressDto)
  deliveryAddress?: DeliveryAddressDto;

  @ApiProperty({
    description: 'Optional customer notes',
    required: false,
    example: 'Please handle with care',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Customer notes must not exceed 500 characters' })
  customerNotes?: string;
}
