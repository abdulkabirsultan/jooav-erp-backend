import { ApiProperty } from '@nestjs/swagger';
import { Decimal } from '@prisma/client/runtime/library';

export class OrderItemResponseDto {
  @ApiProperty({ description: 'Order item ID' })
  id: string;

  @ApiProperty({ description: 'Product ID' })
  productId: string;

  @ApiProperty({ description: 'Product name' })
  productName: string;

  @ApiProperty({ description: 'Quantity ordered' })
  quantity: number;

  @ApiProperty({ description: 'Unit price' })
  unitPrice: Decimal;

  @ApiProperty({ description: 'Line total' })
  lineTotal: Decimal;

  @ApiProperty({
    description: 'Item status',
    enum: ['PENDING', 'SOURCING', 'READY', 'UNAVAILABLE'],
  })
  status: string;
}

export class OrderResponseDto {
  @ApiProperty({ description: 'Order ID' })
  id: string;

  @ApiProperty({ description: 'Order number' })
  orderNumber: string;

  @ApiProperty({ description: 'Wholesaler user ID' })
  wholesalerId: string;

  @ApiProperty({ description: 'Order status' })
  status: string;

  @ApiProperty({
    description: 'Assigned procurement officer ID',
    nullable: true,
  })
  assignedProcurementOfficerId: string | null;

  @ApiProperty({ description: 'Procurement officer name', nullable: true })
  procurementOfficerName: string | null;

  @ApiProperty({ description: 'Subtotal amount' })
  subtotal: Decimal;

  @ApiProperty({ description: 'Total amount' })
  totalAmount: Decimal;

  @ApiProperty({ description: 'Delivery address', nullable: true })
  deliveryAddress: any | null;

  @ApiProperty({ description: 'Customer notes', nullable: true })
  customerNotes: string | null;

  @ApiProperty({ description: 'Order date' })
  orderDate: Date;

  @ApiProperty({ description: 'Submitted date', nullable: true })
  submittedAt: Date | null;

  @ApiProperty({ description: 'Confirmed date', nullable: true })
  confirmedAt: Date | null;

  @ApiProperty({ description: 'Created at' })
  createdAt: Date;

  @ApiProperty({ description: 'Order items', type: [OrderItemResponseDto] })
  items: OrderItemResponseDto[];
}
