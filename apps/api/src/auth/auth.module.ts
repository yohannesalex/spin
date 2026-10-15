import { Module } from '@nestjs/common';
import { WalletModule } from '../wallet/wallet.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { TokensService } from './tokens.service';

@Module({
  imports: [WalletModule],
  controllers: [AuthController],
  providers: [AuthService, OtpService, TokensService],
  exports: [TokensService, OtpService],
})
export class AuthModule {}
