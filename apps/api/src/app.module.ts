import { BullModule } from '@nestjs/bullmq';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminModule } from './admin/admin.module';
import { AppController } from './app.controller';
import { AuditModule } from './audit/audit.service';
import { AuthModule } from './auth/auth.module';
import { AuthGuard } from './common/auth.guard';
import { CsrfMiddleware } from './common/csrf.middleware';
import { IdempotencyInterceptor } from './common/idempotency.interceptor';
import { MaintenanceMiddleware } from './common/maintenance.middleware';
import { PrismaModule } from './common/prisma.service';
import { DepositsModule } from './deposits/deposits.module';
import { FlagsModule } from './flags/flags.service';
import { GamesModule } from './games/games.module';
import { MaintenanceService } from './jobs/maintenance.service';
import { NotificationsModule } from './notifications/notifications.module';
import { SettingsModule } from './settings/settings.service';
import { StorageModule } from './storage/storage.service';
import { WalletModule } from './wallet/wallet.module';
import { WithdrawalsModule } from './withdrawals/withdrawals.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.register({ global: true, secret: process.env.JWT_ACCESS_SECRET }),
    ScheduleModule.forRoot(),
    // Default API rate limit; stricter limits are set per route (login, OTP, joins).
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    BullModule.forRoot({ connection: { url: process.env.REDIS_URL || 'redis://localhost:6379' } as never }),
    PrismaModule,
    SettingsModule,
    AuditModule,
    StorageModule,
    NotificationsModule,
    FlagsModule,
    AuthModule,
    WalletModule,
    DepositsModule,
    WithdrawalsModule,
    GamesModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [
    MaintenanceService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CsrfMiddleware, MaintenanceMiddleware).forRoutes('*');
  }
}
