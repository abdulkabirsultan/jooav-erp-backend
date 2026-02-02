import { ApiProperty } from '@nestjs/swagger';

export enum ResponseStatus {
  SUCCESS = 'success',
  ERROR = 'error',
}

export class BaseResponse<T = any> {
  @ApiProperty({
    description: 'Response status',
    enum: ResponseStatus,
    example: ResponseStatus.SUCCESS,
  })
  status: ResponseStatus;

  @ApiProperty({
    description: 'Response message',
    example: 'Operation successful',
  })
  message: string;

  @ApiProperty({
    description: 'Response data',
    required: false,
  })
  data?: T;

  @ApiProperty({
    description: 'Pagination metadata (for paginated responses)',
    required: false,
  })
  meta?: any;

  @ApiProperty({
    description: 'Response timestamp',
    example: '2023-12-08T10:30:00Z',
  })
  timestamp: string;

  constructor(
    message: string,
    data?: T,
    status: ResponseStatus = ResponseStatus.SUCCESS,
    meta?: any,
  ) {
    this.status = status;
    this.message = message;

    // Handle paginated data structure - flatten it if it has nested data
    if (
      data &&
      typeof data === 'object' &&
      'data' in data &&
      'meta' in data &&
      !meta // Only flatten if meta wasn't explicitly passed
    ) {
      this.data = (data as any).data;
      this.meta = (data as any).meta;
    } else {
      this.data = data;
      this.meta = meta;
    }

    this.timestamp = new Date().toISOString();
  }
}

export class ErrorResponse extends BaseResponse {
  @ApiProperty({
    description: 'Error code',
    example: 'VALIDATION_ERROR',
  })
  code?: string;

  @ApiProperty({
    description: 'Error details',
    required: false,
  })
  errors?: any[];

  constructor(message: string, code?: string, errors?: any[]) {
    super(message, null, ResponseStatus.ERROR);
    this.code = code;
    this.errors = errors;
  }
}
