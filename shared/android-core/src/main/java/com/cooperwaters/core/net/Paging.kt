package com.cooperwaters.core.net

/** Accumulates cursor pages (`{items, nextCursor}`) for history lists. */
class CursorPager<T>(
    private val pageSize: Int = 20,
    private val fetch: suspend (cursor: String?, limit: Int) -> ApiResult<Page<T>>,
) {
    var items: List<T> = emptyList()
        private set
    var nextCursor: String? = null
        private set
    var endReached: Boolean = false
        private set

    /** Reload from the first page. */
    suspend fun refresh(): ApiResult<List<T>> {
        val r = fetch(null, pageSize)
        if (r is ApiResult.Success) {
            items = r.value.items
            nextCursor = r.value.nextCursor
            endReached = r.value.nextCursor == null
        }
        return r.map { items }
    }

    suspend fun loadMore(): ApiResult<List<T>> {
        if (endReached) return ApiResult.Success(items)
        val r = fetch(nextCursor, pageSize)
        if (r is ApiResult.Success) {
            items = items + r.value.items
            nextCursor = r.value.nextCursor
            endReached = r.value.nextCursor == null
        }
        return r.map { items }
    }
}
