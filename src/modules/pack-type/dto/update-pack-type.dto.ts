import { PartialType } from '@nestjs/swagger';
import { CreatePackTypeDto } from './create-pack-type.dto';

export class UpdatePackTypeDto extends PartialType(CreatePackTypeDto) {}
