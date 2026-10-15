import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { WalletService } from '../wallet/wallet.service';
import { WithdrawalsService } from '../withdrawals/withdrawals.service';
import { formatBirr } from '../common/money';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private wallets: WalletService,
    private withdrawals: WithdrawalsService,
    private notifications: NotificationsService,
  ) {}

  private async get(id: string) {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u) throw new NotFoundException('User not found');
    return u;
  }

  /**
   * REQ-ADM-02: blocks login (sessions revoked), cancels pending withdrawals back to the wallet
   * or freezes them, and keeps entries in running games.
   */
  async ban(id: string, adminId: string, ip: string | null, dto: { reason: string; until?: string | null; withdrawals: 'cancel' | 'freeze' }) {
    const u = await this.get(id);
    if (u.role !== 'PLAYER') throw new BadRequestException('Disable admin accounts from the Admin accounts page');
    const until = dto.until ? new Date(dto.until) : null;
    if (until && until <= new Date()) throw new BadRequestException('Ban end must be in the future');
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { status: 'BANNED', banReason: dto.reason, bannedUntil: until } });
      await tx.ban.create({ data: { userId: id, reason: dto.reason, until, bannedBy: adminId } });
      await tx.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      if (dto.withdrawals === 'freeze') {
        await this.withdrawals.freezePending(id, tx);
      } else {
        const pending = await tx.withdrawal.findMany({ where: { userId: id, status: { in: ['PENDING', 'FROZEN'] } } });
        for (const w of pending) await this.withdrawals.reject(w.id, adminId, `Account banned: ${dto.reason}`, tx);
      }
      await this.audit.log(
        { actorId: adminId, action: 'user.ban', targetType: 'user', targetId: id, before: { status: u.status }, after: { status: 'BANNED', until, withdrawals: dto.withdrawals }, reason: dto.reason, ip },
        tx,
      );
    });
    await this.notifications.smsUser(id, 'account_banned', { reason: dto.reason });
    return { ok: true };
  }

  async unban(id: string, adminId: string, ip: string | null, reason: string) {
    const u = await this.get(id);
    if (u.status !== 'BANNED' && u.status !== 'SUSPENDED') throw new BadRequestException('User is not banned or suspended');
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { status: 'ACTIVE', banReason: null, bannedUntil: null } });
      await tx.ban.updateMany({ where: { userId: id, liftedAt: null }, data: { liftedAt: new Date(), liftedBy: adminId } });
      // Frozen withdrawals go back to the payout queue.
      await tx.withdrawal.updateMany({ where: { userId: id, status: 'FROZEN' }, data: { status: 'PENDING' } });
      await this.audit.log({ actorId: adminId, action: 'user.unban', targetType: 'user', targetId: id, before: { status: u.status }, after: { status: 'ACTIVE' }, reason, ip }, tx);
    });
    if (u.status === 'BANNED') await this.notifications.smsUser(id, 'account_unbanned');
    return { ok: true };
  }

  async suspend(id: string, adminId: string, ip: string | null, reason: string) {
    const u = await this.get(id);
    if (u.role !== 'PLAYER') throw new BadRequestException('Only players can be suspended');
    await this.prisma.user.update({ where: { id }, data: { status: 'SUSPENDED' } });
    await this.audit.log({ actorId: adminId, action: 'user.suspend', targetType: 'user', targetId: id, before: { status: u.status }, after: { status: 'SUSPENDED' }, reason, ip });
    await this.notifications.inApp(id, 'account', 'Account under review', 'Your account is suspended while we review recent activity.');
    return { ok: true };
  }

  async forceLogout(id: string, adminId: string, ip: string | null, reason: string) {
    await this.get(id);
    const r = await this.prisma.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.audit.log({ actorId: adminId, action: 'user.force_logout', targetType: 'user', targetId: id, after: { sessionsRevoked: r.count }, reason, ip });
    return { ok: true, sessionsRevoked: r.count };
  }

  /** "Reset limits": clears login lockout and the post-reset withdrawal hold. */
  async resetLimits(id: string, adminId: string, ip: string | null, reason: string) {
    const u = await this.get(id);
    await this.prisma.user.update({ where: { id }, data: { failedLogins: 0, lockedUntil: null, passwordChangedAt: null } });
    await this.audit.log({
      actorId: adminId, action: 'user.reset_limits', targetType: 'user', targetId: id,
      before: { failedLogins: u.failedLogins, lockedUntil: u.lockedUntil, passwordChangedAt: u.passwordChangedAt },
      after: { failedLogins: 0, lockedUntil: null, passwordChangedAt: null }, reason, ip,
    });
    return { ok: true };
  }

  /** REQ-ADM-01: manual adjustments need a reason and get their own ledger entry type. */
  async adjustBalance(id: string, adminId: string, ip: string | null, amountCents: number, reason: string) {
    if (!Number.isInteger(amountCents) || amountCents === 0) throw new BadRequestException('Amount must be non-zero');
    await this.get(id);
    return this.prisma.$transaction(async (tx) => {
      const wallet = await this.wallets.ensureWallet(id, tx);
      const before = await this.wallets.lock(tx, wallet.id);
      const entry = await this.wallets.post(tx, {
        walletId: wallet.id, type: 'ADMIN_ADJUSTMENT', amountCents, refType: 'admin', refId: adminId, note: reason, createdBy: adminId,
      });
      await this.audit.log(
        { actorId: adminId, action: 'wallet.adjust', targetType: 'user', targetId: id, before: { balanceCents: before.balanceCents }, after: { balanceCents: before.balanceCents + BigInt(amountCents), amountCents }, reason, ip },
        tx,
      );
      await this.notifications.inApp(id, 'wallet', 'Balance adjusted', `An admin adjusted your balance by ${amountCents > 0 ? '+' : '−'}${formatBirr(Math.abs(amountCents))}: ${reason}`, undefined, tx);
      return entry;
    });
  }

  async profile(id: string) {
    const u = await this.get(id);
    const wallet = await this.wallets.ensureWallet(id);
    const [ledger, games, deposits, withdrawals, flags, logins, sessions, bans] = await Promise.all([
      this.prisma.ledgerEntry.findMany({ where: { walletId: wallet.id }, orderBy: { createdAt: 'desc' }, take: 100 }),
      this.prisma.gameEntry.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 50, include: { game: { select: { id: true, stakeCents: true, status: true, winningNumber: true, winnerUserId: true, prizeCents: true, drawnAt: true } } } }),
      this.prisma.deposit.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 50 }),
      this.prisma.withdrawal.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 50 }),
      this.prisma.flag.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 50 }),
      this.prisma.loginEvent.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 50 }),
      this.prisma.session.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 30, select: { id: true, device: true, fingerprint: true, ip: true, createdAt: true, expiresAt: true, revokedAt: true } }),
      this.prisma.ban.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' } }),
    ]);
    const { passwordHash: _, ...user } = u;
    return { user, wallet, ledger, games, deposits, withdrawals, flags, logins, sessions, bans };
  }
}
