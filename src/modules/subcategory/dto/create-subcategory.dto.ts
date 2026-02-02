import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateSubcategoryDto {
  @ApiProperty({
    description: 'Subcategory name',
    example: 'Soft Drinks',
    maxLength: 100,
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiProperty({
    description: 'Subcategory description',
    example: 'Carbonated and non-carbonated soft drinks',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({
    description: 'Category ID that this subcategory belongs to',
    example: '',
  })
  @IsNotEmpty()
  @Matches(/^c[a-z0-9]{24}$/, {
    message: 'Category ID must be a valid ObjectId',
  })
  categoryId: string;
}
