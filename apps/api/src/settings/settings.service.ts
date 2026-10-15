import { Global, Injectable, Module } from '@nestjs/common';
import { Prisma, Provider } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';

export interface ReceivingAccount {
  provider: Provider;
  accountNumber: string;
  accountName: string;
  active: boolean;
}

// REQ-DEP-08 / §7 Settings: everything an admin can change without a code release.
export interface AppSettings {
  defaultCommissionBps: number;
  minStakeCents: number;
  maxStakeCents: number;
  minDepositCents: number;
  maxDepositCents: number;
  dailyDepositLimitCents: number;
  depositDateWindowHours: number;
  senderNameMinScore: number;
  minWithdrawalCents: number;
  maxWithdrawalPerDayCents: number;
  withdrawalHoldHours: number; // REQ-PAY-04
  receivingAccounts: ReceivingAccount[];
  maintenanceMode: boolean;
  smsProvider: 'console' | 'afromessage';
}

export const DEFAULT_SETTINGS: AppSettings = {
  defaultCommissionBps: 2000,
  minStakeCents: 1000,
  maxStakeCents: 100000,
  minDepositCents: 5000,
  maxDepositCents: 5000000,
  dailyDepositLimitCents: 10000000,
  depositDateWindowHours: 24,
  senderNameMinScore: 0.85,
  minWithdrawalCents: 10000,
  maxWithdrawalPerDayCents: 5000000,
  withdrawalHoldHours: 24,
  receivingAccounts: [],
  maintenanceMode: false,
  smsProvider: (process.env.SMS_PROVIDER as 'console' | 'afromessage') || 'console',
};

export type SettingKey = keyof AppSettings;

@Injectable()
export class SettingsService {
  private cache: { at: number; value: AppSettings } | null = null;

  constructor(private prisma: PrismaService) {}

  async all(): Promise<AppSettings> {
    if (this.cache && Date.now() - this.cache.at < 5000) return this.cache.value;
    const rows = await this.prisma.setting.findMany();
    const value = { ...DEFAULT_SETTINGS } as AppSettings;
    for (const r of rows) if (r.key in DEFAULT_SETTINGS) (value as unknown as Record<string, unknown>)[r.key] = r.value;
    this.cache = { at: Date.now(), value };
    return value;
  }

  async get<K extends SettingKey>(key: K): Promise<AppSettings[K]> {
    return (await this.all())[key];
  }

  async set<K extends SettingKey>(key: K, value: AppSettings[K], by: string) {
    await this.prisma.setting.upsert({
      where: { key },
      create: { key, value: value as Prisma.InputJsonValue, updatedBy: by },
      update: { value: value as Prisma.InputJsonValue, updatedBy: by },
    });
    this.cache = null;
  }
}

@Global()
@Module({ providers: [SettingsService], exports: [SettingsService] })
export class SettingsModule {}
