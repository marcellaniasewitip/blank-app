import { describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiError, buildUrl, type LockFn } from './client';
import { createMemoryTokenStore } from './tokenStore';

const json = (status: number, body: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const pair = (n: number) => ({ accessToken: `access-${n}`, refreshToken: `admin.refresh-${n}`, expiresIn: 900 });

/** Fake backend: protected routes accept only the current access token; refresh rotates and rejects reuse. */
function fakeBackend(start = 1) {
  let current = start;
  const used = new Set<string>();
  const calls = { refresh: 0, protected: 0 };
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    await new Promise((r) => setTimeout(r, 5));
    if (url.endsWith('/auth/refresh')) {
      calls.refresh++;
      const { refreshToken } = JSON.parse(String(init?.body));
      if (used.has(refreshToken) || refreshToken !== `admin.refresh-${current}`) {
        return json(401, { error: { code: 'unauthorized', message: 'Refresh token already used' } });
      }
      used.add(refreshToken);
      current++;
      return json(200, pair(current));
    }
    calls.protected++;
    const auth = (init?.headers as Record<string, string>)?.Authorization;
    if (auth !== `Bearer access-${current}`) return json(401, { error: { code: 'unauthorized', message: 'Token expired' } });
    return json(200, { ok: true, url });
  });
  return { fetchImpl, calls };
}

const noLock: LockFn = (_n, fn) => fn();

describe('buildUrl', () => {
  it('skips empty params and encodes values', () => {
    expect(buildUrl('http://x/api', '/a', { q: 'a b', s: '', n: 0, u: undefined, z: null })).toBe('http://x/api/a?q=a+b&n=0');
    expect(buildUrl('http://x', '/a')).toBe('http://x/a');
  });
});

describe('ApiClient', () => {
  it('sends the bearer token and parses JSON', async () => {
    const be = fakeBackend();
    const store = createMemoryTokenStore(pair(1));
    const api = new ApiClient({ baseUrl: 'http://api', prefix: '/api/v1', store, fetchImpl: be.fetchImpl, lock: noLock });
    await expect(api.get('/admin/overview')).resolves.toMatchObject({ ok: true, url: 'http://api/api/v1/admin/overview' });
    expect(be.calls.refresh).toBe(0);
  });

  it('refreshes once on 401 and retries the request', async () => {
    const be = fakeBackend(1);
    // Access token expired; refresh-1 is still valid.
    const store = createMemoryTokenStore({ ...pair(1), accessToken: 'expired' });
    const api = new ApiClient({ baseUrl: '', store, fetchImpl: be.fetchImpl, lock: noLock });
    await expect(api.get('/x')).resolves.toMatchObject({ ok: true });
    expect(be.calls.refresh).toBe(1);
    expect(be.calls.protected).toBe(2);
    expect(store.get()).toEqual(pair(2));
  });

  it('is single-flight: concurrent 401s trigger exactly one refresh (no refresh-token reuse)', async () => {
    const be = fakeBackend(1);
    const store = createMemoryTokenStore({ ...pair(1), accessToken: 'stale' });
    const onAuthLost = vi.fn();
    const api = new ApiClient({ baseUrl: '', store, fetchImpl: be.fetchImpl, lock: noLock, onAuthLost });
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => api.get(`/r${i}`)));
    expect(results).toHaveLength(8);
    results.forEach((r) => expect(r).toMatchObject({ ok: true }));
    expect(be.calls.refresh).toBe(1);
    expect(onAuthLost).not.toHaveBeenCalled();
    expect(store.get()?.accessToken).toBe('access-2');
  });

  it('a request that 401s after another flight already rotated reuses the new token without refreshing', async () => {
    const be = fakeBackend(1);
    const store = createMemoryTokenStore({ ...pair(1), accessToken: 'stale' });
    const api = new ApiClient({ baseUrl: '', store, fetchImpl: be.fetchImpl, lock: noLock });
    await api.get('/first'); // refreshes → access-2
    expect(be.calls.refresh).toBe(1);
    // A request that was sent with the stale token gets its 401 late:
    await expect(api.refresh('stale')).resolves.toBe('access-2');
    expect(be.calls.refresh).toBe(1);
  });

  it('serialises refreshes across tabs via the lock and re-reads storage', async () => {
    const be = fakeBackend(1);
    // Two clients (tabs) sharing one store, with a real mutex.
    const store = createMemoryTokenStore({ ...pair(1), accessToken: 'stale' });
    let chain = Promise.resolve();
    const mutex: LockFn = (_n, fn) => {
      const run = chain.then(fn);
      chain = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    };
    const tabA = new ApiClient({ baseUrl: '', store, fetchImpl: be.fetchImpl, lock: mutex });
    const tabB = new ApiClient({ baseUrl: '', store, fetchImpl: be.fetchImpl, lock: mutex });
    await Promise.all([tabA.get('/a'), tabB.get('/b'), tabA.get('/c'), tabB.get('/d')]);
    expect(be.calls.refresh).toBe(1);
  });

  it('clears the session and calls onAuthLost when refresh is rejected', async () => {
    const be = fakeBackend(5); // server expects refresh-5; we hold refresh-1
    const store = createMemoryTokenStore({ ...pair(1), accessToken: 'stale' });
    const onAuthLost = vi.fn();
    const api = new ApiClient({ baseUrl: '', store, fetchImpl: be.fetchImpl, lock: noLock, onAuthLost });
    const err = await api.get('/x').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(401);
    expect(onAuthLost).toHaveBeenCalledTimes(1);
    expect(store.get()).toBeNull();
  });

  it('does not refresh anonymous requests', async () => {
    const fetchImpl = vi.fn(async () => json(401, { error: { code: 'invalid_credentials', message: 'Wrong email or password' } }));
    const store = createMemoryTokenStore(pair(1));
    const api = new ApiClient({ baseUrl: '', store, fetchImpl, lock: noLock });
    const err = (await api.request('POST', '/auth/admin/login', { body: {}, anonymous: true }).catch((e) => e)) as ApiError;
    expect(err.message).toBe('Wrong email or password');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const headers = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it('surfaces the backend error envelope', async () => {
    const fetchImpl = vi.fn(async () => json(422, { error: { code: 'documents_not_approved', message: 'Approve these documents first: national_id', details: { missing: ['national_id'] } } }));
    const api = new ApiClient({ baseUrl: '', store: createMemoryTokenStore(pair(1)), fetchImpl, lock: noLock });
    const err = (await api.post('/admin/drivers/1/approve').catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(422);
    expect(err.code).toBe('documents_not_approved');
    expect(err.message).toBe('Approve these documents first: national_id');
    expect(err.details).toEqual({ missing: ['national_id'] });
  });

  it('passes custom headers such as Idempotency-Key and handles 204', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    const api = new ApiClient({ baseUrl: '', store: createMemoryTokenStore(pair(1)), fetchImpl, lock: noLock });
    await expect(api.post('/admin/wallets/w/adjustments', { amountToea: 100, reason: 'x' }, { 'Idempotency-Key': 'k-1' })).resolves.toBeUndefined();
    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toBe('k-1');
    expect(init.body).toBe(JSON.stringify({ amountToea: 100, reason: 'x' }));
  });
});
