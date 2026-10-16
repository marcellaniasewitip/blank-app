import { describe, expect, it } from 'vitest';
import { checkSmsBody, gsm7Length, isGsm7, SMS_MAX_SEPTETS, toGsm7Safe } from './gsm7';

describe('GSM-7', () => {
  it('accepts the basic charset', () => {
    expect(isGsm7('Cooper Waters: pay K12.50 for order CW-48213. @£$¥ èé ÄÖÑÜ')).toBe(true);
  });

  it('rejects emoji, curly quotes and other unicode', () => {
    expect(isGsm7('Thanks 💧')).toBe(false);
    expect(isGsm7('Driver’s here')).toBe(false);
    expect(isGsm7('“quoted”')).toBe(false);
    expect(isGsm7('…')).toBe(false);
  });

  it('counts extension characters as two septets', () => {
    expect(gsm7Length('abc')).toBe(3);
    expect(gsm7Length('€')).toBe(2);
    expect(gsm7Length('[x]')).toBe(5);
    expect(gsm7Length('{}|^~\\')).toBe(12);
  });
});

describe('checkSmsBody', () => {
  it('passes a normal template and reports remaining characters', () => {
    const c = checkSmsBody('Cooper Waters: your driver has arrived with order {{shortCode}}.');
    expect(c.ok).toBe(true);
    // placeholders are excluded like the backend does
    expect(c.length).toBe('Cooper Waters: your driver has arrived with order .'.length);
    expect(c.remaining).toBe(SMS_MAX_SEPTETS - c.length);
  });

  it('allows exactly 160 and rejects 161 septets', () => {
    expect(checkSmsBody('a'.repeat(160)).ok).toBe(true);
    const over = checkSmsBody('a'.repeat(161));
    expect(over.ok).toBe(false);
    expect(over.tooLong).toBe(true);
  });

  it('counts extension characters toward the limit', () => {
    expect(checkSmsBody('€'.repeat(80)).ok).toBe(true);
    expect(checkSmsBody('€'.repeat(80) + 'a').tooLong).toBe(true);
  });

  it('ignores {{ var }} placeholders (with spaces) when counting', () => {
    const c = checkSmsBody(`${'a'.repeat(150)}{{ driverName }}{{plate}}`);
    expect(c.length).toBe(150);
    expect(c.ok).toBe(true);
  });

  it('lists distinct invalid characters', () => {
    const c = checkSmsBody('It’s “here” 💧 ’');
    expect(c.gsm7).toBe(false);
    expect(c.ok).toBe(false);
    expect(c.invalidChars).toEqual(['’', '“', '”', '💧']);
  });

  it('toGsm7Safe replaces smart punctuation with GSM-7 equivalents', () => {
    const fixed = toGsm7Safe('It’s “here” – now…');
    expect(fixed).toBe('It\'s "here" - now...');
    expect(isGsm7(fixed)).toBe(true);
  });
});
