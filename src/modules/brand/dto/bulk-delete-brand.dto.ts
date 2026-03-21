import { IsArray, IsNotEmpty, IsString, ArrayMinSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BulkDeleteBrandDto {
  @ApiProperty({
    description: 'Array of brand IDs to delete',
    example: ['clx123abc', 'clx456def', 'clx789ghi'],
    type: [String],
  })
  @IsArray()
  @IsNotEmpty()
  @ArrayMinSize(1, { message: 'At least one brand ID is required' })
  @IsString({ each: true, message: 'Each brand ID must be a string' })
  brandIds: string[];
}
