import { config } from '@/config';

const dateTimeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: config.timeZone,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const dateFmt = new Intl.DateTimeFormat('en-GB', { timeZone: config.timeZone, day: '2-digit', month: 'short', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: config.timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const ymdFmt = new Intl.DateTimeFormat('en-CA', { timeZone: config.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });

const toDate = (v: string | Date | null | undefined): Date | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** UTC ISO → "16 Oct 2026, 15:49" in Port Moresby time. */
export function formatDateTime(v: string | Date | null | undefined): string {
  const d = toDate(v);
  return d ? dateTimeFmt.format(d) : '—';
}
export function formatDate(v: string | Date | null | undefined): string {
  const d = toDate(v);
  return d ? dateFmt.format(d) : '—';
}
export function formatTime(v: string | Date | null | undefined): string {
  const d = toDate(v);
  return d ? timeFmt.format(d) : '—';
}

/** "YYYY-MM-DD" of the given instant in Port Moresby. */
export function localYmd(v: Date = new Date()): string {
  return ymdFmt.format(v);
}

/** Start of a Port Moresby calendar day ("YYYY-MM-DD") as a UTC ISO string. */
export function localDayStartIso(ymd: string): string {
  return new Date(`${ymd}T00:00:00${config.utcOffset}`).toISOString();
}

/** Exclusive end of a Port Moresby calendar day as a UTC ISO string. */
export function localDayEndExclusiveIso(ymd: string): string {
  return new Date(new Date(`${ymd}T00:00:00${config.utcOffset}`).getTime() + 86_400_000).toISOString();
}

/** A calendar date picked in the browser (local components) → "YYYY-MM-DD". */
export function pickerDateToYmd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** "YYYY-MM-DD" → Date at local midnight for a picker. */
export function ymdToPickerDate(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "3 min ago" style relative time. */
export function timeAgo(v: string | Date | null | undefined, now = Date.now()): string {
  const d = toDate(v);
  if (!d) return '—';
  const s = Math.round((now - d.getTime()) / 1000);
  if (s < 0) return 'just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

/** Inclusive range of Port Moresby calendar days, as "YYYY-MM-DD" strings. */
export interface YmdRange {
  from: string;
  to: string;
}

export function lastNDays(n: number): YmdRange {
  const to = localYmd();
  return { from: addDaysYmd(to, -(n - 1)), to };
}
