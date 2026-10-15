import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Prisma, UserStatus } from '@prisma/client';
import { AuthUser, CurrentUser, RequirePermission } from '../common/auth.decorators';
import { birrToCents } from '../common/money';
import { PrismaService } from '../common/prisma.service';
import { Meta, RequestMeta } from '../common/request-meta';
import { UsersService } from '../users/users.service';
import { AdjustDto, BanDto, ReasonDto } from './dto';

@Controller('admin/users')
@RequirePermission('users.manage')
export class AdminUsersController {
  constructor(private prisma: PrismaService, private users: UsersService) {}

  @Get()
  async search(@Query() q: Record<string, string>) {
    const where: Prisma.UserWhereInput = { role: 'PLAYER' };
    if (q.status && q.status in UserStatus) where.status = q.status as UserStatus;
    if (q.q) where.OR = [{ fullName: { contains: q.q, mode: 'insensitive' } }, { phone: { contains: q.q.replace(/\s/g, '') } }, { id: q.q }];
    const page = Math.max(Number(q.page) || 1, 1);
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * 50,
        take: 50,
        select: { id: true, fullName: true, phone: true, status: true, createdAt: true, wallet: { select: { balanceCents: true, lockedCents: true } } },
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items, total, page, pageSize: 50 };
  }

  @Get(':id')
  profile(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.profile(id);
  }

  @Post(':id/ban')
  ban(@Param('id', ParseUUIDPipe) id: string, @Body() dto: BanDto, @CurrentUser() a: AuthUser, @Meta() m: RequestMeta) {
    return this.users.ban(id, a.id, m.ip, dto);
  }

  @Post(':id/unban')
  unban(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto, @CurrentUser() a: AuthUser, @Meta() m: RequestMeta) {
    return this.users.unban(id, a.id, m.ip, dto.reason);
  }

  @Post(':id/suspend')
  suspend(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto, @CurrentUser() a: AuthUser, @Meta() m: RequestMeta) {
    return this.users.suspend(id, a.id, m.ip, dto.reason);
  }

  @Post(':id/force-logout')
  forceLogout(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto, @CurrentUser() a: AuthUser, @Meta() m: RequestMeta) {
    return this.users.forceLogout(id, a.id, m.ip, dto.reason);
  }

  @Post(':id/reset-limits')
  resetLimits(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto, @CurrentUser() a: AuthUser, @Meta() m: RequestMeta) {
    return this.users.resetLimits(id, a.id, m.ip, dto.reason);
  }

  @Post(':id/adjust') @RequirePermission('balances.adjust')
  adjust(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AdjustDto, @CurrentUser() a: AuthUser, @Meta() m: RequestMeta) {
    return this.users.adjustBalance(id, a.id, m.ip, birrToCents(dto.amount), dto.reason);
  }

  @Get('flags/open')
  openFlags() {
    return this.prisma.flag.findMany({ where: { status: 'OPEN', subjectType: { in: ['USER', 'WITHDRAWAL'] } }, orderBy: { createdAt: 'desc' }, take: 200 });
  }

  @Post('flags/:flagId/resolve')
  async resolveFlag(@Param('flagId', ParseUUIDPipe) flagId: string, @Body() dto: ReasonDto, @CurrentUser() a: AuthUser) {
    return this.prisma.flag.update({ where: { id: flagId }, data: { status: 'RESOLVED', resolvedBy: a.id, resolutionNote: dto.reason, resolvedAt: new Date() } });
  }
}
