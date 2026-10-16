import { normalisePhone } from '../../src/common/phone';
import { gsm7Length, isGsm7 } from '../../src/notifications/sms.provider';
import { render, DEFAULT_TEMPLATES } from '../../src/notifications/templates';
import { toCsv } from '../../src/reports/reports.service';
import { validateSetting, SETTING_DEFAULTS } from '../../src/settings/defaults';
import { decodeCursor, encodeCursor, toPage } from '../../src/common/pagination';
import { startOfBusinessDay } from '../../src/common/time';
import { haversineMetres } from '../../src/common/geo';

describe('phone normalisation', () => {
  it('normalises PNG numbers to E.164', () => {
    expect(normalisePhone('71234567')).toBe('+67571234567');
    expect(normalisePhone('+675 7123 4567')).toBe('+67571234567');
    expect(normalisePhone('67571234567')).toBe('+67571234567');
    expect(normalisePhone('0061412345678')).toBe('+61412345678');
  });
  it('rejects garbage', () => {
    expect(() => normalisePhone('abc')).toThrow();
    expect(() => normalisePhone('12')).toThrow();
  });
});

describe('SMS templates', () => {
  it('every default SMS body is GSM-7 and fits 160 chars with typical values', () => {
    const sample = { code: '123456', minutes: 5, shortCode: 'CW-48213', amount: 'K300.00', driverName: 'John Kila', plate: 'CW101', reason: 'Customer request', balance: 'K150.00', instructions: 'Send K300.00 to 7xxxxxxx ref CW-48213.' };
    for (const t of DEFAULT_TEMPLATES.filter((t) => t.smsBody)) {
      expect(isGsm7(t.smsBody!)).toBe(true);
      expect(gsm7Length(render(t.smsBody!, sample))).toBeLessThanOrEqual(160);
    }
  });
  it('detects non GSM-7 text', () => {
    expect(isGsm7('Hello 😀')).toBe(false);
    expect(isGsm7('“curly”')).toBe(false);
    expect(isGsm7('Plain text [ok] €5')).toBe(true);
    expect(gsm7Length('[]')).toBe(4);
  });
  it('renders placeholders', () => {
    expect(render('Hi {{name}}, {{ missing }}!', { name: 'Ana' })).toBe('Hi Ana, !');
  });
});

describe('CSV', () => {
  it('escapes quotes, commas and spreadsheet formulas', () => {
    const csv = toCsv(['a', 'b'], [['x,y', 'say "hi"'], ['=SUM(A1)', 5]]);
    expect(csv).toBe('a,b\r\n"x,y","say ""hi"""\r\n\'=SUM(A1),5\r\n');
  });
});

describe('settings validation', () => {
  it('accepts every default', () => {
    for (const [k, v] of Object.entries(SETTING_DEFAULTS)) expect(validateSetting(k, v)).toBeNull();
  });
  it('rejects wrong types, enums and unknown keys', () => {
    expect(validateSetting('commission.type', 'weird')).toMatch(/one of/);
    expect(validateSetting('wallet.min_balance_toea', 50.5)).toMatch(/whole/);
    expect(validateSetting('wallet.min_balance_toea', '5000')).toMatch(/number/);
    expect(validateSetting('order.dispatch_radius_m', [])).toMatch(/empty/);
    expect(validateSetting('nope', 1)).toMatch(/Unknown/);
  });
});

describe('cursor pagination', () => {
  it('round-trips cursors and splits pages', () => {
    const rows = [3, 2, 1].map((i) => ({ id: `id${i}`, createdAt: new Date(2024, 0, i) }));
    const page = toPage(rows, 2);
    expect(page.items).toHaveLength(2);
    expect(decodeCursor(page.nextCursor!)).toEqual({ id: 'id2', createdAt: rows[1].createdAt.toISOString() });
    expect(toPage(rows, 5).nextCursor).toBeNull();
    expect(() => decodeCursor('not-a-cursor')).toThrow();
    expect(encodeCursor(rows[0])).toBeTruthy();
  });
});

describe('business time', () => {
  it('local day starts at 14:00 UTC the previous day (UTC+10)', () => {
    expect(startOfBusinessDay(new Date('2024-05-10T03:00:00Z')).toISOString()).toBe('2024-05-09T14:00:00.000Z');
    expect(startOfBusinessDay(new Date('2024-05-10T15:00:00Z')).toISOString()).toBe('2024-05-10T14:00:00.000Z');
  });
});

describe('geo', () => {
  it('haversine is roughly right around Port Moresby', () => {
    const d = haversineMetres(-9.4438, 147.1803, -9.4438 + 0.009, 147.1803);
    expect(d).toBeGreaterThan(990);
    expect(d).toBeLessThan(1010);
  });
});
