import { Module } from '@nestjs/common';
import { WalletModule } from '../wallet/wallet.module';
import { GamesController } from './games.controller';
import { GamesGateway } from './games.gateway';
import { GamesScheduler } from './games.scheduler';
import { GamesService } from './games.service';

@Module({
  imports: [WalletModule],
  controllers: [GamesController],
  providers: [GamesService, GamesGateway, GamesScheduler],
  exports: [GamesService],
})
export class GamesModule {}
