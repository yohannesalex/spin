import { Body, Controller, Get, Post } from '@nestjs/common';
import { AllowRestricted, AuthUser, CurrentUser, PlayerOnly } from '../common/auth.decorators';
import { Idempotent } from '../common/idempotency.interceptor';
import { RequestWithdrawalDto } from './dto';
import { WithdrawalsService } from './withdrawals.service';

@Controller('withdrawals')
@PlayerOnly()
export class WithdrawalsController {
  constructor(private withdrawals: WithdrawalsService) {}

  @Post() @Idempotent()
  request(@CurrentUser() user: AuthUser, @Body() dto: RequestWithdrawalDto) {
    return this.withdrawals.request(user.id, dto);
  }

  @Get() @AllowRestricted()
  list(@CurrentUser() user: AuthUser) {
    return this.withdrawals.listForUser(user.id);
  }
}
