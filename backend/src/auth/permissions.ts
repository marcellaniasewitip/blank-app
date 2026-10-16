/** Admin permission keys (§3). Roles are editable in the dashboard; these are the building blocks. */
export const PERMISSIONS = {
  'dashboard.view': 'View the overview dashboard and live fleet map',
  'orders.view': 'View orders',
  'orders.manage': 'Cancel or reassign orders',
  'customers.view': 'View customer details (PII)',
  'customers.manage': 'Suspend or reactivate customers',
  'drivers.view': 'View drivers and their documents (PII)',
  'drivers.approve': 'Approve, reject or suspend drivers and review documents',
  'trucks.manage': 'Manage trucks',
  'depots.manage': 'Manage depots and geofences',
  'pricing.edit': 'Manage packages and prices',
  'settings.edit': 'Edit commission and system settings',
  'wallet.view': 'View wallets and ledgers',
  'wallet.approve_topup': 'Approve or reject driver wallet top-ups',
  'wallet.adjust': 'Post manual wallet adjustments',
  'payments.view': 'View payments and reconciliation',
  'payments.confirm': 'Match and confirm manual cell money payments',
  'payments.refund': 'Issue and complete refunds',
  'payouts.process': 'Approve and mark driver payouts as paid',
  'disputes.resolve': 'Investigate and resolve disputes',
  'notifications.edit': 'Edit notification templates',
  'reports.view': 'View and export reports',
  'admins.manage': 'Manage admin users and roles',
  'audit.view': 'View the audit log',
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as PermissionKey[];

/** Default roles seeded at install. [CONFIRM] the final list with the client. */
export const DEFAULT_ROLES: Record<string, { description: string; permissions: PermissionKey[] }> = {
  'Super Admin': { description: 'Full access', permissions: ALL_PERMISSIONS },
  Operations: {
    description: 'Day-to-day orders, drivers, fleet and depots',
    permissions: [
      'dashboard.view',
      'orders.view',
      'orders.manage',
      'customers.view',
      'drivers.view',
      'drivers.approve',
      'trucks.manage',
      'depots.manage',
      'disputes.resolve',
      'reports.view',
    ],
  },
  Finance: {
    description: 'Money: top-ups, payments, refunds, payouts, pricing and reports',
    permissions: [
      'dashboard.view',
      'orders.view',
      'wallet.view',
      'wallet.approve_topup',
      'wallet.adjust',
      'payments.view',
      'payments.confirm',
      'payments.refund',
      'payouts.process',
      'pricing.edit',
      'settings.edit',
      'reports.view',
      'audit.view',
    ],
  },
  Support: {
    description: 'Customer and driver support',
    permissions: ['dashboard.view', 'orders.view', 'customers.view', 'drivers.view', 'disputes.resolve'],
  },
};
