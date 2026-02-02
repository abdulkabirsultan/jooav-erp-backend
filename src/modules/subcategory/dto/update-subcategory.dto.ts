import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  MaxLength,
  IsEnum,
  Matches,
} from 'class-validator';
import { SubcategoryStatus } from '@prisma/client';

export class UpdateSubcategoryDto {
  @ApiPropertyOptional({
    description: 'Subcategory name',
    example: 'Soft Drinks',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({
    description: 'Subcategory description',
    example: 'Carbonated and non-carbonated soft drinks',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    description: 'Category ID that this subcategory belongs to',
    example: '',
  })
  @IsOptional()
  @Matches(/^c[a-z0-9]{24}$/, {
    message: 'Category ID must be a valid ObjectId',
  })
  categoryId?: string;

  @ApiPropertyOptional({
    description: 'Subcategory status',
    enum: SubcategoryStatus,
    example: SubcategoryStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(SubcategoryStatus)
  status?: SubcategoryStatus;
}
