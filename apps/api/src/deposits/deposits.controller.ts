import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { AllowRestricted, AuthUser, CurrentUser, PlayerOnly, Public } from '../common/auth.decorators';
import { Idempotent } from '../common/idempotency.interceptor';
import { DepositsService } from './deposits.service';
import { SimulateDepositDto, SubmitDepositDto } from './dto';

@Controller('deposits')
export class DepositsController {
  constructor(private deposits: DepositsService) {}

  @Public() @Get('info')
  info() {
    return this.deposits.depositInfo();
  }

  @Post() @PlayerOnly() @Idempotent()
  submit(@CurrentUser() user: AuthUser, @Body() dto: SubmitDepositDto) {
    return this.deposits.submit(user.id, dto);
  }

  /** TESTING ONLY — 403 unless DEPOSIT_SIMULATION=true. */
  @Post('simulate') @PlayerOnly() @Idempotent()
  simulate(@CurrentUser() user: AuthUser, @Body() dto: SimulateDepositDto) {
    return this.deposits.simulate(user.id, dto);
  }

  @Get() @PlayerOnly() @AllowRestricted()
  list(@CurrentUser() user: AuthUser) {
    return this.deposits.listForUser(user.id);
  }

  @Get(':id') @PlayerOnly() @AllowRestricted()
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.deposits.getForUser(user.id, id);
  }
}
