import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { AccountView } from '../../shared/portal-types';
import { ApiFailure, request } from '../http';
type AuthState = { status: 'loading' | 'authenticated' | 'anonymous'; account: AccountView | null; error: ApiFailure | null };
type AuthSession = AuthState & { refresh(): Promise<void>; accept(account: AccountView): void; invalidate(): void; logout(): Promise<void> };
const AuthContext = createContext<AuthSession | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading', account: null, error: null });
  const generation = useRef(0); const mounted = useRef(false); const operation = useRef<AbortController | null>(null);
  const begin = useCallback(() => { operation.current?.abort(); operation.current = new AbortController(); return { generation: ++generation.current, abort: operation.current }; }, []);
  const accept = useCallback((account: AccountView) => { begin(); if (mounted.current) setState({ status: 'authenticated', account, error: null }); }, [begin]);
  const invalidate = useCallback(() => { begin(); if (mounted.current) setState({ status: 'anonymous', account: null, error: null }); }, [begin]);
  const refresh = useCallback(async () => {
    const job = begin();
    try {
      const account = await request<AccountView>('/api/auth/me', { signal: job.abort.signal });
      if (mounted.current && generation.current === job.generation) setState({ status: 'authenticated', account, error: null });
    } catch (error) {
      if (!mounted.current || generation.current !== job.generation) return;
      if (error instanceof ApiFailure && error.code === 'AUTH_REQUIRED') invalidate();
      else {
        const failure = error instanceof ApiFailure ? error : new ApiFailure((error as Error).message, { uncertain: true });
        setState(previous => ({ ...previous, error: failure })); throw failure;
      }
    }
  }, [begin, invalidate]);
  const logout = useCallback(async () => {
    const identity = state.account ?? undefined;
    // Invalidate before awaiting the network so old private work unmounts immediately.
    invalidate(); const job = begin();
    try {
      await request('/api/auth/logout', { method: 'POST', body: {}, identity, signal: job.abort.signal });
      if (mounted.current && generation.current === job.generation) setState(previous => ({ ...previous, error: null }));
    } catch (error) {
      if (mounted.current && generation.current === job.generation) {
        const failure = error instanceof ApiFailure ? error : new ApiFailure((error as Error).message, { uncertain: true });
        setState(previous => ({ ...previous, error: failure })); throw failure;
      }
    }
  }, [begin, invalidate, state.account]);
  useEffect(() => {
    mounted.current = true; void refresh().catch(() => { });
    return () => { mounted.current = false; ++generation.current; operation.current?.abort(); };
  }, [refresh]);
  return <AuthContext.Provider value={{ ...state, refresh, accept, invalidate, logout }}>{children}</AuthContext.Provider>;
}
export function useAuth(): AuthSession { const value = useContext(AuthContext); if (!value) throw new Error('useAuth precisa de AuthProvider.'); return value; }
