/** GSM 03.38 basic character set + extension table — mirrors backend/src/notifications/sms.provider.ts. */
const GSM7_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM7_EXT = '^{}\\[~]|€\f';

export const SMS_MAX_SEPTETS = 160;

export function isGsm7Char(ch: string): boolean {
  return GSM7_BASIC.includes(ch) || GSM7_EXT.includes(ch);
}

export function isGsm7(text: string): boolean {
  for (const ch of text) if (!isGsm7Char(ch)) return false;
  return true;
}

/** Length in GSM-7 septets (extension characters count double). */
export function gsm7Length(text: string): number {
  let n = 0;
  for (const ch of text) n += GSM7_EXT.includes(ch) ? 2 : 1;
  return n;
}

export interface SmsCheck {
  /** Septets counted the way the backend counts them: `{{var}}` placeholders excluded. */
  length: number;
  max: number;
  remaining: number;
  tooLong: boolean;
  gsm7: boolean;
  /** Distinct characters outside GSM-7, in order of first appearance. */
  invalidChars: string[];
  ok: boolean;
}

export function checkSmsBody(body: string): SmsCheck {
  const invalid: string[] = [];
  for (const ch of body) if (!isGsm7Char(ch) && !invalid.includes(ch)) invalid.push(ch);
  const length = gsm7Length(body.replace(/\{\{\s*\w+\s*\}\}/g, ''));
  const tooLong = length > SMS_MAX_SEPTETS;
  return {
    length,
    max: SMS_MAX_SEPTETS,
    remaining: SMS_MAX_SEPTETS - length,
    tooLong,
    gsm7: invalid.length === 0,
    invalidChars: invalid,
    ok: !tooLong && invalid.length === 0,
  };
}

/** Common smart punctuation → GSM-7 equivalents, offered as a one-click fix. */
export function toGsm7Safe(text: string): string {
  return text
    .replace(/[\u2018\u2019\u201B\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201F\u2033]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ');
}
