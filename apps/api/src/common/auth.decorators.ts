import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Role, UserStatus } from '@prisma/client';

export interface AuthUser {
  id: string;
  role: Role;
  status: UserStatus;
  sessionId: string;
  twoFactor: boolean;
}

export const IS_PUBLIC = 'isPublic';
/** Route needs no login (guests can call it). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const PERMISSION = 'permission';
/** Route needs a staff permission (see permissions.ts). Implies 2FA-verified session. */
export const RequirePermission = (p: string) => SetMetadata(PERMISSION, p);

export const PLAYER_ONLY = 'playerOnly';
/** Route is for players only (admins cannot play — spec §2). */
export const PlayerOnly = () => SetMetadata(PLAYER_ONLY, true);

export const ALLOW_RESTRICTED = 'allowRestricted';
/** Suspended accounts may still call this route (read-only wallet etc.). */
export const AllowRestricted = () => SetMetadata(ALLOW_RESTRICTED, true);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser =>
  ctx.switchToHttp().getRequest().user,
);
