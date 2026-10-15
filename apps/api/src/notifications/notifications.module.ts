import { Global, Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { createSmsProvider, SMS_PROVIDER } from './sms.provider';

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, { provide: SMS_PROVIDER, useFactory: createSmsProvider }],
  exports: [NotificationsService],
})
export class NotificationsModule {}
