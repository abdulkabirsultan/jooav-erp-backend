import { IsArray, IsNotEmpty, IsString, ArrayMinSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BulkDeleteUserDto {
  @ApiProperty({
    description: 'Array of user IDs to delete',
    example: ['clx123abc', 'clx456def', 'clx789ghi'],
    type: [String],
  })
  @IsArray()
  @IsNotEmpty()
  @ArrayMinSize(1, { message: 'At least one user ID is required' })
  @IsString({ each: true, message: 'Each user ID must be a string' })
  userIds: string[];
}
