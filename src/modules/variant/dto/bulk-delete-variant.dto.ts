import { IsArray, IsNotEmpty, IsString, ArrayMinSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BulkDeleteVariantDto {
  @ApiProperty({
    description: 'Array of variant IDs to delete',
    example: ['clx123abc', 'clx456def', 'clx789ghi'],
    type: [String],
  })
  @IsArray()
  @IsNotEmpty()
  @ArrayMinSize(1, { message: 'At least one variant ID is required' })
  @IsString({ each: true, message: 'Each variant ID must be a string' })
  variantIds: string[];
}
