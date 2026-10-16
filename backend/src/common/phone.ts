import { Errors } from './errors';

/**
 * Normalise a PNG phone number to E.164 (+675XXXXXXXX). Accepts "+675 7xxx xxxx", "675...", "7xxxxxxx".
 * Other countries' E.164 numbers are accepted as-is.
 */
export function normalisePhone(input: string): string {
  const raw = input.replace(/[\s\-()]/g, '');
  let e164: string;
  if (raw.startsWith('+')) e164 = raw;
  else if (raw.startsWith('00')) e164 = `+${raw.slice(2)}`;
  else if (raw.startsWith('675')) e164 = `+${raw}`;
  else if (/^[1-9]\d{6,7}$/.test(raw)) e164 = `+675${raw}`;
  else e164 = `+${raw}`;
  if (!/^\+[1-9]\d{6,14}$/.test(e164)) throw Errors.invalid('invalid_phone', 'Enter a valid phone number');
  return e164;
}
