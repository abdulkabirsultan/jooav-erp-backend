import { ApiProperty } from '@nestjs/swagger';
import { PackSizeStatus } from '../../../common/enums';

export class PackSizeResponseDto {
  @ApiProperty({
    description: 'Pack size unique identifier',
    example: 'cuid_example_pack_size_id',
  })
  id: string;

  @ApiProperty({
    description: 'Pack size name',
    example: '70g',
  })
  name: string;

  @ApiProperty({
    description: 'Variant ID that this pack size belongs to',
    example: 'cuid_example_variant_id',
  })
  variantId: string;

  @ApiProperty({
    description: 'Pack size status',
    enum: PackSizeStatus,
    example: PackSizeStatus.ACTIVE,
  })
  status: PackSizeStatus;

  @ApiProperty({
    description: 'User who created this pack size',
    example: 'cuid_example_user_id',
  })
  createdBy: string;

  @ApiProperty({
    description: 'User who last updated this pack size',
    example: 'cuid_example_user_id',
  })
  updatedBy: string;

  @ApiProperty({
    description: 'User who deleted this pack size',
    example: 'cuid_example_user_id',
    nullable: true,
  })
  deletedBy: string | null;

  @ApiProperty({
    description: 'Creation timestamp',
    example: '2024-01-15T10:30:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Last update timestamp',
    example: '2024-01-15T10:30:00.000Z',
  })
  updatedAt: Date;

  @ApiProperty({
    description: 'Deletion timestamp',
    example: '2024-01-15T10:30:00.000Z',
    nullable: true,
  })
  deletedAt: Date | null;
}
