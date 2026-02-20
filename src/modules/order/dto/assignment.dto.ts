import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsEnum,
  IsOptional,
  MinLength,
  IsArray,
  ValidateNested,
  IsNumber,
  IsBoolean,
  IsDate,
  Min,
  Max,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { OrderItemStatus, ProcurementOfficerStatus } from '@prisma/client';

export class AssignOrderDto {
  @ApiProperty({
    description: 'Procurement officer ID to assign the order to',
    example: 'proc_officer_uuid',
  })
  @IsString()
  @MinLength(1, { message: 'Procurement officer ID cannot be empty' })
  procurementOfficerId: string;

  @ApiPropertyOptional({
    description: 'Assignment notes or special instructions',
    example: 'Urgent order - requires immediate attention',
  })
  @IsOptional()
  @IsString()
  assignmentNotes?: string;
}

export enum AssignmentResponseType {
  ACCEPT = 'ACCEPT',
  REJECT = 'REJECT',
}

export class AssignmentResponseDto {
  @ApiProperty({
    description: 'Assignment response - accept or reject',
    enum: AssignmentResponseType,
    example: AssignmentResponseType.ACCEPT,
  })
  @IsEnum(AssignmentResponseType)
  response: AssignmentResponseType;

  @ApiPropertyOptional({
    description: 'Reason for acceptance or rejection',
    example: 'Order accepted - will begin processing immediately',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class AssignmentStatusDto {
  @ApiProperty({
    description: 'Success status',
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: 'Response message',
    example: 'Order assigned successfully',
  })
  message: string;

  @ApiProperty({
    description: 'Assignment details',
  })
  data: {
    orderNumber: string;
    status: string;
    procurementOfficerName: string;
    assignedAt: Date;
    respondedAt?: Date;
    assignmentNotes?: string;
    responseReason?: string;
  };
}

export class BulkUpdateOrderItemDto {
  @ApiProperty({
    description: 'Order item ID',
    example: 'item_uuid_123',
  })
  @IsString()
  @MinLength(1, { message: 'Item ID cannot be empty' })
  itemId: string;

  @ApiProperty({
    description: 'New status for the order item',
    enum: OrderItemStatus,
    example: OrderItemStatus.SOURCING,
  })
  @IsEnum(OrderItemStatus)
  status: OrderItemStatus;

  @ApiPropertyOptional({
    description: 'Processing notes for this item',
    example: 'Item sourced from supplier XYZ',
  })
  @IsOptional()
  @IsString()
  processingNotes?: string;
}

export class BulkUpdateOrderItemsDto {
  @ApiProperty({
    description: 'Array of order items to update',
    type: [BulkUpdateOrderItemDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkUpdateOrderItemDto)
  items: BulkUpdateOrderItemDto[];

  @ApiPropertyOptional({
    description: 'General notes for the bulk update',
    example: 'Bulk status update - all items processed',
  })
  @IsOptional()
  @IsString()
  bulkNotes?: string;
}

export class BulkUpdateResultDto {
  @ApiProperty({
    description: 'Success status',
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: 'Operation summary message',
    example: 'Bulk update completed: 5 successful, 0 failed',
  })
  @IsString()
  message: string;

  @ApiProperty({
    description: 'Update results data',
  })
  data: {
    totalItems: number;
    successCount: number;
    failureCount: number;
    results: Array<{
      itemId: string;
      success: boolean;
      message: string;
      updatedItem?: any;
    }>;
  };
}

export class AutoAssignmentConfigDto {
  @ApiProperty({
    description: 'Enable or disable auto-assignment',
    example: true,
  })
  enabled: boolean;

  @ApiProperty({
    description: 'Auto-assignment strategy',
    enum: ['availability_based'],
    example: 'availability_based',
  })
  strategy: 'availability_based';

  @ApiProperty({
    description:
      'Maximum number of active orders per officer for auto-assignment',
    example: 10,
  })
  maxActiveOrdersPerOfficer?: number;
}

export class OfficerWorkloadDto {
  @ApiProperty({ description: 'Officer profile ID' })
  officerId: string;

  @ApiProperty({ description: 'Officer name' })
  officerName: string;

  @ApiProperty({ description: 'Number of active orders' })
  activeOrdersCount: number;

  @ApiProperty({ description: 'Number of pending acceptance orders' })
  pendingOrdersCount: number;

  @ApiProperty({ description: 'Officer status' })
  status: string;
}

export class OfficerWorkloadResponseDto {
  @ApiProperty({ description: 'Success status', example: true })
  success: boolean;

  @ApiProperty({
    description: 'Response message',
    example: 'Officer workloads retrieved successfully',
  })
  message: string;

  @ApiProperty({
    description: 'Officer workload data',
    type: [OfficerWorkloadDto],
  })
  data: OfficerWorkloadDto[];
}

export class UpdateAvailabilityDto {
  @ApiProperty({
    description: 'Procurement officer availability status',
    enum: ProcurementOfficerStatus,
    example: ProcurementOfficerStatus.AVAILABLE,
  })
  @IsEnum(ProcurementOfficerStatus)
  availabilityStatus: ProcurementOfficerStatus;

  @ApiPropertyOptional({
    description: 'Maximum number of active orders (1-20)',
    example: 8,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(20)
  maxActiveOrders?: number;
}

export class AvailabilityStatusDto {
  @ApiProperty({ description: 'Officer profile ID' })
  officerId: string;

  @ApiProperty({ description: 'Officer name' })
  officerName: string;

  @ApiProperty({
    description: 'Current availability status',
    enum: ProcurementOfficerStatus,
  })
  availabilityStatus: ProcurementOfficerStatus;

  @ApiProperty({ description: 'Current active orders count' })
  activeOrdersCount: number;

  @ApiProperty({ description: 'Maximum allowed active orders' })
  maxActiveOrders: number;

  @ApiProperty({ description: 'Last status update' })
  updatedAt: Date;

  @ApiPropertyOptional({ description: 'User ID for the officer' })
  userId?: string;
}
