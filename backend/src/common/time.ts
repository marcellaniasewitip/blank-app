/** Business time zone. Timestamps are stored in UTC; local time is used for display and day boundaries. */
export const BUSINESS_TZ = 'Pacific/Port_Moresby';
/** Port Moresby has no DST: UTC+10 all year. */
export const BUSINESS_UTC_OFFSET_HOURS = 10;

/** Start of the local business day (Pacific/Port_Moresby) containing `at`, as a UTC Date. */
export function startOfBusinessDay(at: Date = new Date()): Date {
  const shifted = new Date(at.getTime() + BUSINESS_UTC_OFFSET_HOURS * 3600_000);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - BUSINESS_UTC_OFFSET_HOURS * 3600_000);
}

export function formatLocal(at: Date): string {
  return at.toLocaleString('en-PG', { timeZone: BUSINESS_TZ, hour12: false });
}
