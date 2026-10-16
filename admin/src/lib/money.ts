/**
 * Money helpers. All amounts are integer toea (1 PGK = 100 toea). No floating point is used for
 * money: parsing works on the decimal string and formatting on integer division.
 */

const KINA_RE = /^([+-])?(\d+)(?:\.(\d{0,2}))?$/;

/** 12550 → "K125.50"; -500 → "-K5.00"; 123456789 → "K1,234,567.89". */
export function formatKina(toea: number | null | undefined, opts: { signed?: boolean } = {}): string {
  if (toea === null || toea === undefined || !Number.isFinite(toea)) return '—';
  if (!Number.isSafeInteger(toea)) throw new Error('Amount must be an integer number of toea');
  const neg = toea < 0;
  const abs = Math.abs(toea);
  const kina = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const cents = String(abs % 100).padStart(2, '0');
  const sign = neg ? '-' : opts.signed && toea > 0 ? '+' : '';
  return `${sign}K${kina}.${cents}`;
}

/**
 * Parse a Kina amount typed by a person into integer toea.
 * Accepts "12", "12.5", "12.50", "K12.50", "1,250.00", "-3.25", " +4 ". Returns null when invalid
 * (more than 2 decimals, letters, empty, out of safe range).
 */
export function parseKinaToToea(input: string | number | null | undefined, opts: { allowNegative?: boolean } = {}): number | null {
  if (input === null || input === undefined) return null;
  let s = String(input).trim().replace(/\s+/g, '');
  if (!s) return null;
  // Optional currency marker before or after the sign: "K12", "-K12", "PGK 12".
  s = s.replace(/^([+-]?)(?:PGK|K)/i, '$1');
  if (/,/.test(s)) {
    // Thousands separators must be well-formed: 1,234,567.89
    if (!/^[+-]?\d{1,3}(,\d{3})+(\.\d*)?$/.test(s)) return null;
    s = s.replace(/,/g, '');
  }
  const m = KINA_RE.exec(s);
  if (!m) return null;
  const [, sign, whole, frac = ''] = m;
  if (sign === '-' && !opts.allowNegative) return null;
  const toea = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  if (!Number.isSafeInteger(toea)) return null;
  return sign === '-' ? -toea : toea;
}

/** Integer toea → plain decimal string for an input field: 12550 → "125.50". */
export function toeaToKinaInput(toea: number | null | undefined): string {
  if (toea === null || toea === undefined) return '';
  const neg = toea < 0;
  const abs = Math.abs(toea);
  return `${neg ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}
