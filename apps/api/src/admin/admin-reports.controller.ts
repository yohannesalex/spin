import { BadRequestException, Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AuditService } from '../audit/audit.service';
import { AuthUser, CurrentUser, RequirePermission } from '../common/auth.decorators';
import { birrToCents } from '../common/money';
import { PrismaService } from '../common/prisma.service';
import { Meta, RequestMeta } from '../common/request-meta';
import { HOUSE_WALLET_ID } from '../wallet/wallet.service';
import { ReconciliationDto } from './dto';

const csvCell = (v: unknown) => {
  if (v == null) return '';
  let s = v instanceof Date ? v.toISOString() : typeof v === 'object' ? JSON.stringify(v) : String(v);
  // Neutralise spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (rows: Record<string, unknown>[], cols: string[]) =>
  '﻿' + [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\r\n');

const birr = (cents: unknown) => (cents == null ? null : (Number(cents) / 100).toFixed(2));
const range = (q: Record<string, string>) => ({
  from: q.from ? new Date(q.from) : new Date(Date.now() - 30 * 86400_000),
  to: q.to ? new Date(q.to) : new Date(),
});

@Controller('admin/reports')
@RequirePermission('reports.view')
export class AdminReportsController {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  private async totals() {
    const [players, house, ledger] = await Promise.all([
      this.prisma.wallet.aggregate({ where: { kind: 'PLAYER' }, _sum: { balanceCents: true, lockedCents: true } }),
      this.prisma.wallet.findUnique({ where: { id: HOUSE_WALLET_ID } }),
      this.prisma.ledgerEntry.aggregate({ _sum: { amountCents: true } }),
    ]);
    const walletsCents = players._sum.balanceCents ?? 0n;
    const lockedCents = players._sum.lockedCents ?? 0n;
    const houseCents = house?.balanceCents ?? 0n;
    const ledgerTotal = ledger._sum.amountCents ?? 0n;
    return {
      walletsCents,
      lockedCents,
      houseCents,
      ledgerTotalCents: ledgerTotal,
      // Integrity check: cached balances must equal the ledger (acceptance criterion).
      ledgerMatchesWallets: ledgerTotal === walletsCents + houseCents,
      expectedHoldingsCents: walletsCents + lockedCents + houseCents,
    };
  }

  /** REQ-ADM-03 daily reconciliation. */
  @Get('reconciliation')
  async reconciliation() {
    const [totals, history] = await Promise.all([
      this.totals(),
      this.prisma.reconciliation.findMany({ orderBy: { createdAt: 'desc' }, take: 60 }),
    ]);
    return { totals, history };
  }

  @Post('reconciliation')
  async reconcile(@Body() dto: ReconciliationDto, @CurrentUser() a: AuthUser, @Meta() m: RequestMeta) {
    const t = await this.totals();
    const telebirrCents = BigInt(birrToCents(dto.telebirr));
    const cbeCents = BigInt(birrToCents(dto.cbe));
    const rec = await this.prisma.reconciliation.create({
      data: {
        date: new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10),
        telebirrCents,
        cbeCents,
        walletsCents: t.walletsCents,
        lockedCents: t.lockedCents,
        houseCents: t.houseCents,
        differenceCents: telebirrCents + cbeCents - t.expectedHoldingsCents,
        enteredBy: a.id,
        note: dto.note,
      },
    });
    await this.audit.log({ actorId: a.id, action: 'reconciliation.create', targetType: 'reconciliation', targetId: rec.id, after: rec, reason: dto.note || 'Daily reconciliation', ip: m.ip });
    return rec;
  }

  @Get('commission')
  async commission(@Query() q: Record<string, string>) {
    const { from, to } = range(q);
    const rows = await this.prisma.$queryRaw<{ day: string; commission: bigint; games: bigint }[]>`
      SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Addis_Ababa', 'YYYY-MM-DD') AS day,
             SUM("amountCents") AS commission, COUNT(*) AS games
      FROM ledger_entries
      WHERE type = 'COMMISSION' AND "createdAt" BETWEEN ${from} AND ${to}
      GROUP BY day ORDER BY day`;
    return rows.map((r) => ({ day: r.day, commissionCents: Number(r.commission), games: Number(r.games) }));
  }

  /** Monthly figures for tax filing: stakes, prizes, gross gaming revenue (commission). */
  @Get('tax')
  async tax(@Query('year') yearQ?: string) {
    const year = Number(yearQ) || new Date().getUTCFullYear();
    const rows = await this.prisma.$queryRaw<{ month: string; type: string; total: bigint; n: bigint }[]>`
      SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Addis_Ababa', 'YYYY-MM') AS month, type::text, SUM("amountCents") AS total, COUNT(*) AS n
      FROM ledger_entries
      WHERE to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Addis_Ababa', 'YYYY') = ${String(year)}
        AND type IN ('STAKE', 'PRIZE', 'COMMISSION', 'REFUND', 'DEPOSIT', 'WITHDRAWAL')
      GROUP BY month, type ORDER BY month`;
    const months: Record<string, Record<string, number>> = {};
    for (const r of rows) {
      months[r.month] ??= {};
      months[r.month][r.type] = Math.abs(Number(r.total));
    }
    return Object.entries(months).map(([month, v]) => ({
      month,
      stakesCents: v.STAKE ?? 0,
      refundsCents: v.REFUND ?? 0,
      prizesCents: v.PRIZE ?? 0,
      grossGamingRevenueCents: v.COMMISSION ?? 0,
      depositsCents: v.DEPOSIT ?? 0,
      withdrawalsCents: v.WITHDRAWAL ?? 0,
    }));
  }

  /** CSV export (opens directly in Excel). */
  @Get('export/:kind')
  async export(@Param('kind') kind: string, @Query() q: Record<string, string>, @Res() res: Response) {
    const { from, to } = range(q);
    const created = { gte: from, lte: to };
    let csv: string;
    switch (kind) {
      case 'deposits': {
        const rows = await this.prisma.deposit.findMany({ where: { createdAt: created }, include: { user: { select: { fullName: true, phone: true } } }, orderBy: { createdAt: 'asc' } });
        csv = toCsv(
          rows.map((d) => ({ ...d, name: d.user.fullName, phone: d.user.phone, claimed: birr(d.claimedAmountCents), credited: birr(d.creditedCents), flags: d.flagReasons.join('|') })),
          ['id', 'createdAt', 'name', 'phone', 'provider', 'reference', 'claimed', 'credited', 'status', 'flags', 'reviewedBy', 'reviewNote'],
        );
        break;
      }
      case 'withdrawals': {
        const rows = await this.prisma.withdrawal.findMany({ where: { createdAt: created }, include: { user: { select: { fullName: true, phone: true } } }, orderBy: { createdAt: 'asc' } });
        csv = toCsv(
          rows.map((w) => ({ ...w, name: w.user.fullName, phone: w.user.phone, amount: birr(w.amountCents) })),
          ['id', 'createdAt', 'name', 'phone', 'method', 'destAccount', 'destName', 'amount', 'status', 'transferRef', 'paidBy', 'paidAt', 'rejectReason'],
        );
        break;
      }
      case 'ledger': {
        const rows = await this.prisma.ledgerEntry.findMany({ where: { createdAt: created }, include: { wallet: { select: { userId: true, kind: true } } }, orderBy: { createdAt: 'asc' }, take: 100_000 });
        csv = toCsv(
          rows.map((e) => ({ ...e, userId: e.wallet.userId ?? 'HOUSE', amount: birr(e.amountCents) })),
          ['id', 'createdAt', 'userId', 'type', 'amount', 'refType', 'refId', 'note', 'createdBy'],
        );
        break;
      }
      case 'games': {
        const rows = await this.prisma.game.findMany({ where: { openedAt: created }, include: { _count: { select: { entries: true } } }, orderBy: { openedAt: 'asc' } });
        csv = toCsv(
          rows.map((g) => ({ ...g, players: g._count.entries, stake: birr(g.stakeCents), pot: birr(g.potCents), prize: birr(g.prizeCents), commission: birr(g.commissionCents), seed: g.winningNumber != null ? g.seed : '' })),
          ['id', 'openedAt', 'drawnAt', 'status', 'stake', 'capacity', 'players', 'pot', 'prize', 'commission', 'winningNumber', 'winnerUserId', 'seedHash', 'seed'],
        );
        break;
      }
      case 'commission': {
        const rows = await this.commission(q);
        csv = toCsv(rows.map((r) => ({ ...r, commission: birr(r.commissionCents) })), ['day', 'games', 'commission']);
        break;
      }
      default:
        throw new BadRequestException('Unknown export');
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${kind}-${from.toISOString().slice(0, 10)}-${to.toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  }
}
