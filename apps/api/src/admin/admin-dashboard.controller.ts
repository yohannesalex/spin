import { Controller, Get } from '@nestjs/common';
import { RequirePermission } from '../common/auth.decorators';
import { PrismaService } from '../common/prisma.service';

@Controller('admin/dashboard')
@RequirePermission('dashboard.view')
export class AdminDashboardController {
  constructor(private prisma: PrismaService) {}

  private async period(since: Date) {
    const ledgerSum = async (type: 'STAKE' | 'PRIZE' | 'COMMISSION') =>
      Math.abs(Number((await this.prisma.ledgerEntry.aggregate({ where: { type, createdAt: { gte: since } }, _sum: { amountCents: true } }))._sum.amountCents ?? 0));
    const [deposits, withdrawals, stakes, prizes, commission, players] = await Promise.all([
      this.prisma.deposit.aggregate({ where: { status: 'CREDITED', updatedAt: { gte: since } }, _sum: { creditedCents: true }, _count: true }),
      this.prisma.withdrawal.aggregate({ where: { status: 'PAID', paidAt: { gte: since } }, _sum: { amountCents: true }, _count: true }),
      ledgerSum('STAKE'),
      ledgerSum('PRIZE'),
      ledgerSum('COMMISSION'),
      this.prisma.gameEntry.findMany({ where: { createdAt: { gte: since } }, distinct: ['userId'], select: { userId: true } }),
    ]);
    return {
      depositsCents: deposits._sum.creditedCents ?? 0,
      depositsCount: deposits._count,
      withdrawalsCents: withdrawals._sum.amountCents ?? 0,
      withdrawalsCount: withdrawals._count,
      stakesCents: stakes,
      prizesCents: prizes,
      commissionCents: commission,
      activePlayers: players.length,
    };
  }

  @Get()
  async dashboard() {
    const now = new Date();
    const eatMidnight = new Date(now.getTime() + 3 * 3600_000);
    eatMidnight.setUTCHours(0, 0, 0, 0);
    const today = new Date(eatMidnight.getTime() - 3 * 3600_000);
    const [d1, d7, d30, openRooms, flags, highFlags, payouts, overdue] = await Promise.all([
      this.period(today),
      this.period(new Date(now.getTime() - 7 * 86400_000)),
      this.period(new Date(now.getTime() - 30 * 86400_000)),
      this.prisma.game.count({ where: { status: 'OPEN' } }),
      this.prisma.flag.count({ where: { status: 'OPEN' } }),
      this.prisma.flag.count({ where: { status: 'OPEN', severity: 'HIGH' } }),
      this.prisma.withdrawal.aggregate({ where: { status: { in: ['PENDING', 'FROZEN'] } }, _sum: { amountCents: true }, _count: true }),
      this.prisma.withdrawal.count({ where: { status: 'PENDING', createdAt: { lt: new Date(now.getTime() - 24 * 3600_000) } } }),
    ]);
    return {
      periods: { today: d1, last7: d7, last30: d30 },
      openRooms,
      pendingFlags: flags,
      pendingHighFlags: highFlags,
      pendingPayouts: { count: payouts._count, cents: payouts._sum.amountCents ?? 0, overdue },
    };
  }
}
