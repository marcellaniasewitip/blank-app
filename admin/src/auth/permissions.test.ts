import { describe, expect, it } from 'vitest';
import { can, filterByPermission, PERMISSION_KEYS, type PermissionRequirement } from './permissions';

const finance = ['dashboard.view', 'orders.view', 'wallet.view', 'wallet.approve_topup', 'payments.view'];

describe('can', () => {
  it('allows when there is no requirement', () => {
    expect(can([], undefined)).toBe(true);
    expect(can(null, null)).toBe(true);
  });

  it('denies everything without a permission list', () => {
    expect(can(null, 'orders.view')).toBe(false);
    expect(can(undefined, ['orders.view'])).toBe(false);
  });

  it('checks a single permission', () => {
    expect(can(finance, 'wallet.approve_topup')).toBe(true);
    expect(can(finance, 'drivers.approve')).toBe(false);
  });

  it('treats an array as all-of', () => {
    expect(can(finance, ['wallet.view', 'payments.view'])).toBe(true);
    expect(can(finance, ['wallet.view', 'wallet.adjust'])).toBe(false);
    expect(can(finance, { allOf: ['wallet.view', 'payments.view'] })).toBe(true);
  });

  it('supports any-of', () => {
    expect(can(finance, { anyOf: ['drivers.approve', 'payments.view'] })).toBe(true);
    expect(can(finance, { anyOf: ['drivers.approve', 'admins.manage'] })).toBe(false);
    expect(can(finance, { anyOf: [] })).toBe(true);
  });

  it('works with a Set', () => {
    expect(can(new Set(finance), 'orders.view')).toBe(true);
    expect(can(new Set(finance), 'audit.view')).toBe(false);
  });

  it('knows every backend permission key', () => {
    expect(PERMISSION_KEYS).toHaveLength(23);
    expect(new Set(PERMISSION_KEYS).size).toBe(23);
  });
});

describe('filterByPermission', () => {
  interface Item {
    label: string;
    permission?: PermissionRequirement;
    children?: Item[];
  }
  const nav: Item[] = [
    { label: 'Overview', permission: 'dashboard.view' },
    {
      label: 'Money',
      children: [
        { label: 'Top-ups', permission: 'wallet.view' },
        { label: 'Payouts', permission: 'payouts.process' },
      ],
    },
    { label: 'Admin', children: [{ label: 'Admins', permission: 'admins.manage' }] },
    { label: 'Profile' },
  ];

  it('hides items and drops empty groups', () => {
    const out = filterByPermission(nav, finance);
    expect(out.map((i) => i.label)).toEqual(['Overview', 'Money', 'Profile']);
    expect(out[1].children?.map((i) => i.label)).toEqual(['Top-ups']);
  });

  it('shows only ungated items to an admin with no permissions', () => {
    expect(filterByPermission(nav, []).map((i) => i.label)).toEqual(['Profile']);
  });

  it('shows everything to a super admin', () => {
    const out = filterByPermission(nav, [...PERMISSION_KEYS]);
    expect(out).toHaveLength(4);
    expect(out[1].children).toHaveLength(2);
  });
});
