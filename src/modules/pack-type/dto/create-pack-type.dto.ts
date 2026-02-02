import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreatePackTypeDto {
  @ApiProperty({
    description: 'Pack type name',
    example: 'Single Pack',
    maxLength: 50,
  })
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  name: string;

  @ApiProperty({
    description: 'Variant ID that this pack type belongs to',
    example: 'cuid_example_variant_id',
  })
  @IsNotEmpty()
  @IsString()
  variantId: string;
}
