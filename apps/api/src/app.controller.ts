import { Controller, Get } from '@nestjs/common';
import { Public } from './common/auth.decorators';
import { SettingsService } from './settings/settings.service';

@Controller()
export class AppController {
  constructor(private settings: SettingsService) {}

  @Public() @Get('health')
  health() {
    return { ok: true, time: Date.now() };
  }

  /** Public, non-sensitive config for the web app (rules page, deposit limits). */
  @Public() @Get('config')
  async config() {
    const s = await this.settings.all();
    return {
      defaultCommissionBps: s.defaultCommissionBps,
      minDepositCents: s.minDepositCents,
      maxDepositCents: s.maxDepositCents,
      minWithdrawalCents: s.minWithdrawalCents,
      withdrawalHoldHours: s.withdrawalHoldHours,
      maintenanceMode: s.maintenanceMode,
    };
  }
}
