import { Module } from '@nestjs/common';
import { WalletModule } from '../wallet/wallet.module';
import { WithdrawalsModule } from '../withdrawals/withdrawals.module';
import { UsersService } from './users.service';

@Module({ imports: [WalletModule, WithdrawalsModule], providers: [UsersService], exports: [UsersService] })
export class UsersModule {}
