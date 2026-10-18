import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { MAX_WAREHOUSE_CONTACTS } from '../settings.service';

export class WarehouseContactDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  id?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  phone: string;
}

export class UpdateWarehouseSettingsDto {
  @IsArray()
  @ArrayMaxSize(MAX_WAREHOUSE_CONTACTS)
  @ValidateNested({ each: true })
  @Type(() => WarehouseContactDto)
  contacts: WarehouseContactDto[];
}
