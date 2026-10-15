import { BadRequestException, Body, ConflictException, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuditService } from '../audit/audit.service';
import { AuthUser, CurrentUser, RequirePermission } from '../common/auth.decorators';
import { normalizePhone } from '../common/phone';
import { PrismaService } from '../common/prisma.service';
import { Meta, RequestMeta } from '../common/request-meta';
import { CreateAdminDto, ReasonDto, ResetAdmin2faDto } from './dto';

/** REQ-ROLE-01: admins are created only by another admin (or the seed script). */
@Controller('admin/admins')
@RequirePermission('admins.manage')
export class AdminAdminsController {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  @Get()
  list() {
    return this.prisma.user.findMany({
      where: { role: { not: 'PLAYER' } },
      select: { id: true, fullName: true, phone: true, role: true, disabled: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  @Post()
  async create(@Body() dto: CreateAdminDto, @CurrentUser() a: AuthUser, @Meta() m: RequestMeta) {
    const phone = normalizePhone(dto.phone);
    if (!phone) throw new BadRequestException('Invalid phone number');
    if (await this.prisma.user.findUnique({ where: { phone } })) throw new ConflictException('Phone already in use');
    const admin = await this.prisma.user.create({
      data: { fullName: dto.fullName, phone, passwordHash: await bcrypt.hash(dto.password, 12), role: 'ADMIN', status: 'ACTIVE' },
      select: { id: true, fullName: true, phone: true, role: true },
    });
    await this.audit.log({ actorId: a.id, action: 'admin.create', targetType: 'user', targetId: admin.id, after: admin, reason: dto.reason, ip: m.ip });
    return admin;
  }

  @Post(':id/disable')
  async disable(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto, @CurrentUser() a: AuthUser, @Meta() m: RequestMeta) {
    if (id === a.id) throw new BadRequestException('You cannot disable yourself');
    const remaining = await this.prisma.user.count({ where: { role: 'ADMIN', disabled: false, id: { not: id } } });
    if (remaining === 0) throw new BadRequestException('At least one active admin is required');
    await this.prisma.user.update({ where: { id, role: { not: 'PLAYER' } }, data: { disabled: true } });
    await this.prisma.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.audit.log({ actorId: a.id, action: 'admin.disable', targetType: 'user', targetId: id, before: { disabled: false }, after: { disabled: true }, reason: dto.reason, ip: m.ip });
    return { ok: true };
  }

  @Post(':id/enable')
  async enable(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto, @CurrentUser() a: AuthUser, @Meta() m: RequestMeta) {
    await this.prisma.user.update({ where: { id, role: { not: 'PLAYER' } }, data: { disabled: false } });
    await this.audit.log({ actorId: a.id, action: 'admin.enable', targetType: 'user', targetId: id, before: { disabled: true }, after: { disabled: false }, reason: dto.reason, ip: m.ip });
    return { ok: true };
  }

  /** 2FA is SMS OTP to the admin's phone; resetting it moves it to a new phone and signs them out. */
  @Post(':id/reset-2fa')
  async reset2fa(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ResetAdmin2faDto, @CurrentUser() a: AuthUser, @Meta() m: RequestMeta) {
    const phone = normalizePhone(dto.phone);
    if (!phone) throw new BadRequestException('Invalid phone number');
    const before = await this.prisma.user.findUniqueOrThrow({ where: { id }, select: { phone: true, role: true } });
    if (before.role === 'PLAYER') throw new BadRequestException('Not an admin');
    const clash = await this.prisma.user.findUnique({ where: { phone } });
    if (clash && clash.id !== id) throw new ConflictException('Phone already in use');
    await this.prisma.user.update({ where: { id }, data: { phone } });
    await this.prisma.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.audit.log({ actorId: a.id, action: 'admin.reset_2fa', targetType: 'user', targetId: id, before: { phone: before.phone }, after: { phone }, reason: dto.reason, ip: m.ip });
    return { ok: true };
  }
}
