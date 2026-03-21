import { IsArray, IsNotEmpty, IsString, ArrayMinSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BulkDeleteManufacturerDto {
  @ApiProperty({
    description: 'Array of manufacturer IDs to delete',
    example: ['clx123abc', 'clx456def', 'clx789ghi'],
    type: [String],
  })
  @IsArray()
  @IsNotEmpty()
  @ArrayMinSize(1, { message: 'At least one manufacturer ID is required' })
  @IsString({ each: true, message: 'Each manufacturer ID must be a string' })
  manufacturerIds: string[];
}
