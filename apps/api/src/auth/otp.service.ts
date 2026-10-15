import { BadRequestException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { OtpPurpose } from '@prisma/client';
import { createHmac, randomInt, timingSafeEqual } from 'crypto';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

// §3.2 OTP rules
export const OTP_RULES = {
  validityMs: 5 * 60_000,
  maxAttempts: 5,
  resendCooldownMs: 60_000,
  perPhoneHour: 5,
  perPhoneDay: 10,
  perIpHour: 20,
};

@Injectable()
export class OtpService {
  constructor(private prisma: PrismaService, private notifications: NotificationsService) {}

  /** Codes are stored as an HMAC keyed with a server secret — never in plain text or logs. */
  private hash(phone: string, purpose: OtpPurpose, code: string) {
    return createHmac('sha256', process.env.JWT_ACCESS_SECRET!).update(`${phone}:${purpose}:${code}`).digest('hex');
  }

  async issue(phone: string, purpose: OtpPurpose, ip: string | null, language: 'en' | 'am' = 'en'): Promise<void> {
    const now = Date.now();
    const hourAgo = new Date(now - 3600_000);
    const dayAgo = new Date(now - 86400_000);
    const [last, phoneHour, phoneDay, ipHour] = await Promise.all([
      this.prisma.otpCode.findFirst({ where: { phone }, orderBy: { createdAt: 'desc' } }),
      this.prisma.otpCode.count({ where: { phone, createdAt: { gte: hourAgo } } }),
      this.prisma.otpCode.count({ where: { phone, createdAt: { gte: dayAgo } } }),
      ip ? this.prisma.otpCode.count({ where: { ip, createdAt: { gte: hourAgo } } }) : Promise.resolve(0),
    ]);
    if (last && now - last.createdAt.getTime() < OTP_RULES.resendCooldownMs) {
      const wait = Math.ceil((OTP_RULES.resendCooldownMs - (now - last.createdAt.getTime())) / 1000);
      throw new HttpException(`Please wait ${wait}s before requesting another code`, HttpStatus.TOO_MANY_REQUESTS);
    }
    if (phoneHour >= OTP_RULES.perPhoneHour || phoneDay >= OTP_RULES.perPhoneDay || ipHour >= OTP_RULES.perIpHour) {
      throw new HttpException('Too many codes requested. Try again later.', HttpStatus.TOO_MANY_REQUESTS);
    }
    // Only one live code per phone + purpose.
    await this.prisma.otpCode.updateMany({
      where: { phone, purpose, usedAt: null, voidedAt: null },
      data: { voidedAt: new Date() },
    });
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    await this.prisma.otpCode.create({
      data: { phone, purpose, ip, codeHash: this.hash(phone, purpose, code), expiresAt: new Date(now + OTP_RULES.validityMs) },
    });
    await this.notifications.sendOtp(phone, code, language);
  }

  /** Consumes the code on success. Throws on wrong/expired codes; voids after 5 wrong attempts. */
  async verify(phone: string, purpose: OtpPurpose, code: string): Promise<void> {
    const otp = await this.prisma.otpCode.findFirst({
      where: { phone, purpose, usedAt: null, voidedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp || otp.expiresAt < new Date()) throw new BadRequestException('Code expired. Request a new one.');
    const a = Buffer.from(otp.codeHash, 'hex');
    const b = Buffer.from(this.hash(phone, purpose, String(code ?? '')), 'hex');
    if (a.length === b.length && timingSafeEqual(a, b)) {
      // Conditional update so a code can only be used once even under concurrent requests.
      const used = await this.prisma.otpCode.updateMany({ where: { id: otp.id, usedAt: null }, data: { usedAt: new Date() } });
      if (used.count === 1) return;
    }
    const attempts = otp.attempts + 1;
    await this.prisma.otpCode.update({
      where: { id: otp.id },
      data: { attempts, voidedAt: attempts >= OTP_RULES.maxAttempts ? new Date() : undefined },
    });
    throw new BadRequestException(
      attempts >= OTP_RULES.maxAttempts ? 'Too many wrong attempts. Request a new code.' : 'Incorrect code',
    );
  }
}
