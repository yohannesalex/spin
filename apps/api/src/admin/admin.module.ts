import { Module } from '@nestjs/common';
import { DepositsModule } from '../deposits/deposits.module';
import { GamesModule } from '../games/games.module';
import { UsersModule } from '../users/users.module';
import { WithdrawalsModule } from '../withdrawals/withdrawals.module';
import { AdminAdminsController } from './admin-admins.controller';
import { AdminAuditController } from './admin-audit.controller';
import { AdminDashboardController } from './admin-dashboard.controller';
import { AdminDepositsController } from './admin-deposits.controller';
import { AdminGamesController } from './admin-games.controller';
import { AdminPayoutsController } from './admin-payouts.controller';
import { AdminReportsController } from './admin-reports.controller';
import { AdminSettingsController } from './admin-settings.controller';
import { AdminUsersController } from './admin-users.controller';

@Module({
  imports: [DepositsModule, GamesModule, UsersModule, WithdrawalsModule],
  controllers: [
    AdminDashboardController,
    AdminDepositsController,
    AdminPayoutsController,
    AdminUsersController,
    AdminGamesController,
    AdminSettingsController,
    AdminReportsController,
    AdminAuditController,
    AdminAdminsController,
  ],
})
export class AdminModule {}
