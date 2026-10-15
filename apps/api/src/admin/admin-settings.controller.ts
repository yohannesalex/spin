import { BadRequestException, Body, Controller, Get, Param, Put } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AuthUser, CurrentUser, RequirePermission } from '../common/auth.decorators';
import { Meta, RequestMeta } from '../common/request-meta';
import { DEFAULT_SETTINGS, SettingKey, SettingsService } from '../settings/settings.service';
import { SettingDto } from './dto';

const INT_KEYS: SettingKey[] = [
  'defaultCommissionBps', 'minStakeCents', 'maxStakeCents', 'minDepositCents', 'maxDepositCents', 'dailyDepositLimitCents',
  'depositDateWindowHours', 'minWithdrawalCents', 'maxWithdrawalPerDayCents', 'withdrawalHoldHours',
];

function validate(key: SettingKey, value: unknown): unknown {
  if (INT_KEYS.includes(key)) {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) throw new BadRequestException(`${key} must be a non-negative integer`);
    if (key === 'defaultCommissionBps' && value > 5000) throw new BadRequestException('Commission cannot exceed 50%');
    return value;
  }
  switch (key) {
    case 'senderNameMinScore':
      if (typeof value !== 'number' || value < 0.5 || value > 1) throw new BadRequestException('Score must be between 0.5 and 1');
      return value;
    case 'maintenanceMode':
      if (typeof value !== 'boolean') throw new BadRequestException('Must be true or false');
      return value;
    case 'smsProvider':
      if (value !== 'console' && value !== 'afromessage') throw new BadRequestException('Unknown SMS provider');
      return value;
    case 'receivingAccounts':
      if (!Array.isArray(value)) throw new BadRequestException('Must be a list');
      return value.map((a) => {
        if (!a || !['TELEBIRR', 'CBE'].includes(a.provider) || typeof a.accountNumber !== 'string' || typeof a.accountName !== 'string') {
          throw new BadRequestException('Each account needs provider, accountNumber and accountName');
        }
        return { provider: a.provider, accountNumber: a.accountNumber.trim(), accountName: a.accountName.trim(), active: a.active !== false };
      });
    default:
      throw new BadRequestException('Unknown setting');
  }
}

/**
 * §7 Settings / REQ-DEP-08. OTP provider *keys* are secrets and live in environment variables
 * (REQ-SEC-06); the provider choice is shown here, the keys are not.
 */
@Controller('admin/settings')
@RequirePermission('settings.manage')
export class AdminSettingsController {
  constructor(private settings: SettingsService, private audit: AuditService) {}

  @Get()
  async get() {
    return {
      settings: await this.settings.all(),
      secrets: {
        afromessageConfigured: !!process.env.AFROMESSAGE_TOKEN,
        telegramConfigured: !!process.env.TELEGRAM_BOT_TOKEN,
        turnstileConfigured: !!process.env.TURNSTILE_SECRET,
        receiptRelayConfigured: !!process.env.RECEIPT_RELAY_URL,
      },
    };
  }

  @Put(':key')
  async set(@Param('key') key: string, @Body() body: SettingDto, @CurrentUser() a: AuthUser, @Meta() m: RequestMeta) {
    if (!(key in DEFAULT_SETTINGS)) throw new BadRequestException('Unknown setting');
    const k = key as SettingKey;
    const value = validate(k, body.value);
    const before = await this.settings.get(k);
    await this.settings.set(k, value as never, a.id);
    await this.audit.log({ actorId: a.id, action: 'settings.update', targetType: 'setting', targetId: k, before, after: value, reason: body.reason, ip: m.ip });
    return { key, value };
  }
}
