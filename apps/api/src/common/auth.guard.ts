import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { ALLOW_RESTRICTED, AuthUser, IS_PUBLIC, PERMISSION, PLAYER_ONLY } from './auth.decorators';
import { hasPermission, isStaff } from './permissions';
import { PrismaService } from './prisma.service';

export const ACCESS_COOKIE = 'access_token';

/**
 * Global guard: validates the 15-minute access token (REQ-AUTH-06), re-checks the account
 * status on every request so bans take effect immediately (REQ-AUTH-07), and enforces
 * staff permissions + 2FA for admin routes (REQ-ROLE-02).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private reflector: Reflector, private jwt: JwtService, private prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets);
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const token = req.cookies?.[ACCESS_COOKIE];

    let user: AuthUser | undefined;
    if (token) {
      try {
        const payload = await this.jwt.verifyAsync<{ sub: string; sid: string; tfa: boolean }>(token);
        const [dbUser, session] = await Promise.all([
          this.prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true, role: true, status: true, disabled: true } }),
          this.prisma.session.findUnique({ where: { id: payload.sid }, select: { revokedAt: true } }),
        ]);
        if (dbUser && session && !session.revokedAt && !dbUser.disabled && dbUser.status !== 'BANNED') {
          user = { id: dbUser.id, role: dbUser.role, status: dbUser.status, sessionId: payload.sid, twoFactor: payload.tfa };
        }
      } catch {
        /* invalid / expired token -> treated as anonymous */
      }
    }
    if (user) req.user = user;
    if (isPublic) return true;
    if (!user) throw new UnauthorizedException('Not logged in');

    const permission = this.reflector.getAllAndOverride<string>(PERMISSION, targets);
    if (permission) {
      if (!isStaff(user.role) || !hasPermission(user.role, permission)) throw new ForbiddenException('Not allowed');
      if (!user.twoFactor) throw new ForbiddenException('Two-factor verification required');
      return true;
    }
    if (isStaff(user.role) && !user.twoFactor) throw new ForbiddenException('Two-factor verification required');

    if (this.reflector.getAllAndOverride<boolean>(PLAYER_ONLY, targets) && user.role !== 'PLAYER') {
      throw new ForbiddenException('Admins cannot play');
    }
    if (user.status === 'PENDING') throw new ForbiddenException('Verify your phone number first');
    if (user.status === 'SUSPENDED' && !this.reflector.getAllAndOverride<boolean>(ALLOW_RESTRICTED, targets)) {
      throw new ForbiddenException('Your account is suspended pending review');
    }
    return true;
  }
}
