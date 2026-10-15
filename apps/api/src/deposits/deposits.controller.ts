import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AllowRestricted, AuthUser, CurrentUser, PlayerOnly, Public } from '../common/auth.decorators';
import { Idempotent } from '../common/idempotency.interceptor';
import { DepositsService } from './deposits.service';
import { SubmitDepositDto } from './dto';

@Controller('deposits')
export class DepositsController {
  constructor(private deposits: DepositsService) {}

  @Public() @Get('info')
  info() {
    return this.deposits.depositInfo();
  }

  @Post() @PlayerOnly() @Idempotent()
  @UseInterceptors(FileInterceptor('receipt', { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  submit(@CurrentUser() user: AuthUser, @Body() dto: SubmitDepositDto, @UploadedFile() file?: Express.Multer.File) {
    return this.deposits.submit(user.id, dto, file);
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
