import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreatePackSizeDto {
  @ApiProperty({
    description: 'Pack size name',
    example: '70g',
    maxLength: 50,
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  name: string;

  @ApiProperty({
    description: 'Variant ID that this pack size belongs to',
    example: 'cuid_example_variant_id',
  })
  @IsNotEmpty()
  @IsString()
  variantId: string;
}
