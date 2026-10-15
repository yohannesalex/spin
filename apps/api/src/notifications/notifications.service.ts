import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, Tx } from '../common/prisma.service';
import { sms } from './messages';
import { ConsoleSmsProvider, SMS_PROVIDER, SmsProvider } from './sms.provider';

type SmsKey = Parameters<typeof sms>[0];

/** §8: SMS only for security and money events; everything else is in-app. */
@Injectable()
export class NotificationsService {
  private log = new Logger('Notifications');
  constructor(private prisma: PrismaService, @Inject(SMS_PROVIDER) private smsProvider: SmsProvider) {}

  inApp(userId: string, kind: string, title: string, body: string, data?: object, tx?: Tx) {
    return (tx ?? this.prisma).notification.create({
      data: { userId, kind, title, body, data: data as Prisma.InputJsonValue },
    });
  }

  /** Fire-and-forget SMS in the user's language. Failures are logged, never thrown. */
  async smsUser(userId: string, key: SmsKey, params: Record<string, string | number> = {}) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { phone: true, language: true } });
    if (!user) return;
    this.smsProvider.send(user.phone, sms(key, user.language, params)).catch((e) => this.log.error(e.message));
  }

  /**
   * LOG_OTP=true also prints every code to the log, and a failed SMS no longer blocks the user
   * (they can be given the code from the log). Testing only: it breaks REQ-SEC-06 by design.
   */
  async sendOtp(phone: string, code: string, language: 'en' | 'am' = 'en') {
    const message = sms('otp', language, { code });
    if (process.env.LOG_OTP !== 'true') return this.smsProvider.sendOtp(phone, code, message);
    if (!(this.smsProvider instanceof ConsoleSmsProvider)) this.log.warn(`[LOG_OTP] ${phone}: ${code}`);
    await this.smsProvider.sendOtp(phone, code, message).catch((e) => this.log.error(`OTP SMS failed, code is in the log above: ${e.message}`));
  }

  /** REQ-NOT-01: admin alerts go to every admin's in-app inbox and optionally to Telegram. */
  async alertAdmins(title: string, body: string, data?: object) {
    const admins = await this.prisma.user.findMany({ where: { role: 'ADMIN', disabled: false }, select: { id: true } });
    await this.prisma.notification.createMany({
      data: admins.map((a) => ({ userId: a.id, kind: 'admin_alert', title, body, data: data as Prisma.InputJsonValue })),
    });
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chat = process.env.TELEGRAM_ADMIN_CHAT_ID;
    if (token && chat) {
      fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chat, text: `${title}\n${body}` }),
      }).catch((e) => this.log.error(`Telegram alert failed: ${e.message}`));
    }
  }
}
