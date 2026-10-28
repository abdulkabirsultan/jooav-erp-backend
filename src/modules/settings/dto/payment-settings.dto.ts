import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  MAX_MANUAL_ACCOUNTS,
  PAYMENT_METHODS,
  type PaymentMethod,
} from '../settings.service';

export class ManualPaymentAccountDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  id?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  accountName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  accountNumber: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  bankName: string;

  @IsOptional()
  @IsBoolean()
  isVisible?: boolean;
}

export class UpdatePaymentSettingsDto {
  /**
   * Optional for backward compatibility with older dashboard builds; the
   * payment method is always MANUAL, so this value is ignored.
   */
  @IsOptional()
  @IsIn(PAYMENT_METHODS)
  method?: PaymentMethod;

  @IsArray()
  @ArrayMaxSize(MAX_MANUAL_ACCOUNTS)
  @ValidateNested({ each: true })
  @Type(() => ManualPaymentAccountDto)
  manualAccounts: ManualPaymentAccountDto[];
}
