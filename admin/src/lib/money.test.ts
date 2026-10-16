import { describe, expect, it } from 'vitest';
import { formatKina, parseKinaToToea, toeaToKinaInput } from './money';

describe('formatKina', () => {
  it.each([
    [0, 'K0.00'],
    [5, 'K0.05'],
    [1250, 'K12.50'],
    [12550, 'K125.50'],
    [100, 'K1.00'],
    [123456789, 'K1,234,567.89'],
    [-500, '-K5.00'],
    [-1, '-K0.01'],
  ])('%i toea → %s', (toea, out) => expect(formatKina(toea)).toBe(out));

  it('adds + when signed', () => {
    expect(formatKina(2500, { signed: true })).toBe('+K25.00');
    expect(formatKina(-2500, { signed: true })).toBe('-K25.00');
    expect(formatKina(0, { signed: true })).toBe('K0.00');
  });

  it('renders a dash for missing values', () => {
    expect(formatKina(null)).toBe('—');
    expect(formatKina(undefined)).toBe('—');
  });

  it('rejects non-integer toea', () => {
    expect(() => formatKina(12.5)).toThrow();
  });
});

describe('parseKinaToToea', () => {
  it.each([
    ['12', 1200],
    ['12.5', 1250],
    ['12.50', 1250],
    ['12.05', 1205],
    ['0.01', 1],
    ['.5', null],
    ['K12.50', 1250],
    ['k3', 300],
    ['PGK 7.25', 725],
    ['1,250.00', 125000],
    ['1,234,567.89', 123456789],
    ['  40 ', 4000],
    ['12.', 1200],
    ['0', 0],
  ])('%j → %j', (input, out) => expect(parseKinaToToea(input)).toBe(out));

  it('never suffers float rounding (0.29, 1.15, 4.35, 19.99)', () => {
    // parseFloat('0.29') * 100 === 28.999999999999996 — the string parser must not.
    expect(parseKinaToToea('0.29')).toBe(29);
    expect(parseKinaToToea('1.15')).toBe(115);
    expect(parseKinaToToea('4.35')).toBe(435);
    expect(parseKinaToToea('19.99')).toBe(1999);
    expect(parseKinaToToea('1005.10')).toBe(100510);
  });

  it.each(['', '   ', 'abc', '12.345', '1.2.3', '12,34', '1,2345.00', '--1', 'K', '12a', '1e3', 'Infinity', 'NaN'])('rejects %j', (input) => {
    expect(parseKinaToToea(input)).toBeNull();
  });

  it('rejects negatives unless allowed', () => {
    expect(parseKinaToToea('-5')).toBeNull();
    expect(parseKinaToToea('-5', { allowNegative: true })).toBe(-500);
    expect(parseKinaToToea('-K5.25', { allowNegative: true })).toBe(-525);
    expect(parseKinaToToea('+5', { allowNegative: true })).toBe(500);
  });

  it('rejects values beyond the safe integer range', () => {
    expect(parseKinaToToea('99999999999999999999')).toBeNull();
  });

  it('round-trips with toeaToKinaInput', () => {
    for (const t of [0, 1, 99, 100, 1250, 12550, 999999, -4321]) {
      expect(parseKinaToToea(toeaToKinaInput(t), { allowNegative: true })).toBe(t);
    }
    expect(toeaToKinaInput(1250)).toBe('12.50');
    expect(toeaToKinaInput(-5)).toBe('-0.05');
    expect(toeaToKinaInput(null)).toBe('');
  });
});
