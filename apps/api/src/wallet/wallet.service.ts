import { BadRequestException, Injectable } from '@nestjs/common';
import { LedgerType, Prisma } from '@prisma/client';
import { PrismaService, Tx } from '../common/prisma.service';
import { SettingsService } from '../settings/settings.service';

export const HOUSE_WALLET_ID = '00000000-0000-0000-0000-000000000001';

export interface PostEntry {
  walletId: string;
  type: LedgerType;
  amountCents: number | bigint; // + credit, − debit
  refType: string;
  refId: string;
  note?: string;
  createdBy?: string;
  /** Change to lockedCents in the same row update (withdrawal lock/unlock). */
  lockedDeltaCents?: number | bigint;
}

export class InsufficientFundsError extends BadRequestException {
  constructor() {
    super({ message: 'Insufficient balance', code: 'INSUFFICIENT_FUNDS' });
  }
}

/**
 * REQ-WAL-01..03: every balance change is an immutable ledger entry written in the same
 * transaction as the wallet's cached balance, under a row lock (SELECT … FOR UPDATE), so two
 * concurrent operations can never spend the same money. The DB also has a CHECK balance ≥ 0.
 */
@Injectable()
export class WalletService {
  constructor(private prisma: PrismaService, private settings: SettingsService) {}

  async ensureWallet(userId: string, tx: Tx = this.prisma) {
    return tx.wallet.upsert({ where: { userId }, create: { userId }, update: {} });
  }

  async ensureHouseWallet(tx: Tx = this.prisma) {
    return tx.wallet.upsert({ where: { id: HOUSE_WALLET_ID }, create: { id: HOUSE_WALLET_ID, kind: 'HOUSE' }, update: {} });
  }

  async lock(tx: Tx, walletId: string) {
    const rows = await tx.$queryRaw<{ id: string; balanceCents: bigint; lockedCents: bigint }[]>`
      SELECT id, "balanceCents", "lockedCents" FROM wallets WHERE id = ${walletId} FOR UPDATE`;
    if (!rows[0]) throw new BadRequestException('Wallet not found');
    return rows[0];
  }

  async lockByUser(tx: Tx, userId: string) {
    const wallet = await this.ensureWallet(userId, tx);
    return this.lock(tx, wallet.id);
  }

  /** Must be called inside a transaction. Throws InsufficientFundsError if balance would go negative. */
  async post(tx: Tx, e: PostEntry) {
    const amount = BigInt(e.amountCents);
    const lockedDelta = BigInt(e.lockedDeltaCents ?? 0);
    const w = await this.lock(tx, e.walletId);
    const balance = w.balanceCents + amount;
    const locked = w.lockedCents + lockedDelta;
    if (e.walletId !== HOUSE_WALLET_ID && balance < 0n) throw new InsufficientFundsError();
    if (locked < 0n) throw new BadRequestException('Locked balance would go negative');
    const entry = await tx.ledgerEntry.create({
      data: {
        walletId: e.walletId,
        type: e.type,
        amountCents: amount,
        refType: e.refType,
        refId: e.refId,
        note: e.note,
        createdBy: e.createdBy,
      },
    });
    await tx.wallet.update({ where: { id: e.walletId }, data: { balanceCents: balance, lockedCents: locked } });
    return entry;
  }

  /** Only changes lockedCents (e.g. withdrawal marked paid: money left the platform). */
  async releaseLocked(tx: Tx, walletId: string, amountCents: number) {
    const w = await this.lock(tx, walletId);
    if (w.lockedCents < BigInt(amountCents)) throw new BadRequestException('Locked balance too low');
    await tx.wallet.update({ where: { id: walletId }, data: { lockedCents: w.lockedCents - BigInt(amountCents) } });
  }

  /** REQ-PAY-04: deposits newer than the hold window are not withdrawable yet. */
  async withdrawableCents(userId: string, tx: Tx = this.prisma): Promise<number> {
    const wallet = await this.ensureWallet(userId, tx);
    const holdHours = await this.settings.get('withdrawalHoldHours');
    const recent = await tx.ledgerEntry.aggregate({
      where: { walletId: wallet.id, type: 'DEPOSIT', createdAt: { gte: new Date(Date.now() - holdHours * 3600_000) } },
      _sum: { amountCents: true },
    });
    const held = recent._sum.amountCents ?? 0n;
    const available = wallet.balanceCents - held;
    return Number(available > 0n ? available : 0n);
  }

  async summary(userId: string) {
    const wallet = await this.ensureWallet(userId);
    const [withdrawable, pendingDeposits, pendingWithdrawals] = await Promise.all([
      this.withdrawableCents(userId),
      this.prisma.deposit.findMany({
        where: { userId, status: { in: ['VERIFYING', 'UNDER_REVIEW'] } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, provider: true, claimedAmountCents: true, status: true, createdAt: true },
      }),
      this.prisma.withdrawal.findMany({
        where: { userId, status: { in: ['PENDING', 'FROZEN'] } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, method: true, amountCents: true, status: true, createdAt: true },
      }),
    ]);
    return {
      balanceCents: wallet.balanceCents,
      lockedCents: wallet.lockedCents,
      withdrawableCents: withdrawable,
      pendingDeposits,
      pendingWithdrawals,
    };
  }

  async history(walletId: string, q: { type?: string; from?: string; to?: string; page?: number; pageSize?: number }) {
    const where: Prisma.LedgerEntryWhereInput = { walletId };
    if (q.type && q.type in LedgerType) where.type = q.type as LedgerType;
    if (q.from || q.to) where.createdAt = { gte: q.from ? new Date(q.from) : undefined, lte: q.to ? new Date(q.to) : undefined };
    const pageSize = Math.min(Math.max(Number(q.pageSize) || 25, 1), 100);
    const page = Math.max(Number(q.page) || 1, 1);
    const [items, total] = await Promise.all([
      this.prisma.ledgerEntry.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.ledgerEntry.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }
}
