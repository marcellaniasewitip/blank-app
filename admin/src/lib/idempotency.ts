/**
 * Idempotency keys for money actions. One key per user action: retrying the *same* request
 * (same payload, e.g. after a network error) reuses the key so the server can de-duplicate;
 * changing the payload starts a new action with a new key (the server rejects key reuse with a
 * different body, and replays 4xx errors for a key).
 */
export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // RFC 4122 v4 fallback using getRandomValues.
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export class IdempotencyKeeper {
  private key: string | null = null;
  private fingerprint: string | null = null;

  constructor(private readonly gen: () => string = newIdempotencyKey) {}

  /** Same payload as the last attempt → same key; otherwise a fresh key. */
  keyFor(payload: unknown): string {
    const fp = JSON.stringify(payload);
    if (!this.key || fp !== this.fingerprint) {
      this.key = this.gen();
      this.fingerprint = fp;
    }
    return this.key;
  }

  /** Call after the action succeeded (or the user gave up) so the next action gets a new key. */
  reset(): void {
    this.key = null;
    this.fingerprint = null;
  }
}
