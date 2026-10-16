import { randomInt } from 'crypto';

/** Human-readable order code, e.g. CW-48213. Uniqueness is enforced by the DB; callers retry on clash. */
export function generateShortCode(): string {
  return `CW-${randomInt(10000, 100000)}`;
}
