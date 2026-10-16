import { describe, expect, it } from 'vitest';
import { jsonDiff } from './diff';

describe('jsonDiff', () => {
  it('classifies added, removed, changed and unchanged keys', () => {
    const rows = jsonDiff({ status: 'pending', amountToea: 500, note: 'x', meta: { a: 1 } }, { status: 'approved', amountToea: 500, reviewedBy: 'admin', meta: { a: 2 } });
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r.kind]));
    expect(byKey).toEqual({ status: 'changed', amountToea: 'same', note: 'removed', reviewedBy: 'added', meta: 'changed' });
  });

  it('handles null/primitive before/after', () => {
    expect(jsonDiff(null, { a: 1 })).toEqual([{ key: 'a', kind: 'added', before: undefined, after: 1 }]);
    expect(jsonDiff(5, 10)).toEqual([{ key: 'value', kind: 'changed', before: 5, after: 10 }]);
    expect(jsonDiff(null, null)).toEqual([]);
  });
});
