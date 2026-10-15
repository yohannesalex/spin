import { Controller, Get, Query } from '@nestjs/common';
import { AllowRestricted, AuthUser, CurrentUser, PlayerOnly } from '../common/auth.decorators';
import { WalletService } from './wallet.service';

@Controller('wallet')
@PlayerOnly()
export class WalletController {
  constructor(private wallets: WalletService) {}

  @Get()
  @AllowRestricted()
  summary(@CurrentUser() user: AuthUser) {
    return this.wallets.summary(user.id);
  }

  @Get('ledger')
  @AllowRestricted()
  async ledger(@CurrentUser() user: AuthUser, @Query() q: Record<string, string>) {
    const wallet = await this.wallets.ensureWallet(user.id);
    return this.wallets.history(wallet.id, { ...q, page: Number(q.page), pageSize: Number(q.pageSize) });
  }
}
