import { computeCommission, formatKina } from '../../src/common/money';

describe('commission', () => {
  it('percent of price, rounded half-up to whole toea', () => {
    expect(computeCommission(8000, 'percent', 10)).toBe(800);
    expect(computeCommission(12345, 'percent', 10)).toBe(1235); // 1234.5 → 1235
    expect(computeCommission(12344, 'percent', 10)).toBe(1234); // 1234.4 → 1234
    expect(computeCommission(20000, 'percent', 7.5)).toBe(1500);
    expect(computeCommission(333, 'percent', 12.5)).toBe(42); // 41.625 → 42
    expect(computeCommission(0, 'percent', 10)).toBe(0);
  });

  it('uses integer arithmetic (no float drift)', () => {
    // 0.1 + 0.2 style traps: 1005 * 10% = 100.5 → 101
    expect(computeCommission(1005, 'percent', 10)).toBe(101);
    for (let p = 0; p <= 100000; p += 997) {
      const c = computeCommission(p, 'percent', 10);
      expect(Number.isInteger(c)).toBe(true);
      expect(Math.abs(c - p / 10)).toBeLessThanOrEqual(0.5);
    }
  });

  it('flat commission in toea, capped at the price', () => {
    expect(computeCommission(8000, 'flat', 500)).toBe(500);
    expect(computeCommission(300, 'flat', 500)).toBe(300);
  });

  it('rejects invalid inputs', () => {
    expect(() => computeCommission(10.5, 'percent', 10)).toThrow();
    expect(() => computeCommission(100, 'percent', -1)).toThrow();
    expect(() => computeCommission(100, 'percent', 101)).toThrow();
  });
});

describe('formatKina', () => {
  it('formats toea as Kina', () => {
    expect(formatKina(12550)).toBe('K125.50');
    expect(formatKina(5)).toBe('K0.05');
    expect(formatKina(0)).toBe('K0.00');
    expect(formatKina(-1500)).toBe('-K15.00');
  });
});
