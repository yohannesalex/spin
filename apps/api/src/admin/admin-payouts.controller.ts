import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AuditService } from '../audit/audit.service';
import { AuthUser, CurrentUser, RequirePermission } from '../common/auth.decorators';
import { PrismaService } from '../common/prisma.service';
import { Meta, RequestMeta } from '../common/request-meta';
import { MarkPaidDto, RejectDto } from '../withdrawals/dto';
import { WithdrawalsService } from '../withdrawals/withdrawals.service';
import { PayWinnerDto } from './dto';

const userSelect = { select: { id: true, fullName: true, phone: true, status: true } };

@Controller('admin/payouts')
@RequirePermission('payouts.manage')
export class AdminPayoutsController {
  constructor(private prisma: PrismaService, private withdrawals: WithdrawalsService, private audit: AuditService) {}

  /** Pending withdrawals and unpaid winners, oldest first; > 24h is "overdue" (REQ-PAY-05). */
  @Get()
  async queue() {
    const dayAgo = Date.now() - 24 * 3600_000;
    const [pending, recentWinners] = await Promise.all([
      this.prisma.withdrawal.findMany({ where: { status: { in: ['PENDING', 'FROZEN'] } }, include: { user: userSelect }, orderBy: { createdAt: 'asc' } }),
      this.prisma.game.findMany({
        where: { status: 'SETTLED', drawnAt: { gte: new Date(Date.now() - 30 * 86400_000) } },
        orderBy: { drawnAt: 'asc' },
        select: { id: true, winnerUserId: true, prizeCents: true, winningNumber: true, drawnAt: true, stakeCents: true },
      }),
    ]);
    const paidGames = new Set(
      (await this.prisma.withdrawal.findMany({ where: { gameId: { in: recentWinners.map((g) => g.id) }, status: 'PAID' }, select: { gameId: true } })).map((w) => w.gameId),
    );
    const unpaid = recentWinners.filter((g) => !paidGames.has(g.id));
    const winners = await this.prisma.user.findMany({ where: { id: { in: unpaid.map((g) => g.winnerUserId!) } }, ...userSelect });
    return {
      withdrawals: pending.map((w) => ({ ...w, overdue: w.createdAt.getTime() < dayAgo })),
      unpaidWinners: unpaid.map((g) => ({ ...g, winner: winners.find((u) => u.id === g.winnerUserId) })),
    };
  }

  @Get('history')
  history() {
    return this.prisma.withdrawal.findMany({ where: { status: { in: ['PAID', 'REJECTED'] } }, include: { user: userSelect }, orderBy: { updatedAt: 'desc' }, take: 200 });
  }

  @Post(':id/paid')
  @UseInterceptors(FileInterceptor('receipt', { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  async paid(@Param('id', ParseUUIDPipe) id: string, @Body() dto: MarkPaidDto, @CurrentUser() admin: AuthUser, @Meta() meta: RequestMeta, @UploadedFile() file?: Express.Multer.File) {
    const w = await this.withdrawals.markPaid(id, admin.id, dto.transferRef, file && ['image/png', 'image/jpeg'].includes(file.mimetype) ? file : undefined);
    await this.audit.log({ actorId: admin.id, action: 'withdrawal.paid', targetType: 'withdrawal', targetId: id, before: { status: 'PENDING' }, after: { status: 'PAID', transferRef: dto.transferRef }, reason: dto.reason || `Paid, ref ${dto.transferRef}`, ip: meta.ip });
    return w;
  }

  @Post(':id/reject')
  async reject(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectDto, @CurrentUser() admin: AuthUser, @Meta() meta: RequestMeta) {
    const w = await this.withdrawals.reject(id, admin.id, dto.reason);
    await this.audit.log({ actorId: admin.id, action: 'withdrawal.reject', targetType: 'withdrawal', targetId: id, before: { status: 'PENDING' }, after: { status: 'REJECTED' }, reason: dto.reason, ip: meta.ip });
    return w;
  }

  @Post('games/:gameId/pay-winner')
  async payWinner(@Param('gameId', ParseUUIDPipe) gameId: string, @Body() dto: PayWinnerDto, @CurrentUser() admin: AuthUser, @Meta() meta: RequestMeta) {
    const w = await this.withdrawals.payWinnerNow(gameId, admin.id, dto);
    await this.audit.log({ actorId: admin.id, action: 'game.pay_winner', targetType: 'game', targetId: gameId, after: { withdrawalId: w.id, amountCents: w.amountCents, transferRef: dto.transferRef }, reason: dto.reason, ip: meta.ip });
    return w;
  }
}
