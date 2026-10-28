import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_PAYMENT_SETTINGS,
  PaymentSettings,
  SettingsService,
} from './settings.service';

/**
 * Minimal typed stub for the prisma system-config delegate the settings
 * service uses — records upsert payloads without needing jest.fn().
 */
type SystemConfigStub = {
  systemConfig: {
    findUnique: () => Promise<{ key: string; value: unknown } | null>;
    upsert: (args: {
      where: { key: string };
      create: { key: string; value: PaymentSettings };
      update: { value: PaymentSettings };
    }) => Promise<unknown>;
  };
  upsertValues: PaymentSettings[];
};

const makePrisma = (
  storedValue: unknown,
  options?: { failUpsert?: boolean },
): SystemConfigStub => {
  const upsertValues: PaymentSettings[] = [];
  return {
    systemConfig: {
      findUnique: () =>
        Promise.resolve(
          storedValue === null
            ? null
            : { key: 'payment.settings', value: storedValue },
        ),
      upsert: (args) => {
        if (options?.failUpsert) {
          return Promise.reject(new Error('db unavailable'));
        }
        upsertValues.push(args.update.value);
        return Promise.resolve(undefined);
      },
    },
    upsertValues,
  };
};

const makeService = (stub: SystemConfigStub) =>
  new SettingsService(stub as unknown as PrismaService);

describe('SettingsService payment settings', () => {
  it('is fixed to MANUAL even when a legacy MONNIFY value is stored', async () => {
    const stub = makePrisma({
      method: 'MONNIFY',
      manualAccounts: [
        {
          id: 'a1',
          accountName: 'Acct',
          accountNumber: '1234567890',
          bankName: 'Bank',
          isVisible: true,
        },
      ],
    });
    const service = makeService(stub);

    const settings = await service.getPaymentSettings();

    expect(settings.method).toBe('MANUAL');
    expect(settings.manualAccounts).toHaveLength(1);
    expect(settings.manualAccounts[0]).toMatchObject({ id: 'a1' });
    // A visible account already exists, so nothing is seeded.
    expect(stub.upsertValues).toHaveLength(0);
  });

  it('seeds the default Moniepoint account on an empty database', async () => {
    const stub = makePrisma(null);
    const service = makeService(stub);

    const settings = await service.getPaymentSettings();

    expect(settings.method).toBe('MANUAL');
    expect(settings.manualAccounts).toEqual(
      DEFAULT_PAYMENT_SETTINGS.manualAccounts,
    );
    expect(stub.upsertValues).toEqual([settings]);
  });

  it('appends the default account when only hidden accounts exist', async () => {
    const stub = makePrisma({
      method: 'MANUAL',
      manualAccounts: [
        {
          id: 'a1',
          accountName: 'Acct',
          accountNumber: '1234567890',
          bankName: 'Bank',
          isVisible: false,
        },
      ],
    });
    const service = makeService(stub);

    const settings = await service.getPaymentSettings();

    expect(settings.manualAccounts).toHaveLength(2);
    expect(settings.manualAccounts[0]).toMatchObject({
      id: 'a1',
      isVisible: false,
    });
    expect(settings.manualAccounts[1]).toMatchObject({
      id: 'default-moniepoint',
      isVisible: true,
    });
    expect(stub.upsertValues).toEqual([settings]);
  });

  it('still returns the seeded account if persisting fails', async () => {
    const stub = makePrisma(null, { failUpsert: true });
    const service = makeService(stub);

    const settings = await service.getPaymentSettings();

    expect(settings.manualAccounts).toEqual(
      DEFAULT_PAYMENT_SETTINGS.manualAccounts,
    );
    expect(stub.upsertValues).toHaveLength(0);
  });

  it('rejects saving without a visible account', async () => {
    const stub = makePrisma(null);
    const service = makeService(stub);

    await expect(
      service.updatePaymentSettings({
        manualAccounts: [
          {
            id: 'a1',
            accountName: 'Acct',
            accountNumber: '1234567890',
            bankName: 'Bank',
            isVisible: false,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(stub.upsertValues).toHaveLength(0);
  });

  it('persists MANUAL regardless of a submitted legacy method', async () => {
    const stub = makePrisma(null);
    const service = makeService(stub);

    const saved = await service.updatePaymentSettings({
      method: 'MONNIFY',
      manualAccounts: [
        {
          accountName: ' Jooav Companies Limited ',
          accountNumber: '6548385435',
          bankName: 'Moniepoint MFB',
        },
      ],
    });

    expect(saved.method).toBe('MANUAL');
    expect(saved.manualAccounts[0]).toMatchObject({
      accountName: 'Jooav Companies Limited',
      accountNumber: '6548385435',
      bankName: 'Moniepoint MFB',
      isVisible: true,
    });
    expect(stub.upsertValues).toEqual([
      { method: 'MANUAL', manualAccounts: saved.manualAccounts },
    ]);
  });
});
