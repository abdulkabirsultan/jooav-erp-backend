import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsOptional,
  IsEmail,
  IsArray,
  ValidateNested,
  IsNotEmpty,
  Min,
  IsEnum,
  IsDateString,
  IsInt,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { OrderStatus, OrderItemStatus } from '@prisma/client';

export class CreateOrderDto {
  @ApiProperty({
    description: 'Wholesaler User ID (required when admin creates order)',
    example: 'cuid_user_id',
    required: false,
  })
  @IsOptional()
  @IsString()
  wholesalerId?: string;

  @ApiProperty({
    description: 'Order items (optional for draft orders)',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        productId: { type: 'string' },
        quantity: { type: 'number', minimum: 1 },
        unitPrice: { type: 'number', minimum: 0 },
      },
    },
    required: false,
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items?: OrderItemDto[];

  @ApiProperty({
    description: 'Delivery address',
    required: false,
    example: {
      address: '45 Broad Street, Lagos Island',
      city: 'Lagos',
      state: 'Lagos State',
      contactName: 'Wholesale Business Owner',
      contactPhone: '+234801234567',
    },
  })
  @IsOptional()
  deliveryAddress?: any;

  @ApiProperty({
    description: 'Customer notes',
    required: false,
  })
  @IsOptional()
  @IsString()
  customerNotes?: string;
}

export class OrderItemDto {
  @ApiProperty({
    description: 'Product ID',
    example: 'cuid_product_id',
  })
  @IsString()
  @IsNotEmpty()
  productId: string;

  @ApiProperty({
    description: 'Quantity to order',
    example: 50,
    minimum: 10,
  })
  @IsNumber()
  @Min(10)
  quantity: number;

  @ApiProperty({
    description: 'Unit price',
    example: 150.0,
    minimum: 0,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPrice?: number;
}

export class CheckoutResponseDto {
  @ApiProperty({
    description: 'Success status',
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: 'Response message',
    example: 'Order created successfully',
  })
  message: string;

  @ApiProperty({
    description: 'Order and payment data',
  })
  data: {
    order: {
      id: string;
      orderNumber: string;
      totalAmount: number;
      status: string;
    };
    virtualAccounts: Array<{
      accountNumber: string;
      accountName: string;
      bankCode: string;
      bankName: string;
    }>;
    checkoutUrl: string;
    expiryDate: string;
    invoiceReference: string;
  };
}

export class PaymentConfirmationDto {
  @ApiProperty({
    description: 'Payment confirmation status',
  })
  success: boolean;

  @ApiProperty({
    description: 'Status message',
  })
  message: string;

  @ApiProperty({
    description: 'Payment details if successful',
    required: false,
  })
  paymentDetails?: {
    transactionReference: string;
    amountPaid: number;
    paidOn: string;
    paymentMethod: string;
  };
}

export class UpdateOrderItemStatusDto {
  @ApiProperty({
    description: 'New status for the order item',
    enum: OrderItemStatus,
    enumName: 'OrderItemStatus',
    example: OrderItemStatus.SOURCING,
  })
  @IsEnum(OrderItemStatus, {
    message: 'Status must be a valid OrderItemStatus',
  })
  @IsNotEmpty()
  status: OrderItemStatus;

  @ApiProperty({
    description: 'Processing notes',
    required: false,
  })
  @IsOptional()
  @IsString()
  processingNotes?: string;
}

export class ListOrdersQueryDto {
  @ApiProperty({
    description: 'Filter by order status',
    enum: OrderStatus,
    required: false,
    example: '',
  })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiProperty({
    description: 'Sort order for results',
    enum: ['asc', 'desc'],
    required: false,
    example: 'desc',
    default: 'desc',
  })
  @IsOptional()
  @IsString()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';

  @ApiProperty({
    description: 'Page number (starting from 1)',
    required: false,
    example: 1,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiProperty({
    description: 'Number of items per page',
    required: false,
    example: 10,
    default: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;
}

// New DTOs for payment initiation

export class InitiatePaymentDto {
  /**
   * Delivery address for this order.
   * - Required for all users (`address` is the only mandatory sub-field).
   * `contactPhone` is auto-filled from user profile when not provided.
   */
  @ApiProperty({
    description:
      'Delivery address. Required for all users. ' +
      'Only the `address` sub-field is mandatory; city, state, contactName, contactPhone are optional. ' +
      'contactPhone is auto-filled from user profile if missing.',
    required: true,
    example: { address: '45 Broad Street, Lagos Island' },
  })
  @IsOptional()
  deliveryAddress?: {
    address: string;
    city?: string;
    state?: string;
    contactName?: string;
    contactPhone?: string;
    [key: string]: any;
  };
}

export class PaymentResponseDto {
  @ApiProperty({
    description: 'Success status',
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: 'Response message',
    example: 'Payment initiated successfully',
  })
  message: string;

  @ApiProperty({
    description: 'Order and payment data',
  })
  data: {
    order: {
      id: string;
      orderNumber: string;
      totalAmount: number;
      status: string;
    };
    virtualAccounts: Array<{
      accountNumber: string;
      accountName: string;
      bankCode: string;
      bankName: string;
    }>;
    checkoutUrl: string;
    expiryDate: string;
    invoiceReference: string;
  };
}

export class DraftOrderResponseDto {
  @ApiProperty({
    description: 'Success status',
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: 'Response message',
    example: 'Draft order created successfully',
  })
  message: string;

  @ApiProperty({
    description: 'Complete order data with all relationships',
  })
  data: {
    order: any; // Using any for now since the structure matches the database model with all includes
  };
}
