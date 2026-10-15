import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Game, Prisma, RoomTemplate } from '@prisma/client';
import { formatBirr, splitPot } from '../common/money';
import { PrismaService, Tx } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { HOUSE_WALLET_ID, InsufficientFundsError, WalletService } from '../wallet/wallet.service';
import { computeWinner, fairnessMessage, generateSeed, hashSeed } from './fairness';
import { GamesGateway } from './games.gateway';
import { COUNTDOWN_MS, SPIN_MS } from './timing';

type GameWithEntries = Game & { entries: { number: number; userId: string }[] };

@Injectable()
export class GamesService {
  private log = new Logger('Games');
  constructor(
    private prisma: PrismaService,
    private wallets: WalletService,
    private gateway: GamesGateway,
    private notifications: NotificationsService,
  ) {}

  // ---------- rooms ----------

  async openFromTemplate(t: RoomTemplate, tx: Tx = this.prisma) {
    const seed = generateSeed();
    const game = await tx.game.create({
      data: {
        templateId: t.id,
        stakeCents: t.stakeCents,
        capacity: t.capacity,
        minPlayers: t.minPlayers,
        commissionBps: t.commissionBps,
        deadlineAt: t.deadlineMinutes ? new Date(Date.now() + t.deadlineMinutes * 60_000) : null,
        seed,
        seedHash: hashSeed(seed),
      },
    });
    this.gateway.toLobby('lobby:changed', { gameId: game.id });
    return game;
  }

  /** REQ-GAME-05: keep exactly one open room per active template. */
  async ensureOpenRooms() {
    const templates = await this.prisma.roomTemplate.findMany({ where: { active: true }, select: { id: true } });
    for (const t of templates) await this.ensureOpenRoom(t.id);
  }

  /** Opens a room for the template if it has none. An advisory lock stops two callers racing. */
  async ensureOpenRoom(templateId: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'template:' + templateId}))`;
      const t = await tx.roomTemplate.findUnique({ where: { id: templateId } });
      if (!t?.active) return;
      const open = await tx.game.count({ where: { templateId, status: 'OPEN' } });
      if (open === 0) await this.openFromTemplate(t, tx);
    });
  }

  private summary(g: Game & { _count?: { entries: number } }, joined?: number) {
    const players = joined ?? g._count?.entries ?? 0;
    return {
      id: g.id,
      stakeCents: g.stakeCents,
      capacity: g.capacity,
      minPlayers: g.minPlayers,
      commissionBps: g.commissionBps,
      players,
      prizeIfFullCents: splitPot(g.stakeCents * g.capacity, g.commissionBps).prizeCents,
      deadlineAt: g.deadlineAt,
      status: g.status,
      seedHash: g.seedHash,
      openedAt: g.openedAt,
    };
  }

  async lobby() {
    const games = await this.prisma.game.findMany({
      where: { status: 'OPEN' },
      include: { _count: { select: { entries: true } } },
      orderBy: [{ stakeCents: 'asc' }, { openedAt: 'asc' }],
    });
    return { serverTime: Date.now(), rooms: games.map((g) => this.summary(g)) };
  }

  /** Public view of a game. The seed is only revealed once a result exists. */
  async view(id: string, userId?: string) {
    const g = await this.prisma.game.findUnique({ where: { id }, include: { entries: { select: { number: true, userId: true } } } });
    if (!g) throw new NotFoundException('Room not found');
    return this.publicView(g, userId);
  }

  private publicView(g: GameWithEntries, userId?: string) {
    const drawn = g.winningNumber != null;
    const mine = userId ? g.entries.find((e) => e.userId === userId)?.number ?? null : null;
    return {
      ...this.summary(g, g.entries.length),
      serverTime: Date.now(),
      takenNumbers: g.entries.map((e) => e.number).sort((a, b) => a - b),
      myNumber: mine,
      cancelReason: g.cancelReason,
      result: drawn
        ? {
            winningNumber: g.winningNumber,
            youWon: !!userId && g.winnerUserId === userId,
            potCents: g.potCents,
            prizeCents: g.prizeCents,
            commissionCents: g.commissionCents,
            seed: g.seed,
            drawnAt: g.drawnAt,
            spinStartAt: g.spinStartAt,
            spinDurationMs: SPIN_MS,
          }
        : null,
    };
  }

  /** REQ-GAME-12: everything needed to recompute the result independently. */
  async verifyData(id: string) {
    const g = await this.prisma.game.findUnique({ where: { id }, include: { entries: { select: { number: true } } } });
    if (!g) throw new NotFoundException('Game not found');
    const numbers = g.entries.map((e) => e.number).sort((a, b) => a - b);
    const drawn = g.winningNumber != null;
    return {
      gameId: g.id,
      status: g.status,
      seedHash: g.seedHash,
      seed: drawn ? g.seed : null,
      numbers,
      message: fairnessMessage(g.id, numbers),
      winnerIndex: g.winnerIndex,
      winningNumber: g.winningNumber,
      potCents: g.potCents,
      prizeCents: g.prizeCents,
      commissionCents: g.commissionCents,
      commissionBps: g.commissionBps,
      drawnAt: g.drawnAt,
      algorithm:
        'index = BigInt("0x" + HMAC_SHA256(key=seed, message)) mod numbers.length; winningNumber = numbers[index]; message = gameId + ":" + sorted numbers joined by ","',
    };
  }

  async myGames(userId: string) {
    const entries = await this.prisma.gameEntry.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { game: true },
    });
    return entries.map((e) => ({
      gameId: e.gameId,
      number: e.number,
      stakeCents: e.game.stakeCents,
      status: e.game.status,
      winningNumber: e.game.winningNumber,
      won: e.game.winnerUserId === userId,
      prizeCents: e.game.winnerUserId === userId ? e.game.prizeCents : null,
      drawnAt: e.game.drawnAt,
      joinedAt: e.createdAt,
    }));
  }

  // ---------- §6.2 joining ----------

  private lockGame(tx: Tx, id: string) {
    return tx.$queryRaw<{ id: string }[]>`SELECT id FROM games WHERE id = ${id} FOR UPDATE`;
  }

  async join(userId: string, gameId: string, number: number) {
    let becameFull = false;
    let game: Game;
    try {
      const res = await this.prisma.$transaction(async (tx) => {
        // Lock the room so capacity and number checks are serialised per room.
        if (!(await this.lockGame(tx, gameId)).length) throw new NotFoundException('Room not found');
        const g = await tx.game.findUniqueOrThrow({ where: { id: gameId } });
        if (g.status !== 'OPEN') throw new BadRequestException({ message: 'This room is closed', code: 'ROOM_CLOSED' });
        if (g.deadlineAt && g.deadlineAt <= new Date()) throw new BadRequestException({ message: 'This room is closed', code: 'ROOM_CLOSED' });
        const count = await tx.gameEntry.count({ where: { gameId } });
        if (count >= g.capacity) throw new BadRequestException({ message: 'This room is full', code: 'ROOM_FULL' });
        if (await tx.gameEntry.findUnique({ where: { gameId_userId: { gameId, userId } } })) {
          throw new BadRequestException({ message: 'You already have a number in this room', code: 'ALREADY_JOINED' });
        }
        // (gameId, number) is unique in the DB: a concurrent pick fails here before any money moves.
        const entry = await tx.gameEntry.create({ data: { gameId, userId, number } });
        const wallet = await this.wallets.ensureWallet(userId, tx);
        await this.wallets.post(tx, {
          walletId: wallet.id,
          type: 'STAKE',
          amountCents: -g.stakeCents,
          refType: 'game',
          refId: gameId,
          note: `Number ${number}`,
        });
        return { entry, g, full: count + 1 >= g.capacity };
      });
      becameFull = res.full;
      game = res.g;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const target = String((e.meta?.target as string[] | undefined)?.join(',') ?? '');
        if (target.includes('userId')) throw new ConflictException({ message: 'You already have a number in this room', code: 'ALREADY_JOINED' });
        throw new ConflictException({ message: 'Number taken, pick another', code: 'NUMBER_TAKEN' });
      }
      if (e instanceof InsufficientFundsError) {
        throw new BadRequestException({ message: 'Your balance is below the stake. Deposit to play.', code: 'INSUFFICIENT_FUNDS' });
      }
      throw e;
    }

    const players = await this.prisma.gameEntry.count({ where: { gameId } });
    this.gateway.toGame(gameId, 'game:number_taken', { gameId, number, players });
    this.gateway.toLobby('lobby:changed', { gameId, players });
    if (becameFull) {
      // REQ-GAME-05: a fresh room from the same template opens as soon as this one fills.
      await this.draw(gameId).catch((e) => this.log.error(`Draw ${gameId} failed: ${e.stack}`));
    }
    return { ok: true, number, players };
  }

  // ---------- §6.3 draw + §5.1 settlement ----------

  /**
   * Picks the winner and settles in one transaction (REQ-PAY-01): the result is stored before
   * any client animates (REQ-GAME-11), and the DB trigger makes it write-once.
   * Safe to call concurrently / repeatedly: only an OPEN game with enough players is drawn.
   */
  async draw(gameId: string): Promise<boolean> {
    const settled = await this.prisma.$transaction(async (tx) => {
      await this.lockGame(tx, gameId);
      const g = await tx.game.findUniqueOrThrow({ where: { id: gameId }, include: { entries: true } });
      if (g.status !== 'OPEN' || g.entries.length < Math.max(2, g.minPlayers)) return null;

      const { index, winningNumber } = computeWinner(g.seed, g.id, g.entries.map((e) => e.number));
      const winner = g.entries.find((e) => e.number === winningNumber)!;
      const potCents = g.stakeCents * g.entries.length;
      const { prizeCents, commissionCents } = splitPot(potCents, g.commissionBps);
      const now = new Date();

      const updated = await tx.game.update({
        where: { id: g.id },
        data: {
          status: 'SETTLED',
          winningNumber,
          winnerIndex: index,
          winnerUserId: winner.userId,
          potCents,
          prizeCents,
          commissionCents,
          drawnAt: now,
          spinStartAt: new Date(now.getTime() + COUNTDOWN_MS),
        },
        include: { entries: { select: { number: true, userId: true } } },
      });
      const winnerWallet = await this.wallets.ensureWallet(winner.userId, tx);
      await this.wallets.post(tx, { walletId: winnerWallet.id, type: 'PRIZE', amountCents: prizeCents, refType: 'game', refId: g.id });
      await this.wallets.ensureHouseWallet(tx);
      await this.wallets.post(tx, { walletId: HOUSE_WALLET_ID, type: 'COMMISSION', amountCents: commissionCents, refType: 'game', refId: g.id });
      return updated;
    });
    if (!settled) return false;
    if (settled.templateId) await this.ensureOpenRoom(settled.templateId);

    const view = this.publicView(settled);
    this.gateway.toGame(gameId, 'game:result', { ...view, result: { ...view.result, youWon: false } });
    this.gateway.toLobby('lobby:changed', { gameId });

    // Notify after the animation so the result isn't spoiled.
    const delay = COUNTDOWN_MS + SPIN_MS + 500;
    setTimeout(() => this.notifyResult(settled).catch((e) => this.log.error(e.message)), delay);
    return true;
  }

  private async notifyResult(g: GameWithEntries) {
    const prize = formatBirr(g.prizeCents!);
    for (const e of g.entries) {
      const won = e.userId === g.winnerUserId;
      await this.notifications.inApp(
        e.userId,
        'game',
        won ? 'You won!' : `Number ${g.winningNumber} won`,
        won ? `You won ${prize} with number ${e.number}.` : `Your number ${e.number} didn't win this time.`,
        { gameId: g.id },
      );
    }
    await this.notifications.smsUser(g.winnerUserId!, 'you_won', { amount: prize, number: g.winningNumber! });
  }

  // ---------- REQ-GAME-03/04 deadlines and cancellation ----------

  async processDeadlines() {
    const due = await this.prisma.game.findMany({
      where: { status: 'OPEN', deadlineAt: { lte: new Date() } },
      include: { _count: { select: { entries: true } } },
    });
    for (const g of due) {
      try {
        if (g._count.entries >= Math.max(2, g.minPlayers)) {
          await this.draw(g.id);
        } else {
          await this.cancel(g.id, 'Not enough players before the deadline', 'system');
        }
        if (g.templateId) await this.ensureOpenRoom(g.templateId);
      } catch (e) {
        this.log.error(`Deadline processing for ${g.id} failed: ${(e as Error).message}`);
      }
    }
  }

  /** Cancels an open room and refunds every stake (REQ-GAME-04, admin cancel). */
  async cancel(gameId: string, reason: string, by: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      if (!(await this.lockGame(tx, gameId)).length) throw new NotFoundException('Room not found');
      const g = await tx.game.findUniqueOrThrow({ where: { id: gameId }, include: { entries: true } });
      if (g.status !== 'OPEN') throw new BadRequestException(`Room is already ${g.status.toLowerCase()}`);
      for (const e of g.entries) {
        const wallet = await this.wallets.ensureWallet(e.userId, tx);
        await this.wallets.post(tx, {
          walletId: wallet.id,
          type: 'REFUND',
          amountCents: g.stakeCents,
          refType: 'game',
          refId: g.id,
          note: reason,
          createdBy: by,
        });
      }
      const updated = await tx.game.update({ where: { id: gameId }, data: { status: 'CANCELLED', cancelReason: reason } });
      return { game: updated, entries: g.entries };
    });
    this.gateway.toGame(gameId, 'game:cancelled', { gameId, reason });
    this.gateway.toLobby('lobby:changed', { gameId });
    for (const e of result.entries) {
      await this.notifications.inApp(e.userId, 'game', 'Room cancelled', `The room was cancelled (${reason}). Your ${formatBirr(result.game.stakeCents)} stake was refunded.`, { gameId });
    }
    return result.game;
  }
}
