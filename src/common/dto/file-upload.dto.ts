import { ApiProperty } from '@nestjs/swagger';

export class FileUploadDto {
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'File to upload',
  })
  file: any;
}

export class MultipleFileUploadDto {
  @ApiProperty({
    type: 'array',
    items: {
      type: 'string',
      format: 'binary',
    },
    description: 'Multiple files to upload',
  })
  files: any[];
}

export class FileUploadResponseDto {
  @ApiProperty({ example: 'jooav-erp/sample_file_abc123' })
  publicId: string;

  @ApiProperty({
    example: 'http://res.cloudinary.com/demo/image/upload/sample.jpg',
  })
  url: string;

  @ApiProperty({
    example: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
  })
  secureUrl: string;

  @ApiProperty({ example: 'jpg' })
  format: string;

  @ApiProperty({ example: 'image' })
  resourceType: string;

  @ApiProperty({ example: 1024000 })
  bytes: number;

  @ApiProperty({ example: 1920, required: false })
  width?: number;

  @ApiProperty({ example: 1080, required: false })
  height?: number;

  @ApiProperty({ example: '2025-12-10T15:30:00.000Z' })
  createdAt: string;
}

export class DeleteFileDto {
  @ApiProperty({
    example: 'jooav-erp/sample_file_abc123',
    description: 'Public ID of the file to delete',
  })
  publicId: string;
}
