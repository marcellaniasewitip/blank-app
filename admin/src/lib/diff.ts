/** Shallow-ish JSON diff for audit before/after views. Nested values are compared by JSON text. */
export type DiffKind = 'added' | 'removed' | 'changed' | 'same';
export interface DiffRow {
  key: string;
  kind: DiffKind;
  before: unknown;
  after: unknown;
}

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function jsonDiff(before: unknown, after: unknown): DiffRow[] {
  const b = isPlainObject(before) ? before : before === null || before === undefined ? {} : { value: before };
  const a = isPlainObject(after) ? after : after === null || after === undefined ? {} : { value: after };
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])].sort();
  return keys.map((key) => {
    const inB = key in b;
    const inA = key in a;
    const kind: DiffKind = !inB ? 'added' : !inA ? 'removed' : JSON.stringify(b[key]) === JSON.stringify(a[key]) ? 'same' : 'changed';
    return { key, kind, before: b[key], after: a[key] };
  });
}

export function renderValue(v: unknown): string {
  if (v === undefined) return '';
  if (typeof v === 'string') return v;
  return JSON.stringify(v, null, 2);
}
