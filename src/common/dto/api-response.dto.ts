import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  meta?: any;
}

export class SuccessResponse<T = any> implements ApiResponse<T> {
  @ApiProperty({
    description: 'Indicates if the operation was successful',
    example: true,
  })
  success: boolean = true;

  @ApiProperty({
    description: 'Human-readable message describing the operation result',
    example: "Manufacturer 'Nestle Nigeria Plc' has been created successfully",
  })
  message: string;

  @ApiPropertyOptional({
    description: 'The response data payload',
  })
  data?: T;

  @ApiPropertyOptional({
    description: 'Additional metadata (pagination, counts, etc.)',
  })
  meta?: any;

  constructor(message: string, data?: T, meta?: any) {
    this.message = message;
    this.data = data;
    this.meta = meta;
  }
}

export class ApiErrorResponse implements ApiResponse {
  @ApiProperty({
    description: 'Indicates if the operation was successful',
    example: false,
  })
  success: boolean = false;

  @ApiProperty({
    description: 'Human-readable error message',
    example: 'Manufacturer not found',
  })
  message: string;

  @ApiPropertyOptional({
    description: 'Error details or validation errors',
  })
  errors?: any;

  @ApiPropertyOptional({
    description: 'Additional error metadata',
  })
  meta?: any;

  constructor(message: string, errors?: any, meta?: any) {
    this.message = message;
    this.errors = errors;
    this.meta = meta;
  }
}
