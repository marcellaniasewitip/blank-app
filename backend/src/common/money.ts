/**
 * Money helpers. All amounts are integer toea (1 PGK = 100 toea). Never use floats for money (§1).
 */

export function assertToea(amount: number, name = 'amount'): void {
  if (!Number.isSafeInteger(amount)) throw new Error(`${name} must be an integer number of toea`);
}

/**
 * Commission for an order.
 * - percent: `value` is a percentage (may have up to 2 decimals, e.g. 7.5). Rounded half-up to whole toea
 *   using integer arithmetic on basis points.
 * - flat: `value` is a toea amount per order, capped at the price.
 */
export function computeCommission(priceToea: number, type: 'percent' | 'flat', value: number): number {
  assertToea(priceToea, 'priceToea');
  if (priceToea < 0) throw new Error('priceToea must be non-negative');
  if (value < 0) throw new Error('commission value must be non-negative');
  if (type === 'flat') {
    const flat = Math.round(value);
    return Math.min(flat, priceToea);
  }
  const basisPoints = Math.round(value * 100); // 10% → 1000 bp
  if (basisPoints > 10000) throw new Error('commission percent cannot exceed 100');
  return Math.floor((priceToea * basisPoints + 5000) / 10000);
}

/** Format toea as a Kina string for SMS/push text, e.g. 12550 → "K125.50". */
export function formatKina(toea: number): string {
  assertToea(toea);
  const sign = toea < 0 ? '-' : '';
  const abs = Math.abs(toea);
  return `${sign}K${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}
