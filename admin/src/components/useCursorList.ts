import { useInfiniteQuery, type QueryKey } from '@tanstack/react-query';
import type { Page } from '@/api/types';
import { config } from '@/config';

/** Cursor-paginated list: `{ items, nextCursor }` pages, flattened, with "Load more". */
export function useCursorList<T>(
  key: QueryKey,
  fetchPage: (q: { cursor?: string; limit: number }) => Promise<Page<T>>,
  opts: { enabled?: boolean; refetchInterval?: number | false; limit?: number } = {},
) {
  const limit = opts.limit ?? config.pageSize;
  const q = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => fetchPage({ cursor: pageParam ?? undefined, limit }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: opts.enabled,
    refetchInterval: opts.refetchInterval,
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  return { ...q, items };
}
