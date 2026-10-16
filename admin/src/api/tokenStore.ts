import type { TokenPair } from './types';

export interface TokenStore {
  get(): TokenPair | null;
  set(pair: TokenPair): void;
  clear(): void;
  /** Notified on changes in this tab and other tabs. Returns an unsubscribe function. */
  subscribe(fn: () => void): () => void;
}

const KEY = 'cw.admin.auth';

/** Persists the session in localStorage so tabs share it (and a refresh in one tab is seen by all). */
export function createLocalTokenStore(storage: Storage = window.localStorage): TokenStore {
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (e.key === KEY) emit();
    });
  }
  return {
    get() {
      try {
        const raw = storage.getItem(KEY);
        return raw ? (JSON.parse(raw) as TokenPair) : null;
      } catch {
        return null;
      }
    },
    set(pair) {
      storage.setItem(KEY, JSON.stringify(pair));
      emit();
    },
    clear() {
      storage.removeItem(KEY);
      emit();
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

export function createMemoryTokenStore(initial: TokenPair | null = null): TokenStore {
  let v = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => v,
    set(pair) {
      v = pair;
      listeners.forEach((l) => l());
    },
    clear() {
      v = null;
      listeners.forEach((l) => l());
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
