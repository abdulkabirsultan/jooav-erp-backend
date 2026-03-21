import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class EventDataDto {
  @ApiProperty()
  @IsString()
  transactionReference: string;

  @ApiProperty()
  @IsString()
  paymentReference: string;

  @ApiProperty()
  amountPaid: number;

  @ApiProperty()
  totalPayable: number;

  @ApiProperty()
  settlementAmount: number;

  @ApiProperty()
  @IsString()
  paidOn: string;

  @ApiProperty()
  @IsString()
  paymentDescription: string;

  @ApiProperty()
  @IsString()
  paymentStatus: 'PAID' | 'PENDING' | 'FAILED';

  @ApiProperty()
  @IsString()
  paymentMethod: string;

  @ApiProperty()
  @IsString()
  currency: string;

  @ApiProperty()
  @IsObject()
  customer: {
    name: string;
    email: string;
  };

  @ApiProperty()
  @IsObject()
  product: {
    reference: string;
    type: string;
  };

  @ApiProperty({ required: false })
  paymentSourceInformation?: any;

  @ApiProperty({ required: false })
  destinationAccountInformation?: any;

  @ApiProperty({ required: false })
  cardDetails?: any;

  @ApiProperty({ required: false })
  metaData?: any;
}

export class MonnifyWebhookDto {
  @ApiProperty({
    description: 'Event type',
    example: 'SUCCESSFUL_TRANSACTION',
  })
  @IsString()
  eventType: string;

  @ApiProperty({
    description: 'Event data containing transaction details',
  })
  @IsObject()
  @ValidateNested()
  @Type(() => EventDataDto)
  eventData: EventDataDto;
}

export class WebhookResponseDto {
  @ApiProperty({
    description: 'Processing status',
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: 'Response message',
    example: 'Webhook processed successfully',
  })
  message: string;

  @ApiProperty({
    description: 'Processing details',
    required: false,
  })
  data?: any;
}
