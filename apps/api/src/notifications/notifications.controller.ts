import { Controller, Get, Param, Post } from '@nestjs/common';
import { AllowRestricted, AuthUser, CurrentUser } from '../common/auth.decorators';
import { PrismaService } from '../common/prisma.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @AllowRestricted()
  async list(@CurrentUser() user: AuthUser) {
    const [items, unread] = await Promise.all([
      this.prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 50 }),
      this.prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    ]);
    return { items, unread };
  }

  @Post('read-all')
  @AllowRestricted()
  async readAll(@CurrentUser() user: AuthUser) {
    await this.prisma.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
    return { ok: true };
  }

  @Post(':id/read')
  @AllowRestricted()
  async read(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.prisma.notification.updateMany({ where: { id, userId: user.id }, data: { readAt: new Date() } });
    return { ok: true };
  }
}
