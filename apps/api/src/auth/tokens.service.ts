import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'crypto';
import type { CookieOptions, Response } from 'express';
import { ACCESS_COOKIE } from '../common/auth.guard';
import { PrismaService } from '../common/prisma.service';
import { RequestMeta } from '../common/request-meta';

export const REFRESH_COOKIE = 'refresh_token';
const ACCESS_TTL_S = 15 * 60;
const REFRESH_TTL_MS = 30 * 86400_000;

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/** REQ-AUTH-06: 15-minute access token + rotating 30-day refresh token, both httpOnly cookies. */
@Injectable()
export class TokensService {
  constructor(private jwt: JwtService, private prisma: PrismaService) {}

  private cookieBase(): CookieOptions {
    return { httpOnly: true, secure: process.env.COOKIE_SECURE === 'true', sameSite: 'lax' };
  }

  async startSession(res: Response, userId: string, meta: RequestMeta, twoFactor = false) {
    const refresh = randomBytes(32).toString('base64url');
    const session = await this.prisma.session.create({
      data: {
        userId,
        refreshTokenHash: sha256(refresh),
        device: meta.device,
        fingerprint: meta.fingerprint,
        ip: meta.ip,
        twoFactor,
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
    });
    await this.setCookies(res, userId, session.id, twoFactor, refresh);
    return session;
  }

  async rotate(res: Response, refresh: string | undefined) {
    if (!refresh) throw new UnauthorizedException();
    const session = await this.prisma.session.findUnique({ where: { refreshTokenHash: sha256(refresh) }, include: { user: true } });
    if (!session || session.revokedAt || session.expiresAt < new Date() || session.user.status === 'BANNED' || session.user.disabled) {
      this.clear(res);
      throw new UnauthorizedException();
    }
    const next = randomBytes(32).toString('base64url');
    // Conditional update: two concurrent refreshes with the same token cannot both succeed.
    const updated = await this.prisma.session.updateMany({
      where: { id: session.id, refreshTokenHash: session.refreshTokenHash },
      data: { refreshTokenHash: sha256(next), expiresAt: new Date(Date.now() + REFRESH_TTL_MS) },
    });
    if (updated.count !== 1) throw new UnauthorizedException();
    await this.setCookies(res, session.userId, session.id, session.twoFactor, next);
  }

  private async setCookies(res: Response, userId: string, sessionId: string, tfa: boolean, refresh: string) {
    const access = await this.jwt.signAsync({ sub: userId, sid: sessionId, tfa }, { expiresIn: ACCESS_TTL_S });
    res.cookie(ACCESS_COOKIE, access, { ...this.cookieBase(), path: '/', maxAge: ACCESS_TTL_S * 1000 });
    res.cookie(REFRESH_COOKIE, refresh, { ...this.cookieBase(), path: '/api/auth', maxAge: REFRESH_TTL_MS });
  }

  clear(res: Response) {
    res.clearCookie(ACCESS_COOKIE, { ...this.cookieBase(), path: '/' });
    res.clearCookie(REFRESH_COOKIE, { ...this.cookieBase(), path: '/api/auth' });
  }

  revoke(sessionId: string) {
    return this.prisma.session.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  revokeAll(userId: string) {
    return this.prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }
}
