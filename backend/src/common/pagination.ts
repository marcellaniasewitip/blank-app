import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Errors } from './errors';

export class CursorQuery {
  /** Opaque cursor returned as `nextCursor` by the previous page. */
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

interface CursorValue {
  createdAt: string;
  id: string;
}

export function decodeCursor(cursor?: string): CursorValue | undefined {
  if (!cursor) return undefined;
  try {
    const v = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (typeof v?.createdAt === 'string' && typeof v?.id === 'string') return v;
  } catch {
    /* fall through */
  }
  throw Errors.badRequest('invalid_cursor', 'Invalid pagination cursor');
}

export function encodeCursor(row: { createdAt: Date; id: string }): string {
  return Buffer.from(JSON.stringify({ createdAt: row.createdAt.toISOString(), id: row.id })).toString('base64url');
}

/**
 * Prisma args for keyset pagination ordered by (createdAt desc, id desc).
 * Use with `findMany({ where: { AND: [where, cursorWhere(...)] }, orderBy: pageOrder, take: limit + 1 })`.
 */
export function cursorWhere(cursor?: string): Record<string, unknown> {
  const c = decodeCursor(cursor);
  if (!c) return {};
  const at = new Date(c.createdAt);
  return { OR: [{ createdAt: { lt: at } }, { createdAt: at, id: { lt: c.id } }] };
}

export const pageOrder = [{ createdAt: 'desc' as const }, { id: 'desc' as const }];

export function pageLimit(q: CursorQuery): number {
  return q.limit ?? 20;
}

export function toPage<T extends { createdAt: Date; id: string }>(rows: T[], limit: number): Page<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? encodeCursor(items[items.length - 1]) : null };
}
