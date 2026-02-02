import { ApiProperty } from '@nestjs/swagger';
import { PackTypeStatus } from '../../../common/enums';

export class PackTypeResponseDto {
  @ApiProperty({
    description: 'Pack type unique identifier',
    example: 'cuid_example_pack_type_id',
  })
  id: string;

  @ApiProperty({
    description: 'Pack type name',
    example: 'Single Pack',
  })
  name: string;

  @ApiProperty({
    description: 'Variant ID that this pack type belongs to',
    example: 'cuid_example_variant_id',
  })
  variantId: string;

  @ApiProperty({
    description: 'Pack type status',
    enum: PackTypeStatus,
    example: PackTypeStatus.ACTIVE,
  })
  status: PackTypeStatus;

  @ApiProperty({
    description: 'User who created this pack type',
    example: 'cuid_example_user_id',
  })
  createdBy: string;

  @ApiProperty({
    description: 'User who last updated this pack type',
    example: 'cuid_example_user_id',
  })
  updatedBy: string;

  @ApiProperty({
    description: 'User who deleted this pack type',
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
