import { en, type Messages } from './en';

/** Active message catalogue. Add e.g. `tpi.ts` (Tok Pisin) with the same shape and select it here. */
const catalogues: Record<string, Messages> = { en };

export const m: Messages = catalogues.en;

/** Fill `{name}` placeholders; unknown placeholders are left as-is. */
export function fmt(template: string, vars: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (whole, k: string) => (k in vars ? String(vars[k]) : whole));
}

/** "pending_approval" → "Pending approval" when no explicit label exists. */
export function humanize(key: string): string {
  const s = key.replace(/[._]/g, ' ').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function label(map: Record<string, string>, key: string | null | undefined): string {
  if (!key) return '—';
  return map[key] ?? humanize(key);
}
