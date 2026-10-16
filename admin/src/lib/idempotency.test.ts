import { describe, expect, it } from 'vitest';
import { IdempotencyKeeper, newIdempotencyKey } from './idempotency';

describe('idempotency keys', () => {
  it('generates RFC 4122 v4 UUIDs', () => {
    const k = newIdempotencyKey();
    expect(k).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(newIdempotencyKey()).not.toBe(k);
  });

  it('reuses the key when retrying the same action, rotates on change or reset', () => {
    let n = 0;
    const keeper = new IdempotencyKeeper(() => `key-${++n}`);
    const a = keeper.keyFor({ walletId: 'w', amountToea: 500, reason: 'fix' });
    expect(keeper.keyFor({ walletId: 'w', amountToea: 500, reason: 'fix' })).toBe(a); // network retry
    const b = keeper.keyFor({ walletId: 'w', amountToea: 600, reason: 'fix' }); // edited → new action
    expect(b).not.toBe(a);
    keeper.reset();
    expect(keeper.keyFor({ walletId: 'w', amountToea: 600, reason: 'fix' })).not.toBe(b);
  });
});
