import { Role } from '@prisma/client';

// REQ-ROLE-03: permission map ready for finer roles. v1 ships a single all-access ADMIN;
// SUPPORT / FINANCE exist in the schema but have no grants until they are defined.
export const PERMISSIONS = [
  'dashboard.view',
  'deposits.review',
  'payouts.manage',
  'users.manage',
  'balances.adjust',
  'games.manage',
  'settings.manage',
  'reports.view',
  'audit.view',
  'admins.manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const GRANTS: Record<Role, readonly Permission[]> = {
  PLAYER: [],
  ADMIN: PERMISSIONS,
  SUPPORT: [],
  FINANCE: [],
};

export const isStaff = (role: Role) => role !== Role.PLAYER;
export const hasPermission = (role: Role, p: string) => (GRANTS[role] as readonly string[]).includes(p);
