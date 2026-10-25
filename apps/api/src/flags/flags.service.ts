import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { FlagSeverity, FlagSubject } from '@prisma/client';
import { PrismaService, Tx } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class FlagsService {
  private log = new Logger('Flags');
  constructor(private prisma: PrismaService, private notifications: NotificationsService) {}

  async raise(
    input: { subjectType: FlagSubject; subjectId: string; userId?: string | null; severity: FlagSeverity; reason: string },
    tx?: Tx,
  ) {
    const db = tx ?? this.prisma;
    const flag = await db.flag.create({ data: { ...input, userId: input.userId ?? null } });
    if (input.severity === 'HIGH') {
      // REQ-NOT-01: admins are alerted about new high-severity flags.
      const href =
        input.subjectType === 'DEPOSIT' ? `/admin/deposits/${input.subjectId}`
        : input.subjectType === 'WITHDRAWAL' ? '/admin/payouts'
        : `/admin/users/${input.userId ?? input.subjectId}`;
      this.notifications
        .alertAdmins('High-severity flag', `${input.reason} — ${input.subjectType.toLowerCase()} ${input.subjectId.slice(0, 8)}`, {
          href,
          dedupeKey: `flag:${input.subjectType}:${input.subjectId}`,
          data: { flagId: flag.id },
        })
        .catch((e) => this.log.error(e.message));
      if (input.userId) await this.autoSuspend(input.userId, db);
    }
    return flag;
  }

  /** REQ-DEP-07: 3 or more high-severity flags in 30 days → suspended pending admin review. */
  private async autoSuspend(userId: string, db: Tx) {
    const count = await db.flag.count({
      where: { userId, severity: 'HIGH', createdAt: { gte: new Date(Date.now() - 30 * 86400_000) } },
    });
    if (count < 3) return;
    const res = await db.user.updateMany({ where: { id: userId, status: 'ACTIVE' }, data: { status: 'SUSPENDED' } });
    if (res.count) {
      await db.flag.create({
        data: { subjectType: 'USER', subjectId: userId, userId, severity: 'HIGH', reason: `Auto-suspended: ${count} high-severity flags in 30 days` },
      });
      this.log.warn(`User ${userId} auto-suspended`);
    }
  }

  resolveForSubject(subjectType: FlagSubject, subjectId: string, resolvedBy: string, note: string, tx?: Tx) {
    return (tx ?? this.prisma).flag.updateMany({
      where: { subjectType, subjectId, status: 'OPEN' },
      data: { status: 'RESOLVED', resolvedBy, resolutionNote: note, resolvedAt: new Date() },
    });
  }
}

@Global()
@Module({ providers: [FlagsService], exports: [FlagsService] })
export class FlagsModule {}
