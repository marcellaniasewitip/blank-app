import { describe, expect, it } from 'vitest';
import { addDaysYmd, formatDateTime, localDayEndExclusiveIso, localDayStartIso, localYmd } from './time';

describe('Port Moresby time helpers', () => {
  it('formats UTC instants in Pacific/Port_Moresby (UTC+10)', () => {
    expect(formatDateTime('2026-10-15T14:30:00.000Z')).toMatch(/16 Oct 2026.*00:30/);
    expect(formatDateTime(null)).toBe('—');
  });

  it('computes local day boundaries in UTC', () => {
    expect(localDayStartIso('2026-10-16')).toBe('2026-10-15T14:00:00.000Z');
    expect(localDayEndExclusiveIso('2026-10-16')).toBe('2026-10-16T14:00:00.000Z');
  });

  it('gives the local calendar date for an instant', () => {
    expect(localYmd(new Date('2026-10-15T13:59:59Z'))).toBe('2026-10-15');
    expect(localYmd(new Date('2026-10-15T14:00:00Z'))).toBe('2026-10-16');
  });

  it('adds days across month ends', () => {
    expect(addDaysYmd('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDaysYmd('2026-03-01', -1)).toBe('2026-02-28');
  });
});
