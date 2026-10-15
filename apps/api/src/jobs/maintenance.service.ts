import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';
import { FlagsService } from '../flags/flags.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class MaintenanceService {
  private log = new Logger('Maintenance');
  constructor(private prisma: PrismaService, private flags: FlagsService, private notifications: NotificationsService) {}

  /** §3.1: unverified accounts are deleted after 24 hours. */
  @Cron(CronExpression.EVERY_HOUR)
  async deleteUnverified() {
    const cutoff = new Date(Date.now() - 24 * 3600_000);
    const stale = await this.prisma.user.findMany({ where: { status: 'PENDING', createdAt: { lt: cutoff } }, select: { id: true } });
    for (const u of stale) {
      // A pending user never got a wallet, so nothing financial references them.
      await this.prisma.$transaction([
        this.prisma.loginEvent.deleteMany({ where: { userId: u.id } }),
        this.prisma.session.deleteMany({ where: { userId: u.id } }),
        this.prisma.notification.deleteMany({ where: { userId: u.id } }),
        this.prisma.user.delete({ where: { id: u.id } }),
      ]).catch((e) => this.log.warn(`Could not delete pending user ${u.id}: ${e.message}`));
    }
    await this.prisma.otpCode.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 2 * 86400_000) } } });
    await this.prisma.idempotencyKey.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 7 * 86400_000) } } });
    if (stale.length) this.log.log(`Deleted ${stale.length} unverified accounts`);
  }

  /** REQ-NOT-01: alert admins about withdrawals waiting more than 12 hours. */
  @Cron(CronExpression.EVERY_HOUR)
  async staleWithdrawals() {
    const old = await this.prisma.withdrawal.aggregate({
      where: { status: 'PENDING', createdAt: { lt: new Date(Date.now() - 12 * 3600_000) } },
      _count: true,
      _sum: { amountCents: true },
    });
    if (old._count > 0) {
      await this.notifications.alertAdmins(
        'Withdrawals waiting > 12h',
        `${old._count} withdrawal(s), ${(Number(old._sum.amountCents ?? 0) / 100).toFixed(2)} birr, have waited more than 12 hours.`,
      );
    }
  }

  /** REQ-SEC-05: flag accounts sharing a device fingerprint or IP (last 30 days). */
  @Cron(CronExpression.EVERY_6_HOURS)
  async multiAccountDetection() {
    const since = new Date(Date.now() - 30 * 86400_000);
    const byFingerprint = await this.prisma.$queryRaw<{ key: string; users: string[] }[]>`
      SELECT fingerprint AS key, array_agg(DISTINCT "userId") AS users FROM login_events
      WHERE fingerprint IS NOT NULL AND success AND "createdAt" > ${since}
      GROUP BY fingerprint HAVING COUNT(DISTINCT "userId") > 1`;
    const byIp = await this.prisma.$queryRaw<{ key: string; users: string[] }[]>`
      SELECT ip AS key, array_agg(DISTINCT "userId") AS users FROM login_events
      WHERE ip IS NOT NULL AND success AND "createdAt" > ${since}
      GROUP BY ip HAVING COUNT(DISTINCT "userId") BETWEEN 2 AND 5`; // large groups are likely carrier NAT
    for (const [kind, groups] of [['device', byFingerprint], ['IP', byIp]] as const) {
      for (const g of groups) {
        for (const userId of g.users) {
          const reason = `Shares ${kind} ${g.key.slice(0, 40)} with ${g.users.length - 1} other account(s)`;
          const exists = await this.prisma.flag.findFirst({ where: { subjectType: 'USER', subjectId: userId, reason } });
          if (!exists) {
            await this.flags.raise({ subjectType: 'USER', subjectId: userId, userId, severity: kind === 'device' ? 'MEDIUM' : 'LOW', reason });
          }
        }
      }
    }
  }
}
