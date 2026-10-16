import { describe, expect, it } from 'vitest';
import type { FleetDriver } from '@/api/types';
import { applyFleetEvent } from './fleet';

const d = (id: string, extra: Partial<FleetDriver> = {}): FleetDriver => ({
  driverId: id,
  name: id,
  phone: '+675',
  plate: null,
  online: true,
  stale: true,
  lat: -9.4,
  lng: 147.1,
  lastSeenAt: '2026-10-16T00:00:00.000Z',
  activeOrder: null,
  ...extra,
});

describe('applyFleetEvent', () => {
  it('moves a driver and clears stale', () => {
    const out = applyFleetEvent([d('a'), d('b')], { driverId: 'b', lat: -9.5, lng: 147.2, online: true, at: '2026-10-16T01:00:00.000Z' })!;
    expect(out[1]).toMatchObject({ lat: -9.5, lng: 147.2, stale: false, lastSeenAt: '2026-10-16T01:00:00.000Z' });
    expect(out[0]).toEqual(d('a'));
  });

  it('marks a driver offline without moving them', () => {
    const out = applyFleetEvent([d('a')], { driverId: 'a', online: false })!;
    expect(out[0]).toMatchObject({ online: false, lat: -9.4, lng: 147.1, stale: true });
  });

  it('ignores unknown drivers and empty caches', () => {
    const list = [d('a')];
    expect(applyFleetEvent(list, { driverId: 'zzz', online: true, lat: 1, lng: 1 })).toBe(list);
    expect(applyFleetEvent(undefined, { driverId: 'a', online: true })).toBeUndefined();
  });
});
