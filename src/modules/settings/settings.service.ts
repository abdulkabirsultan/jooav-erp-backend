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
  method: 'MANUAL',
  manualAccounts: [
    {
      id: 'default-moniepoint',
      accountName: 'Jooav Companies Limited',
      accountNumber: '6548385435',
      bankName: 'Moniepoint MFB',
      isVisible: true,
    },
  ],
};

export const WAREHOUSE_SETTINGS_KEY = 'warehouse.settings';
export const MAX_WAREHOUSE_CONTACTS = 5;

export interface WarehouseContact {
  id: string;
  name: string;
  phone: string; // International format, digits only (e.g. 2348167163339)
}

export interface WarehouseSettings {
  contacts: WarehouseContact[];
}

export const DEFAULT_WAREHOUSE_SETTINGS: WarehouseSettings = {
  contacts: [
    {
      id: 'default-warehouse',
      name: 'Warehouse',
      phone: '2348167163339',
    },
  ],
};

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(private readonly prismaService: PrismaService) {}

  /**
   * Full payment settings for the admin app (includes hidden accounts).
   *
   * The payment method is fixed to MANUAL: when no visible manual account
   * exists (e.g. a fresh database), the default Moniepoint account is seeded
   * once. Afterwards the dashboard enforces keeping at least one visible
   * account, so the seed never runs again.
   */
  async getPaymentSettings(): Promise<PaymentSettings> {
    const config = await this.prismaService.systemConfig.findUnique({
      where: { key: PAYMENT_SETTINGS_KEY },
    });

    const settings = this.normalize(config?.value);

    if (!settings.manualAccounts.some((account) => account.isVisible)) {
      settings.manualAccounts = [
        ...settings.manualAccounts,
        { ...DEFAULT_PAYMENT_SETTINGS.manualAccounts[0] },
      ];

      try {
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
      } catch (error) {
        this.logger.warn(
          `Could not persist the default manual payment account: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return settings;
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
    /**
     * Kept optional for older dashboard builds; ignored — the payment
     * method is always MANUAL.
     */
    method?: PaymentMethod;
    manualAccounts: Array<{
      id?: string;
      accountName: string;
      accountNumber: string;
      bankName: string;
      isVisible?: boolean;
    }>;
  }): Promise<PaymentSettings> {
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

    if (!manualAccounts.some((account) => account.isVisible)) {
      throw new BadRequestException(
        'At least one visible bank account is required for manual payments',
      );
    }

    const settings: PaymentSettings = {
      method: 'MANUAL',
      manualAccounts,
    };

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

  /**
   * Warehouse contacts used when sharing orders over WhatsApp in the admin.
   */
  async getWarehouseSettings(): Promise<WarehouseSettings> {
    const config = await this.prismaService.systemConfig.findUnique({
      where: { key: WAREHOUSE_SETTINGS_KEY },
    });

    return this.normalizeWarehouse(config?.value);
  }

  async updateWarehouseSettings(input: {
    contacts: Array<{ id?: string; name: string; phone: string }>;
  }): Promise<WarehouseSettings> {
    if (!Array.isArray(input.contacts)) {
      throw new BadRequestException('contacts must be an array');
    }

    if (input.contacts.length > MAX_WAREHOUSE_CONTACTS) {
      throw new BadRequestException(
        `A maximum of ${MAX_WAREHOUSE_CONTACTS} warehouse contacts is allowed`,
      );
    }

    const contacts = input.contacts
      .map((contact) => this.normalizeWarehouseContact(contact))
      .filter((contact): contact is WarehouseContact => contact !== null);

    if (contacts.length !== input.contacts.length) {
      throw new BadRequestException(
        'Each warehouse contact requires a name and a valid phone number',
      );
    }

    const settings: WarehouseSettings = { contacts };

    await this.prismaService.systemConfig.upsert({
      where: { key: WAREHOUSE_SETTINGS_KEY },
      create: {
        key: WAREHOUSE_SETTINGS_KEY,
        value: settings as unknown as Prisma.InputJsonValue,
      },
      update: {
        value: settings as unknown as Prisma.InputJsonValue,
      },
    });

    this.logger.log(
      `Warehouse settings updated (contacts: ${settings.contacts.length})`,
    );

    return settings;
  }

  private normalize(value: unknown): PaymentSettings {
    // The payment method is fixed to MANUAL.
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { method: 'MANUAL', manualAccounts: [] };
    }

    const raw = value as Record<string, unknown>;

    const manualAccounts = Array.isArray(raw.manualAccounts)
      ? raw.manualAccounts
          .map((account) => this.normalizeAccount(account))
          .filter(
            (account): account is ManualPaymentAccount => account !== null,
          )
          .slice(0, MAX_MANUAL_ACCOUNTS)
      : [];

    return { method: 'MANUAL', manualAccounts };
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

  private normalizeWarehouse(value: unknown): WarehouseSettings {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { contacts: [...DEFAULT_WAREHOUSE_SETTINGS.contacts] };
    }

    const raw = value as Record<string, unknown>;
    const contacts = Array.isArray(raw.contacts)
      ? raw.contacts
          .map((contact) => this.normalizeWarehouseContact(contact))
          .filter((contact): contact is WarehouseContact => contact !== null)
          .slice(0, MAX_WAREHOUSE_CONTACTS)
      : [];

    return { contacts };
  }

  private normalizeWarehouseContact(raw: unknown): WarehouseContact | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return null;
    }

    const contact = raw as Record<string, unknown>;
    const name = this.clean(contact.name);
    const phone = this.normalizePhone(contact.phone);

    if (!name || !phone) {
      return null;
    }

    const id = this.clean(contact.id) || randomUUID();

    return { id, name, phone };
  }

  private normalizePhone(value: unknown): string {
    const digits = typeof value === 'string' ? value.replace(/\D/g, '') : '';

    // Accept local Nigerian format (0816...) and convert to international.
    const phone = digits.startsWith('0') ? `234${digits.slice(1)}` : digits;

    return phone.length >= 10 && phone.length <= 15 ? phone : '';
  }

  private clean(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }
}
