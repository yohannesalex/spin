import { BadRequestException, ConflictException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import type { Response } from 'express';
import { isStaff } from '../common/permissions';
import { normalizePhone } from '../common/phone';
import { PrismaService } from '../common/prisma.service';
import { RequestMeta } from '../common/request-meta';
import { NotificationsService } from '../notifications/notifications.service';
import { WalletService } from '../wallet/wallet.service';
import { LoginDto, RegisterDto, ResetPasswordDto } from './dto';
import { OtpService } from './otp.service';
import { TokensService } from './tokens.service';
import { verifyTurnstile } from './turnstile';

const BCRYPT_ROUNDS = 12;
const LOCK_AFTER = 5;
const LOCK_MS = 15 * 60_000;
// Used to keep timing similar when the phone does not exist.
const DUMMY_HASH = bcrypt.hashSync('dummy-password-1', 10);

export function publicUser(u: User) {
  return {
    id: u.id,
    fullName: u.fullName,
    phone: u.phone,
    role: u.role,
    status: u.status,
    language: u.language,
    createdAt: u.createdAt,
  };
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private otp: OtpService,
    private tokens: TokensService,
    private jwt: JwtService,
    private wallets: WalletService,
    private notifications: NotificationsService,
  ) {}

  private phoneOrThrow(input: string) {
    const phone = normalizePhone(input);
    if (!phone) throw new BadRequestException('Enter a valid Ethiopian mobile number (+251 9… or +251 7…)');
    return phone;
  }

  // ---------- §3.1 Registration ----------
  async register(dto: RegisterDto, meta: RequestMeta) {
    if (!(await verifyTurnstile(dto.turnstileToken, meta.ip))) throw new BadRequestException('Bot check failed');
    const phone = this.phoneOrThrow(dto.phone);
    const existing = await this.prisma.user.findUnique({ where: { phone } });
    if (existing && existing.status !== 'PENDING') throw new ConflictException('This phone number is already registered');
    const data = {
      fullName: dto.fullName.trim().replace(/\s+/g, ' '),
      passwordHash: await bcrypt.hash(dto.password, BCRYPT_ROUNDS),
      language: dto.language ?? 'en',
    };
    if (existing) await this.prisma.user.update({ where: { id: existing.id }, data });
    else await this.prisma.user.create({ data: { ...data, phone } });
    await this.otp.issue(phone, 'REGISTER', meta.ip, data.language);
    return { phone, otpSent: true };
  }

  async verifyRegistration(phoneInput: string, code: string, meta: RequestMeta, res: Response) {
    const phone = this.phoneOrThrow(phoneInput);
    const user = await this.prisma.user.findUnique({ where: { phone } });
    if (!user || user.status !== 'PENDING') throw new BadRequestException('Nothing to verify for this number');
    await this.otp.verify(phone, 'REGISTER', code);
    const active = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.update({ where: { id: user.id }, data: { status: 'ACTIVE' } });
      await this.wallets.ensureWallet(u.id, tx);
      return u;
    });
    await this.tokens.startSession(res, active.id, meta);
    return { user: publicUser(active) };
  }

  async resendOtp(phoneInput: string, purpose: 'REGISTER' | 'RESET', meta: RequestMeta) {
    const phone = this.phoneOrThrow(phoneInput);
    const user = await this.prisma.user.findUnique({ where: { phone } });
    const eligible = purpose === 'REGISTER' ? user?.status === 'PENDING' : user && user.status !== 'PENDING' && !isStaff(user.role);
    // Same response either way (no account enumeration).
    if (eligible) await this.otp.issue(phone, purpose, meta.ip, user!.language);
    return { ok: true };
  }

  // ---------- §3.3 Login ----------
  async login(dto: LoginDto, meta: RequestMeta, res: Response, adminPortal: boolean) {
    const phone = normalizePhone(dto.phone);
    const user = phone ? await this.prisma.user.findUnique({ where: { phone } }) : null;
    if (!user) {
      await bcrypt.compare(dto.password, DUMMY_HASH);
      throw new UnauthorizedException('Wrong phone number or password');
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const mins = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
      throw new ForbiddenException(`Account locked. Try again in ${mins} minute(s).`);
    }
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    await this.prisma.loginEvent.create({
      data: { userId: user.id, success: ok, ip: meta.ip, device: meta.device, fingerprint: meta.fingerprint },
    });
    if (!ok) {
      const failed = user.failedLogins + 1;
      const lock = failed >= LOCK_AFTER;
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLogins: lock ? 0 : failed, lockedUntil: lock ? new Date(Date.now() + LOCK_MS) : undefined },
      });
      if (lock) {
        await this.notifications.smsUser(user.id, 'account_locked');
        await this.notifications.inApp(user.id, 'security', 'Account locked', 'Your account was locked for 15 minutes after 5 failed logins.');
        throw new ForbiddenException('Too many failed attempts. Account locked for 15 minutes.');
      }
      throw new UnauthorizedException('Wrong phone number or password');
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });

    const current = await this.liftExpiredBan(user);
    if (current.status === 'BANNED') {
      // REQ-AUTH-07: banned users cannot log in and see the reason.
      throw new ForbiddenException({
        message: 'Your account is banned',
        banReason: current.banReason,
        bannedUntil: current.bannedUntil,
      });
    }
    if (current.disabled) throw new ForbiddenException('This account is disabled');
    if (current.status === 'PENDING') {
      await this.otp.issue(current.phone, 'REGISTER', meta.ip, current.language).catch(() => undefined);
      return { verificationRequired: true, phone: current.phone };
    }

    if (isStaff(current.role)) {
      if (!adminPortal) throw new ForbiddenException('Admins sign in through the admin portal');
      // REQ-ROLE-02: second factor by OTP to the admin's phone.
      await this.otp.issue(current.phone, 'ADMIN_2FA', meta.ip, current.language);
      const challenge = await this.jwt.signAsync({ sub: current.id, purpose: 'admin_2fa' }, { expiresIn: 300 });
      return { twoFactorRequired: true, challenge };
    }
    if (adminPortal) throw new ForbiddenException('Not an admin account');

    await this.tokens.startSession(res, current.id, meta);
    return { user: publicUser(current) };
  }

  async adminTwoFactor(challenge: string, code: string, meta: RequestMeta, res: Response) {
    let sub: string;
    try {
      const p = await this.jwt.verifyAsync<{ sub: string; purpose: string }>(challenge);
      if (p.purpose !== 'admin_2fa') throw new Error();
      sub = p.sub;
    } catch {
      throw new UnauthorizedException('Login expired, start again');
    }
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: sub } });
    if (!isStaff(user.role) || user.disabled || user.status === 'BANNED') throw new ForbiddenException();
    await this.otp.verify(user.phone, 'ADMIN_2FA', code);
    await this.tokens.startSession(res, user.id, meta, true);
    return { user: publicUser(user) };
  }

  private async liftExpiredBan(user: User): Promise<User> {
    if (user.status === 'BANNED' && user.bannedUntil && user.bannedUntil < new Date()) {
      const lifted = await this.prisma.user.update({
        where: { id: user.id },
        data: { status: 'ACTIVE', banReason: null, bannedUntil: null },
      });
      await this.prisma.ban.updateMany({ where: { userId: user.id, liftedAt: null }, data: { liftedAt: new Date(), liftedBy: 'system:expired' } });
      return lifted;
    }
    return user;
  }

  // ---------- §3.4 Forgot password ----------
  async forgot(phoneInput: string, meta: RequestMeta) {
    const phone = normalizePhone(phoneInput);
    const user = phone ? await this.prisma.user.findUnique({ where: { phone } }) : null;
    if (user && user.status !== 'PENDING' && !isStaff(user.role)) {
      // Rate-limit errors are swallowed too, so the response is identical in every case.
      await this.otp.issue(user.phone, 'RESET', meta.ip, user.language).catch(() => undefined);
    }
    return { ok: true, message: 'If an account exists for this number, we sent a code.' };
  }

  async reset(dto: ResetPasswordDto) {
    const phone = this.phoneOrThrow(dto.phone);
    const user = await this.prisma.user.findUnique({ where: { phone } });
    if (!user || isStaff(user.role)) throw new BadRequestException('Code expired. Request a new one.');
    await this.otp.verify(phone, 'RESET', dto.code);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await bcrypt.hash(dto.password, BCRYPT_ROUNDS),
        passwordChangedAt: new Date(), // REQ-AUTH-08: blocks withdrawals for 24h
        failedLogins: 0,
        lockedUntil: null,
      },
    });
    await this.tokens.revokeAll(user.id);
    await this.notifications.smsUser(user.id, 'password_changed');
    await this.notifications.inApp(user.id, 'security', 'Password changed', 'Your password was changed and all devices were signed out.');
    return { ok: true };
  }
}
