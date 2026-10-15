import { BadRequestException, Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import { DepositStatus, Prisma, Provider } from '@prisma/client';
import type { Response } from 'express';
import { AuditService } from '../audit/audit.service';
import { AuthUser, CurrentUser, RequirePermission } from '../common/auth.decorators';
import { birrToCents } from '../common/money';
import { PrismaService } from '../common/prisma.service';
import { Meta, RequestMeta } from '../common/request-meta';
import { DepositsService } from '../deposits/deposits.service';
import { FLAG_INFO, FlagCode } from '../deposits/verification/matching';
import { FlagsService } from '../flags/flags.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StorageService } from '../storage/storage.service';
import { UsersService } from '../users/users.service';
import { ApproveDepositDto, AskInfoDto, ReasonDto } from './dto';

const userSelect = { select: { id: true, fullName: true, phone: true, status: true } };

@Controller('admin/deposits')
@RequirePermission('deposits.review')
export class AdminDepositsController {
  constructor(
    private prisma: PrismaService,
    private deposits: DepositsService,
    private storage: StorageService,
    private audit: AuditService,
    private flags: FlagsService,
    private users: UsersService,
    private notifications: NotificationsService,
  ) {}

  /** Flagged deposits queue: anything with an open flag, highest severity first, oldest first. */
  @Get('flagged')
  async flagged() {
    const flags = await this.prisma.flag.findMany({ where: { subjectType: 'DEPOSIT', status: 'OPEN' }, select: { subjectId: true } });
    const items = await this.prisma.deposit.findMany({
      where: { OR: [{ id: { in: flags.map((f) => f.subjectId) } }, { status: 'UNDER_REVIEW' }] },
      include: { user: userSelect },
      orderBy: [{ highestSeverity: 'desc' }, { createdAt: 'asc' }],
      take: 200,
    });
    return items.map((d) => ({ ...d, flagLabels: d.flagReasons.map((c) => FLAG_INFO[c as FlagCode]?.label ?? c) }));
  }

  /** All deposits: search by user, phone, reference, date, status, provider. */
  @Get()
  async search(@Query() q: Record<string, string>) {
    const where: Prisma.DepositWhereInput = {};
    if (q.status && q.status in DepositStatus) where.status = q.status as DepositStatus;
    if (q.provider && q.provider in Provider) where.provider = q.provider as Provider;
    if (q.reference) where.reference = { contains: q.reference.toUpperCase() };
    if (q.userId) where.userId = q.userId;
    if (q.phone) where.user = { phone: { contains: q.phone.replace(/\s/g, '') } };
    if (q.q) where.user = { OR: [{ fullName: { contains: q.q, mode: 'insensitive' } }, { phone: { contains: q.q } }] };
    if (q.from || q.to) where.createdAt = { gte: q.from ? new Date(q.from) : undefined, lte: q.to ? new Date(q.to) : undefined };
    const page = Math.max(Number(q.page) || 1, 1);
    const [items, total] = await Promise.all([
      this.prisma.deposit.findMany({ where, include: { user: userSelect }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * 50, take: 50 }),
      this.prisma.deposit.count({ where }),
    ]);
    return { items, total, page, pageSize: 50 };
  }

  @Get(':id')
  async detail(@Param('id', ParseUUIDPipe) id: string) {
    const d = await this.prisma.deposit.findUnique({ where: { id }, include: { user: userSelect } });
    if (!d) throw new NotFoundException();
    const [flags, sameRef] = await Promise.all([
      this.prisma.flag.findMany({ where: { subjectType: 'DEPOSIT', subjectId: id }, orderBy: { createdAt: 'desc' } }),
      d.reference
        ? this.prisma.deposit.findMany({ where: { reference: d.reference, provider: d.provider, id: { not: id } }, include: { user: userSelect } })
        : Promise.resolve([]),
    ]);
    return { ...d, flagLabels: d.flagReasons.map((c) => FLAG_INFO[c as FlagCode]?.label ?? c), flags, sameReference: sameRef };
  }

  @Get(':id/image')
  async image(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const d = await this.prisma.deposit.findUnique({ where: { id } });
    if (!d?.imageKey) throw new NotFoundException();
    res.type('png').setHeader('Cache-Control', 'private, max-age=300').send(await this.storage.get(d.imageKey));
  }

  @Get(':id/raw')
  async raw(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const d = await this.prisma.deposit.findUnique({ where: { id } });
    if (!d?.rawReceiptKey) throw new NotFoundException();
    const isPdf = d.rawReceiptKey.endsWith('.pdf');
    // Raw HTML from a third party is served as plain text so it can never execute in our origin.
    res.type(isPdf ? 'application/pdf' : 'text/plain; charset=utf-8')
      .setHeader('Content-Security-Policy', "default-src 'none'")
      .send(await this.storage.get(d.rawReceiptKey));
  }

  @Post(':id/approve')
  async approve(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ApproveDepositDto, @CurrentUser() admin: AuthUser, @Meta() meta: RequestMeta) {
    const d = await this.prisma.deposit.findUniqueOrThrow({ where: { id } });
    if (d.status === 'CREDITED') throw new BadRequestException('Already credited');
    if (d.reference) {
      const used = await this.prisma.usedReference.findUnique({ where: { provider_reference: { provider: d.provider, reference: d.reference } } });
      if (used) throw new BadRequestException('This receipt reference was already credited to another deposit');
    }
    const amountCents = dto.amount != null ? birrToCents(dto.amount) : d.claimedAmountCents;
    const credited = await this.deposits.credit(id, amountCents, admin.id, dto.reason);
    await this.flags.resolveForSubject('DEPOSIT', id, admin.id, `Approved: ${dto.reason}`);
    await this.audit.log({
      actorId: admin.id, action: 'deposit.approve', targetType: 'deposit', targetId: id,
      before: { status: d.status, claimedAmountCents: d.claimedAmountCents }, after: { status: 'CREDITED', creditedCents: amountCents },
      reason: dto.reason, ip: meta.ip,
    });
    return credited;
  }

  @Post(':id/reject')
  async reject(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto, @CurrentUser() admin: AuthUser, @Meta() meta: RequestMeta) {
    const d = await this.prisma.deposit.findUniqueOrThrow({ where: { id } });
    if (d.status === 'CREDITED') throw new BadRequestException('Credited deposits cannot be rejected; use a balance adjustment');
    const updated = await this.prisma.deposit.update({
      where: { id },
      data: { status: 'REJECTED', reviewedBy: admin.id, reviewedAt: new Date(), reviewNote: dto.reason },
    });
    await this.flags.resolveForSubject('DEPOSIT', id, admin.id, `Rejected: ${dto.reason}`);
    await this.audit.log({ actorId: admin.id, action: 'deposit.reject', targetType: 'deposit', targetId: id, before: { status: d.status }, after: { status: 'REJECTED' }, reason: dto.reason, ip: meta.ip });
    await this.notifications.inApp(d.userId, 'deposit', 'Deposit rejected', `Your deposit was rejected: ${dto.reason}`, { depositId: id });
    return updated;
  }

  @Post(':id/rerun')
  async rerun(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto, @CurrentUser() admin: AuthUser, @Meta() meta: RequestMeta) {
    const d = await this.prisma.deposit.findUniqueOrThrow({ where: { id } });
    if (d.status === 'CREDITED') throw new BadRequestException('Already credited');
    await this.prisma.deposit.update({ where: { id }, data: { status: 'VERIFYING', flagReasons: [], highestSeverity: null } });
    await this.flags.resolveForSubject('DEPOSIT', id, admin.id, `Re-run: ${dto.reason}`);
    await this.deposits.enqueue(id);
    await this.audit.log({ actorId: admin.id, action: 'deposit.rerun', targetType: 'deposit', targetId: id, before: { status: d.status, flagReasons: d.flagReasons }, after: { status: 'VERIFYING' }, reason: dto.reason, ip: meta.ip });
    return { ok: true };
  }

  @Post(':id/ask-info')
  async askInfo(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AskInfoDto, @CurrentUser() admin: AuthUser, @Meta() meta: RequestMeta) {
    const d = await this.prisma.deposit.findUniqueOrThrow({ where: { id } });
    await this.notifications.inApp(d.userId, 'deposit', 'We need more information', dto.message, { depositId: id });
    await this.audit.log({ actorId: admin.id, action: 'deposit.ask_info', targetType: 'deposit', targetId: id, after: { message: dto.message }, reason: dto.reason, ip: meta.ip });
    return { ok: true };
  }

  @Post(':id/suspend-user')
  async suspendUser(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto, @CurrentUser() admin: AuthUser, @Meta() meta: RequestMeta) {
    const d = await this.prisma.deposit.findUniqueOrThrow({ where: { id } });
    return this.users.suspend(d.userId, admin.id, meta.ip, dto.reason);
  }
}
