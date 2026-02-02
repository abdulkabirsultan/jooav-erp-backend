import { PartialType } from '@nestjs/swagger';
import { CreateProductDto } from './create-product.dto';
import { IsOptional, IsBoolean, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class UpdateProductDto extends PartialType(CreateProductDto) {
  @ApiPropertyOptional({
    description: 'Product status',
    example: 'LIVE',
    enum: ['DRAFT', 'QUEUE', 'LIVE', 'ARCHIVED'],
  })
  @IsOptional()
  @IsEnum(['DRAFT', 'QUEUE', 'LIVE', 'ARCHIVED'])
  status?: 'DRAFT' | 'QUEUE' | 'LIVE' | 'ARCHIVED';
}
