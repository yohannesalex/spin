import { Controller, Get, Query } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RequirePermission } from '../common/auth.decorators';
import { PrismaService } from '../common/prisma.service';

/** Read-only; the table itself is append-only via a DB trigger. */
@Controller('admin/audit')
@RequirePermission('audit.view')
export class AdminAuditController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async list(@Query() q: Record<string, string>) {
    const where: Prisma.AuditLogWhereInput = {};
    if (q.actorId) where.actorId = q.actorId;
    if (q.action) where.action = { contains: q.action };
    if (q.targetId) where.targetId = q.targetId;
    if (q.from || q.to) where.createdAt = { gte: q.from ? new Date(q.from) : undefined, lte: q.to ? new Date(q.to) : undefined };
    const page = Math.max(Number(q.page) || 1, 1);
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * 50, take: 50 }),
      this.prisma.auditLog.count({ where }),
    ]);
    const actors = await this.prisma.user.findMany({ where: { id: { in: [...new Set(items.map((i) => i.actorId))] } }, select: { id: true, fullName: true } });
    const names = Object.fromEntries(actors.map((a) => [a.id, a.fullName]));
    return { items: items.map((i) => ({ ...i, actorName: names[i.actorId] ?? i.actorId })), total, page, pageSize: 50 };
  }
}
