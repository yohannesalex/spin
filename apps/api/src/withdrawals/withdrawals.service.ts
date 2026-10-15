import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Provider, Withdrawal } from '@prisma/client';
import { birrToCents, formatBirr } from '../common/money';
import { normalizePhone } from '../common/phone';
import { PrismaService, Tx } from '../common/prisma.service';
import { nameSimilarity } from '../deposits/verification/matching';
import { FlagsService } from '../flags/flags.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';
import { StorageService } from '../storage/storage.service';
import { WalletService } from '../wallet/wallet.service';
import { RequestWithdrawalDto } from './dto';

function normalizeDest(method: Provider, account: string): string {
  if (method === 'TELEBIRR') {
    const phone = normalizePhone(account);
    if (!phone) throw new BadRequestException('Enter the Telebirr phone number (+251 9… / +251 7…)');
    return phone;
  }
  const digits = account.replace(/\D/g, '');
  if (!/^\d{10,16}$/.test(digits)) throw new BadRequestException('Enter a valid CBE account number');
  return digits;
}

@Injectable()
export class WithdrawalsService {
  constructor(
    private prisma: PrismaService,
    private wallets: WalletService,
    private settings: SettingsService,
    private flags: FlagsService,
    private notifications: NotificationsService,
    private storage: StorageService,
  ) {}

  // ---------- §5.2 player side ----------
  async request(userId: string, dto: RequestWithdrawalDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    // REQ-AUTH-08: withdrawals blocked for 24h after a password reset.
    if (user.passwordChangedAt && Date.now() - user.passwordChangedAt.getTime() < 24 * 3600_000) {
      throw new ForbiddenException('Withdrawals are paused for 24 hours after a password reset');
    }
    const s = await this.settings.all();
    const amountCents = birrToCents(dto.amount);
    if (amountCents < s.minWithdrawalCents) throw new BadRequestException(`Minimum withdrawal is ${formatBirr(s.minWithdrawalCents)}`);
    // Destination name must match the account holder's name.
    if (nameSimilarity(dto.destName, user.fullName) < s.senderNameMinScore) {
      throw new BadRequestException('The destination account name must match your registered name');
    }
    const destAccount = normalizeDest(dto.method, dto.destAccount);

    const withdrawal = await this.prisma.$transaction(async (tx) => {
      const wallet = await this.wallets.ensureWallet(userId, tx);
      await this.wallets.lock(tx, wallet.id); // serialise this user's money operations
      const dayAgo = new Date(Date.now() - 24 * 3600_000);
      const today = await tx.withdrawal.aggregate({
        where: { userId, status: { in: ['PENDING', 'FROZEN', 'PAID'] }, createdAt: { gte: dayAgo } },
        _sum: { amountCents: true },
      });
      if ((today._sum.amountCents ?? 0) + amountCents > s.maxWithdrawalPerDayCents) {
        throw new BadRequestException(`Daily withdrawal limit is ${formatBirr(s.maxWithdrawalPerDayCents)}`);
      }
      const withdrawable = await this.wallets.withdrawableCents(userId, tx);
      if (amountCents > withdrawable) {
        throw new BadRequestException(
          `You can withdraw up to ${formatBirr(withdrawable)} now. Deposits become withdrawable after ${s.withdrawalHoldHours} hours.`,
        );
      }
      const w = await tx.withdrawal.create({
        data: { userId, amountCents, method: dto.method, destAccount, destName: dto.destName.trim() },
      });
      // Available → Locked immediately.
      await this.wallets.post(tx, {
        walletId: wallet.id,
        type: 'WITHDRAWAL',
        amountCents: -amountCents,
        lockedDeltaCents: amountCents,
        refType: 'withdrawal',
        refId: w.id,
      });
      return w;
    });

    // REQ-SEC-05: payout account shared with another user → flag.
    const shared = await this.prisma.withdrawal.findFirst({
      where: { destAccount, userId: { not: userId } },
      select: { userId: true },
    });
    if (shared) {
      await this.flags.raise({
        subjectType: 'USER',
        subjectId: userId,
        userId,
        severity: 'MEDIUM',
        reason: `Payout account ${destAccount} also used by user ${shared.userId}`,
      });
    }
    return withdrawal;
  }

  listForUser(userId: string) {
    return this.prisma.withdrawal.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 50 });
  }

  // ---------- admin payout queue ----------
  private async lockRow(tx: Tx, id: string): Promise<Withdrawal> {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM withdrawals WHERE id = ${id} FOR UPDATE`;
    if (!rows.length) throw new NotFoundException('Withdrawal not found');
    return tx.withdrawal.findUniqueOrThrow({ where: { id } });
  }

  async markPaid(id: string, adminId: string, transferRef: string, receipt?: Express.Multer.File) {
    let receiptKey: string | undefined;
    if (receipt) receiptKey = await this.storage.put('payout-receipts', receipt.buffer, receipt.mimetype === 'image/png' ? 'png' : 'jpg');
    const w = await this.prisma.$transaction(async (tx) => {
      const w = await this.lockRow(tx, id);
      if (w.status !== 'PENDING' && w.status !== 'FROZEN') throw new BadRequestException(`Withdrawal is ${w.status.toLowerCase()}`);
      const wallet = await this.wallets.ensureWallet(w.userId, tx);
      await this.wallets.releaseLocked(tx, wallet.id, w.amountCents);
      return tx.withdrawal.update({
        where: { id },
        data: { status: 'PAID', transferRef, receiptKey, paidBy: adminId, paidAt: new Date() },
      });
    });
    await this.notifyPaid(w);
    return w;
  }

  async reject(id: string, adminId: string, reason: string, tx?: Tx) {
    const run = async (t: Tx) => {
      const w = await this.lockRow(t, id);
      if (w.status !== 'PENDING' && w.status !== 'FROZEN') throw new BadRequestException(`Withdrawal is ${w.status.toLowerCase()}`);
      const wallet = await this.wallets.ensureWallet(w.userId, t);
      await this.wallets.post(t, {
        walletId: wallet.id,
        type: 'WITHDRAWAL_REVERSAL',
        amountCents: w.amountCents,
        lockedDeltaCents: -w.amountCents,
        refType: 'withdrawal',
        refId: w.id,
        note: reason,
        createdBy: adminId,
      });
      return t.withdrawal.update({ where: { id }, data: { status: 'REJECTED', rejectReason: reason, paidBy: adminId } });
    };
    const w = tx ? await run(tx) : await this.prisma.$transaction(run);
    await this.notifications.inApp(w.userId, 'withdrawal', 'Withdrawal rejected', `Your ${formatBirr(w.amountCents)} withdrawal was rejected: ${reason}. The amount is back in your wallet.`, { withdrawalId: w.id });
    await this.notifications.smsUser(w.userId, 'withdrawal_rejected', { amount: formatBirr(w.amountCents), reason });
    return w;
  }

  /** REQ-ADM-02: freeze pending withdrawals of a banned user (money stays locked). */
  freezePending(userId: string, tx: Tx) {
    return tx.withdrawal.updateMany({ where: { userId, status: 'PENDING' }, data: { status: 'FROZEN' } });
  }

  /** REQ-PAY-06: "Pay winner now" — create and pay a withdrawal for the full prize in one step. */
  async payWinnerNow(gameId: string, adminId: string, dto: { method: Provider; destAccount: string; destName: string; transferRef: string }) {
    const game = await this.prisma.game.findUnique({ where: { id: gameId } });
    if (!game || game.status !== 'SETTLED' || !game.winnerUserId || !game.prizeCents) throw new BadRequestException('Game has no settled winner');
    const destAccount = normalizeDest(dto.method, dto.destAccount);
    const w = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.withdrawal.findFirst({ where: { gameId, status: 'PAID' } });
      if (existing) throw new BadRequestException('This prize has already been paid out');
      const wallet = await this.wallets.ensureWallet(game.winnerUserId!, tx);
      const w = await tx.withdrawal.create({
        data: {
          userId: game.winnerUserId!,
          gameId,
          amountCents: game.prizeCents!,
          method: dto.method,
          destAccount,
          destName: dto.destName,
          status: 'PAID',
          transferRef: dto.transferRef,
          paidBy: adminId,
          paidAt: new Date(),
        },
      });
      // Throws if the winner already spent part of the prize.
      await this.wallets.post(tx, {
        walletId: wallet.id,
        type: 'WITHDRAWAL',
        amountCents: -game.prizeCents!,
        refType: 'withdrawal',
        refId: w.id,
        note: `Pay winner now: game ${gameId}`,
        createdBy: adminId,
      });
      return w;
    });
    await this.notifyPaid(w);
    return w;
  }

  private async notifyPaid(w: Withdrawal) {
    await this.notifications.inApp(w.userId, 'withdrawal', 'Withdrawal paid', `${formatBirr(w.amountCents)} was sent to your ${w.method === 'CBE' ? 'CBE account' : 'Telebirr'}. Ref: ${w.transferRef}`, { withdrawalId: w.id });
    await this.notifications.smsUser(w.userId, 'withdrawal_paid', { amount: formatBirr(w.amountCents), ref: w.transferRef ?? '' });
  }
}
