import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { WalletModule } from '../wallet/wallet.module';
import { DepositsController } from './deposits.controller';
import { DepositsProcessor } from './deposits.processor';
import { DEPOSIT_QUEUE } from './deposits.queue';
import { DepositsService } from './deposits.service';

@Module({
  imports: [WalletModule, BullModule.registerQueue({ name: DEPOSIT_QUEUE })],
  controllers: [DepositsController],
  providers: [DepositsService, DepositsProcessor],
  exports: [DepositsService],
})
export class DepositsModule {}
