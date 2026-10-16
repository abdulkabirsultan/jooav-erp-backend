import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

export const PAYMENT_SETTINGS_KEY = 'payment.settings';
export const PAYMENT_METHODS = ['MONNIFY', 'MANUAL'] as const;
export const MAX_MANUAL_ACCOUNTS = 10;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export interface ManualPaymentAccount {
  id: string;
  accountName: string;
  accountNumber: string;
  bankName: string;
  isVisible: boolean;
}

export interface PaymentSettings {
  method: PaymentMethod;
  manualAccounts: ManualPaymentAccount[];
}

export const DEFAULT_PAYMENT_SETTINGS: PaymentSettings = {
  method: 'MONNIFY',
  manualAccounts: [],
};

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(private readonly prismaService: PrismaService) {}

  /**
   * Full payment settings for the admin app (includes hidden accounts).
   */
  async getPaymentSettings(): Promise<PaymentSettings> {
    const config = await this.prismaService.systemConfig.findUnique({
      where: { key: PAYMENT_SETTINGS_KEY },
    });

    return this.normalize(config?.value);
  }

  /**
   * Payment settings for the marketplace: hidden accounts are stripped.
   */
  async getPublicPaymentSettings(): Promise<PaymentSettings> {
    const settings = await this.getPaymentSettings();

    return {
      ...settings,
      manualAccounts: settings.manualAccounts.filter(
        (account) => account.isVisible,
      ),
    };
  }

  async updatePaymentSettings(input: {
    method: PaymentMethod;
    manualAccounts: Array<{
      id?: string;
      accountName: string;
      accountNumber: string;
      bankName: string;
      isVisible?: boolean;
    }>;
  }): Promise<PaymentSettings> {
    if (!PAYMENT_METHODS.includes(input.method)) {
      throw new BadRequestException(
        `Invalid payment method. Allowed values: ${PAYMENT_METHODS.join(', ')}`,
      );
    }

    if (!Array.isArray(input.manualAccounts)) {
      throw new BadRequestException('manualAccounts must be an array');
    }

    if (input.manualAccounts.length > MAX_MANUAL_ACCOUNTS) {
      throw new BadRequestException(
        `A maximum of ${MAX_MANUAL_ACCOUNTS} manual accounts is allowed`,
      );
    }

    const manualAccounts = input.manualAccounts
      .map((account) => this.normalizeAccount(account))
      .filter((account): account is ManualPaymentAccount => account !== null);

    if (manualAccounts.length !== input.manualAccounts.length) {
      throw new BadRequestException(
        'Each manual account requires an account name, account number and bank name',
      );
    }

    if (
      input.method === 'MANUAL' &&
      !manualAccounts.some((account) => account.isVisible)
    ) {
      throw new BadRequestException(
        'At least one visible bank account is required when manual payment is enabled',
      );
    }

    const settings: PaymentSettings = { method: input.method, manualAccounts };

    await this.prismaService.systemConfig.upsert({
      where: { key: PAYMENT_SETTINGS_KEY },
      create: {
        key: PAYMENT_SETTINGS_KEY,
        value: settings as unknown as Prisma.InputJsonValue,
      },
      update: {
        value: settings as unknown as Prisma.InputJsonValue,
      },
    });

    this.logger.log(
      `Payment settings updated (method: ${settings.method}, accounts: ${settings.manualAccounts.length})`,
    );

    return settings;
  }

  private normalize(value: unknown): PaymentSettings {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { ...DEFAULT_PAYMENT_SETTINGS };
    }

    const raw = value as Record<string, unknown>;
    const method = PAYMENT_METHODS.includes(raw.method as PaymentMethod)
      ? (raw.method as PaymentMethod)
      : DEFAULT_PAYMENT_SETTINGS.method;

    const manualAccounts = Array.isArray(raw.manualAccounts)
      ? raw.manualAccounts
          .map((account) => this.normalizeAccount(account))
          .filter(
            (account): account is ManualPaymentAccount => account !== null,
          )
          .slice(0, MAX_MANUAL_ACCOUNTS)
      : [];

    return { method, manualAccounts };
  }

  private normalizeAccount(raw: unknown): ManualPaymentAccount | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return null;
    }

    const account = raw as Record<string, unknown>;
    const accountName = this.clean(account.accountName);
    const accountNumber = this.clean(account.accountNumber);
    const bankName = this.clean(account.bankName);

    if (!accountName || !accountNumber || !bankName) {
      return null;
    }

    const id = this.clean(account.id) || randomUUID();

    return {
      id,
      accountName,
      accountNumber,
      bankName,
      isVisible: account.isVisible !== false,
    };
  }

  private clean(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }
}
