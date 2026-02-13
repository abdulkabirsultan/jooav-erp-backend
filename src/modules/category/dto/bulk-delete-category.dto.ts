import { IsArray, IsNotEmpty, IsString, ArrayMinSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BulkDeleteCategoryDto {
  @ApiProperty({
    description: 'Array of category IDs to delete',
    example: ['clx123abc', 'clx456def', 'clx789ghi'],
    type: [String],
  })
  @IsArray()
  @IsNotEmpty()
  @ArrayMinSize(1, { message: 'At least one category ID is required' })
  @IsString({ each: true, message: 'Each category ID must be a string' })
  categoryIds: string[];
}
