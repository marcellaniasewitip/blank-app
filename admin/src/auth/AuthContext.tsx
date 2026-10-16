import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, onAuthLost, tokenStore, type Me, type TokenPair } from '@/api';
import { can, type PermissionRequirement } from './permissions';

interface AuthState {
  isAuthenticated: boolean;
  me: Me | undefined;
  loading: boolean;
  meError: unknown;
  refetchMe: () => void;
  permissions: Set<string>;
  can: (req: PermissionRequirement) => boolean;
  signIn: (pair: TokenPair) => void;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const tokens = useSyncExternalStore(tokenStore.subscribe, () => tokenStore.get()?.accessToken ?? null);
  const isAuthenticated = !!tokens;

  const meQuery = useQuery({ queryKey: ['me'], queryFn: api.auth.me, enabled: isAuthenticated, staleTime: 60_000 });

  const refetchMe = meQuery.refetch;

  useEffect(() => {
    onAuthLost(() => qc.clear());
  }, [qc]);

  useEffect(() => {
    if (!isAuthenticated) qc.removeQueries();
  }, [isAuthenticated, qc]);

  const signIn = useCallback(
    (pair: TokenPair) => {
      qc.clear();
      tokenStore.set(pair);
    },
    [qc],
  );

  const signOut = useCallback(async () => {
    const t = tokenStore.get();
    tokenStore.clear();
    qc.clear();
    if (t) await api.auth.logout(t.refreshToken).catch(() => undefined);
  }, [qc]);

  const value = useMemo<AuthState>(() => {
    const permissions = new Set(meQuery.data?.permissions ?? []);
    return {
      isAuthenticated,
      me: meQuery.data,
      loading: isAuthenticated && meQuery.isPending && !meQuery.isError,
      meError: meQuery.error,
      refetchMe: () => void refetchMe(),
      permissions,
      can: (req) => can(permissions, req),
      signIn,
      signOut,
    };
  }, [isAuthenticated, meQuery.data, meQuery.isPending, meQuery.isError, meQuery.error, refetchMe, signIn, signOut]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}

/** Renders children only when the admin has the permission. */
export function Can({ perm, children, fallback = null }: { perm: PermissionRequirement; children: ReactNode; fallback?: ReactNode }) {
  const { can: has } = useAuth();
  return <>{has(perm) ? children : fallback}</>;
}
