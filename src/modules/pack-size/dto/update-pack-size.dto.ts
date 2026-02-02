import { PartialType } from '@nestjs/swagger';
import { CreatePackSizeDto } from './create-pack-size.dto';

export class UpdatePackSizeDto extends PartialType(CreatePackSizeDto) {}
