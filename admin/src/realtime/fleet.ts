import type { FleetDriver, FleetLocationEvent } from '@/api/types';

/** Merge a `fleet.driver_location` event into the cached fleet list. */
export function applyFleetEvent(list: FleetDriver[] | undefined, e: FleetLocationEvent): FleetDriver[] | undefined {
  if (!list) return list;
  const idx = list.findIndex((d) => d.driverId === e.driverId);
  if (idx < 0) return list; // unknown driver (e.g. newly approved): the next refetch picks it up
  const next = [...list];
  const d = next[idx];
  next[idx] = {
    ...d,
    online: e.online,
    lat: e.lat ?? d.lat,
    lng: e.lng ?? d.lng,
    lastSeenAt: e.lat !== undefined ? (e.at ?? new Date().toISOString()) : d.lastSeenAt,
    stale: e.lat !== undefined ? false : d.stale,
  };
  return next;
}

