/** Admin permission keys — mirrors backend/src/auth/permissions.ts. */
export const PERMISSION_KEYS = [
  'dashboard.view',
  'orders.view',
  'orders.manage',
  'customers.view',
  'customers.manage',
  'drivers.view',
  'drivers.approve',
  'trucks.manage',
  'depots.manage',
  'pricing.edit',
  'settings.edit',
  'wallet.view',
  'wallet.approve_topup',
  'wallet.adjust',
  'payments.view',
  'payments.confirm',
  'payments.refund',
  'payouts.process',
  'disputes.resolve',
  'notifications.edit',
  'reports.view',
  'admins.manage',
  'audit.view',
] as const;

export type Permission = (typeof PERMISSION_KEYS)[number];

/** A requirement: one permission, all of a list (`allOf`), or at least one of a list (`anyOf`). */
export type PermissionRequirement = Permission | Permission[] | { anyOf: Permission[] } | { allOf: Permission[] } | null | undefined;

export function can(granted: readonly string[] | Set<string> | null | undefined, req: PermissionRequirement): boolean {
  if (!req) return true;
  if (!granted) return false;
  const has = (p: string) => (granted instanceof Set ? granted.has(p) : granted.includes(p));
  if (typeof req === 'string') return has(req);
  if (Array.isArray(req)) return req.every(has);
  if ('anyOf' in req) return req.anyOf.length === 0 || req.anyOf.some(has);
  return req.allOf.every(has);
}

/** Keep only entries the admin may see; drops empty groups. */
export function filterByPermission<T extends { permission?: PermissionRequirement; children?: T[] }>(items: T[], granted: readonly string[] | null | undefined): T[] {
  const out: T[] = [];
  for (const item of items) {
    if (!can(granted, item.permission)) continue;
    if (item.children) {
      const children = filterByPermission(item.children, granted);
      if (children.length === 0) continue;
      out.push({ ...item, children });
    } else {
      out.push(item);
    }
  }
  return out;
}
