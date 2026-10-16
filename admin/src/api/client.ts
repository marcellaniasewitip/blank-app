import type { TokenPair } from './types';
import type { TokenStore } from './tokenStore';

/** Backend error envelope `{ error: { code, message, details } }`. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export type Query = Record<string, string | number | boolean | null | undefined>;

export interface RequestOptions {
  query?: Query;
  body?: unknown;
  headers?: Record<string, string>;
  /** Send without the bearer token and never try to refresh (login endpoints). */
  anonymous?: boolean;
  signal?: AbortSignal;
}

/** Cross-tab mutual exclusion. Defaults to the Web Locks API where available. */
export type LockFn = <T>(name: string, fn: () => Promise<T>) => Promise<T>;

export interface ApiClientOptions {
  baseUrl: string;
  prefix?: string;
  store: TokenStore;
  fetchImpl?: typeof fetch;
  lock?: LockFn;
  /** Called once the session cannot be refreshed (refresh token rejected). */
  onAuthLost?: () => void;
}

const defaultLock: LockFn = (name, fn) => {
  const locks = typeof navigator !== 'undefined' ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
  return locks ? (locks.request(name, fn) as ReturnType<typeof fn>) : fn();
};

export function buildUrl(base: string, path: string, query?: Query): string {
  const url = `${base}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

async function toApiError(res: Response): Promise<ApiError> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* not JSON */
  }
  const e = (body as { error?: { code?: string; message?: string | string[]; details?: unknown } } | null)?.error;
  const message = Array.isArray(e?.message) ? e?.message.join('; ') : e?.message;
  return new ApiError(res.status, e?.code ?? `http_${res.status}`, message || res.statusText || `Request failed (${res.status})`, e?.details);
}

export class ApiClient {
  private readonly fetchImpl: typeof fetch;
  private readonly lock: LockFn;
  private readonly root: string;
  private inflightRefresh: Promise<string | null> | null = null;

  constructor(private readonly opts: ApiClientOptions) {
    this.fetchImpl = opts.fetchImpl ?? ((...args) => fetch(...args));
    this.lock = opts.lock ?? defaultLock;
    this.root = `${opts.baseUrl}${opts.prefix ?? ''}`;
  }

  get store(): TokenStore {
    return this.opts.store;
  }

  /**
   * Single-flight refresh. Refresh tokens rotate and reuse is treated as theft (all sessions are
   * revoked), so concurrent 401s in this tab share one refresh, and a cross-tab lock plus a
   * re-read of storage prevents two tabs from spending the same refresh token.
   */
  refresh(staleAccessToken: string | null): Promise<string | null> {
    if (!this.inflightRefresh) {
      this.inflightRefresh = this.doRefresh(staleAccessToken).finally(() => {
        this.inflightRefresh = null;
      });
    }
    return this.inflightRefresh;
  }

  private async doRefresh(staleAccessToken: string | null): Promise<string | null> {
    return this.lock('cw-admin-refresh', async () => {
      const current = this.opts.store.get();
      if (!current) return null;
      // Someone (another tab, or an earlier flight) already rotated the tokens.
      if (staleAccessToken && current.accessToken !== staleAccessToken) return current.accessToken;
      const res = await this.fetchImpl(`${this.root}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: current.refreshToken }),
      });
      if (!res.ok) {
        if (res.status === 400 || res.status === 401 || res.status === 403) {
          this.opts.store.clear();
          this.opts.onAuthLost?.();
          return null;
        }
        throw await toApiError(res);
      }
      const pair = (await res.json()) as TokenPair;
      this.opts.store.set(pair);
      return pair.accessToken;
    });
  }

  /** Low-level: returns the Response (used for CSV/blob downloads). Throws ApiError on non-2xx. */
  async raw(method: string, path: string, options: RequestOptions = {}): Promise<Response> {
    const url = buildUrl(this.root, path, options.query);
    const send = (token: string | null) => {
      const headers: Record<string, string> = { Accept: 'application/json, text/csv;q=0.9, */*;q=0.8', ...options.headers };
      if (options.body !== undefined) headers['Content-Type'] = 'application/json';
      if (token) headers.Authorization = `Bearer ${token}`;
      return this.fetchImpl(url, {
        method,
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: options.signal,
      });
    };
    const token = options.anonymous ? null : (this.opts.store.get()?.accessToken ?? null);
    let res = await send(token);
    if (res.status === 401 && !options.anonymous && token) {
      const fresh = await this.refresh(token);
      if (fresh) res = await send(fresh);
    }
    if (!res.ok) throw await toApiError(res);
    return res;
  }

  async request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    const res = await this.raw(method, path, options);
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  get<T>(path: string, query?: Query, signal?: AbortSignal) {
    return this.request<T>('GET', path, { query, signal });
  }
  post<T>(path: string, body?: unknown, headers?: Record<string, string>) {
    return this.request<T>('POST', path, { body: body ?? {}, headers });
  }
  put<T>(path: string, body?: unknown) {
    return this.request<T>('PUT', path, { body: body ?? {} });
  }
  patch<T>(path: string, body?: unknown) {
    return this.request<T>('PATCH', path, { body: body ?? {} });
  }
  delete<T>(path: string) {
    return this.request<T>('DELETE', path);
  }
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof TypeError) return 'Cannot reach the server. Check your connection and try again.';
  if (err instanceof Error) return err.message;
  return 'Something went wrong';
}
