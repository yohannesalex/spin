import { BadRequestException, Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { GameStatus, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser, CurrentUser, RequirePermission } from '../common/auth.decorators';
import { birrToCents } from '../common/money';
import { PrismaService } from '../common/prisma.service';
import { Meta, RequestMeta } from '../common/request-meta';
import { CancelDto, TemplateDto } from '../games/dto';
import { GamesService } from '../games/games.service';
import { SettingsService } from '../settings/settings.service';

@Controller('admin/games')
@RequirePermission('games.manage')
export class AdminGamesController {
  constructor(private prisma: PrismaService, private games: GamesService, private audit: AuditService, private settings: SettingsService) {}

  @Get('templates')
  templates() {
    return this.prisma.roomTemplate.findMany({ orderBy: [{ active: 'desc' }, { stakeCents: 'asc' }] });
  }

  private async templateData(dto: TemplateDto) {
    const s = await this.settings.all();
    const stakeCents = birrToCents(dto.stake);
    if (stakeCents < s.minStakeCents || stakeCents > s.maxStakeCents) throw new BadRequestException('Stake is outside the allowed min/max');
    const minPlayers = dto.minPlayers ?? 2;
    if (minPlayers > dto.capacity) throw new BadRequestException('Minimum players cannot exceed capacity');
    return {
      name: dto.name,
      stakeCents,
      capacity: dto.capacity,
      minPlayers,
      commissionBps: dto.commissionPct != null ? Math.round(dto.commissionPct * 100) : s.defaultCommissionBps,
      deadlineMinutes: dto.deadlineMinutes ?? null,
      active: dto.active ?? true,
    };
  }

  @Post('templates')
  async createTemplate(@Body() dto: TemplateDto, @CurrentUser() a: AuthUser, @Meta() m: RequestMeta) {
    const t = await this.prisma.roomTemplate.create({ data: await this.templateData(dto) });
    await this.audit.log({ actorId: a.id, action: 'template.create', targetType: 'room_template', targetId: t.id, after: t, reason: dto.reason, ip: m.ip });
    if (t.active) await this.games.ensureOpenRoom(t.id);
    return t;
  }

  /** Edits apply to rooms opened after the change; open rooms keep their published terms. */
  @Patch('templates/:id')
  async updateTemplate(@Param('id', ParseUUIDPipe) id: string, @Body() dto: TemplateDto, @CurrentUser() a: AuthUser, @Meta() m: RequestMeta) {
    const before = await this.prisma.roomTemplate.findUnique({ where: { id } });
    if (!before) throw new NotFoundException();
    const t = await this.prisma.roomTemplate.update({ where: { id }, data: await this.templateData(dto) });
    await this.audit.log({ actorId: a.id, action: 'template.update', targetType: 'room_template', targetId: id, before, after: t, reason: dto.reason, ip: m.ip });
    if (t.active) await this.games.ensureOpenRoom(t.id);
    return t;
  }

  @Get()
  async list(@Query() q: Record<string, string>) {
    const where: Prisma.GameWhereInput = {};
    if (q.status && q.status in GameStatus) where.status = q.status as GameStatus;
    const page = Math.max(Number(q.page) || 1, 1);
    const [items, total] = await Promise.all([
      this.prisma.game.findMany({
        where,
        orderBy: { openedAt: 'desc' },
        skip: (page - 1) * 50,
        take: 50,
        include: { _count: { select: { entries: true } } },
      }),
      this.prisma.game.count({ where }),
    ]);
    // Never expose unrevealed seeds.
    return { items: items.map(({ seed, ...g }) => ({ ...g, seed: g.winningNumber != null ? seed : null })), total, page, pageSize: 50 };
  }

  @Get(':id')
  async detail(@Param('id', ParseUUIDPipe) id: string) {
    const g = await this.prisma.game.findUnique({
      where: { id },
      include: { entries: { include: { user: { select: { id: true, fullName: true, phone: true } } }, orderBy: { number: 'asc' } } },
    });
    if (!g) throw new NotFoundException();
    const { seed, ...rest } = g;
    // Even admins only see the seed after the draw.
    return { ...rest, seed: g.winningNumber != null ? seed : null, proof: await this.games.verifyData(id) };
  }

  @Post(':id/cancel')
  async cancel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelDto, @CurrentUser() a: AuthUser, @Meta() m: RequestMeta) {
    const g = await this.games.cancel(id, dto.reason, a.id);
    await this.audit.log({ actorId: a.id, action: 'game.cancel', targetType: 'game', targetId: id, before: { status: 'OPEN' }, after: { status: 'CANCELLED' }, reason: dto.reason, ip: m.ip });
    return g;
  }
}
