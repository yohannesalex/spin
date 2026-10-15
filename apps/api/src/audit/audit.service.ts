import { Global, Injectable, Module } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, Tx } from '../common/prisma.service';

export interface AuditInput {
  actorId: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  before?: unknown;
  after?: unknown;
  reason: string;
  ip?: string | null;
}

const json = (v: unknown) =>
  v === undefined ? undefined : (JSON.parse(JSON.stringify(v ?? null)) as Prisma.InputJsonValue);

/** §7 Audit log: every admin action with who, what, before/after, reason, IP and time. */
@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  log(input: AuditInput, tx?: Tx) {
    return (tx ?? this.prisma).auditLog.create({
      data: { ...input, targetId: input.targetId ?? null, before: json(input.before), after: json(input.after) },
    });
  }
}

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
