import { useCallback, useEffect, useRef, useState } from 'react';
import type { AccountView } from '../shared/portal-types';
import type { Catalog, CommandRequest, GameCommand, GameSnapshot } from '../shared/types';
import { ApiFailure, request } from './http';
import { PendingCommands } from './pending-command';

type View = { key: string; catalog: Catalog | null; snapshot: GameSnapshot | null; sending: boolean; error: string | null; connected: boolean; retryable: boolean };
type Session = { dispose(): void; command(value: GameCommand): Promise<boolean>; retry(): Promise<boolean | void> };
const empty = (key: string): View => ({ key, catalog: null, snapshot: null, sending: false, error: null, connected: false, retryable: false });
const storageMessage = 'Não foi possível guardar o recibo nesta aba. Libere o armazenamento e tente novamente.';

export function useGame(identity: AccountView, onAuthRequired: () => void) {
  const key = JSON.stringify([identity.accountId, identity.profileId]);
  const renderedKey = useRef(key); renderedKey.current = key;
  const authRequired = useRef(onAuthRequired); authRequired.current = onAuthRequired;
  const runtime = useRef<Session | null>(null);
  const [view, setView] = useState<View>(() => empty(key));

  useEffect(() => {
    // All mutable work belongs to this effect generation, including StrictMode remounts.
    const abort = new AbortController(); let disposed = false; let stopped = false; let timer: ReturnType<typeof setTimeout> | undefined;
    let active: Promise<void> | null = null; let queued = false; let starting = true;
    let catalog: Catalog | null = null; let lastSnapshot: GameSnapshot | null = null;
    let receipt: CommandRequest | null = null; let pending: PendingCommands | null = null; let storageBlocked = false;
    let identityVerified = false; let needsRecovery = false;
    let errorSource: 'connection' | 'command' | null = null;
    const current = () => !disposed && !stopped && renderedKey.current === key && runtime.current === session;
    const publish = (patch: Partial<View>) => { if (current()) setView(previous => ({ ...previous, ...patch, key })); };
    const accept = (value: GameSnapshot) => {
      if (!current() || value.state.id !== identity.profileId) return;
      if (lastSnapshot && (value.state.revision < lastSnapshot.state.revision || (value.state.revision === lastSnapshot.state.revision && value.serverTime < lastSnapshot.serverTime))) return;
      lastSnapshot = value; publish({ snapshot: value });
    };
    const expire = (failure: unknown): boolean => {
      if (!(failure instanceof ApiFailure) || failure.code !== 'AUTH_REQUIRED') return false;
      if (current()) {
        publish({ connected: false, sending: false, error: failure.message }); stopped = true; clearTimeout(timer); abort.abort(); authRequired.current();
      }
      return true;
    };
    const verifyIdentity = (value: GameSnapshot): boolean => {
      if (value.state.id === identity.profileId) { identityVerified = true; return true; }
      expire(new ApiFailure('A sessão desta aba mudou. Entre novamente para continuar.', {code:'AUTH_REQUIRED', uncertain:false}));
      return false;
    };
    const loadPending = () => {
      try { pending = new PendingCommands(window.sessionStorage); receipt = pending.read(identity); needsRecovery = !!receipt; storageBlocked = false; publish({ retryable: !!receipt }); }
      catch { storageBlocked = true; publish({ error: storageMessage }); }
    };
    const refresh = async () => {
      if (!current() || active || queued) return;
      const work = (async () => {
        try {
          if (!catalog) {
            const value = await request<Catalog>('/api/catalog', { signal: abort.signal });
            if (!current()) return; catalog = value; publish({ catalog: value });
          }
          if (!current()) return;
          const value = await request<GameSnapshot>('/api/session', { method: 'POST', body: {}, signal: abort.signal, identity });
          if (!current() || !verifyIdentity(value)) return; accept(value); publish({ connected: true });
          if (!receipt && errorSource === 'connection') { publish({ error: null }); errorSource = null; }
        } catch (error) {
          if (!current() || expire(error)) return;
          errorSource = 'connection'; publish({ connected: false, error: (error as Error).message });
        }
      })();
      active = work; await work; if (active === work) active = null;
    };
    const submit = async (value: CommandRequest): Promise<boolean> => {
      if (!current() || !identityVerified || queued || storageBlocked || !pending) return false;
      // Persist the exact body before waiting for or initiating any private POST.
      try { pending.write(identity, value); receipt = value; }
      catch { publish({ error: storageMessage }); return false; }
      queued = true; publish({ sending: true, error: null }); errorSource = null;
      if (active) await active;
      if (!current()) { queued = false; return false; }
      try {
        const snapshot = await request<GameSnapshot>('/api/command', { method: 'POST', body: value, signal: abort.signal, identity });
        if (!current() || !verifyIdentity(snapshot)) return false; accept(snapshot);
        pending.clear(identity, value.requestId); receipt = null; publish({ retryable: false, connected: true }); return true;
      } catch (error) {
        if (!current() || expire(error)) return false;
        const failure = error instanceof ApiFailure ? error : new ApiFailure(storageMessage, { uncertain: true });
        if (failure.snapshot) accept(failure.snapshot);
        let uncertain = failure.uncertain;
        if (!uncertain) {
          try { pending.clear(identity, value.requestId); receipt = null; }
          catch { uncertain = true; }
        }
        errorSource = 'command'; publish({ error: failure.message, retryable: uncertain, connected: !uncertain }); return false;
      } finally { queued = false; publish({ sending: false }); }
    };
    const focus = () => { if (!document.hidden && !starting) void refresh(); };
    const poll = async () => {
      if (!current()) return;
      if (!document.hidden) await refresh();
      if (current() && identityVerified && needsRecovery && receipt) {
        needsRecovery = false;
        await submit(receipt);
      }
      starting = false;
      if (current()) {
        const status = lastSnapshot?.state.status;
        timer = setTimeout(poll, !document.hidden && (status === 'hunting' || status === 'challenge') ? 250 : 850);
      }
    };
    const session: Session = {
      command: async (value) => {
        if (!current() || !identityVerified || starting || receipt || storageBlocked) return false;
        return submit({ requestId: crypto.randomUUID(), command: value });
      },
      retry: async () => {
        if (!current() || starting) return;
        if (storageBlocked) loadPending();
        if (storageBlocked) return;
        if (!identityVerified) await refresh();
        if (!current() || !identityVerified) return;
        if (receipt) { needsRecovery = false; return submit(receipt); }
        errorSource = 'connection'; return refresh();
      },
      dispose: () => {
        disposed = true; abort.abort(); clearTimeout(timer);
        document.removeEventListener('visibilitychange', focus); window.removeEventListener('online', focus);
      },
    };
    runtime.current = session; setView(empty(key)); loadPending();
    document.addEventListener('visibilitychange', focus); window.addEventListener('online', focus);
    // Session identity must be verified before recovery can issue a private mutation.
    void poll();
    return () => { session.dispose(); if (runtime.current === session) runtime.current = null; };
  }, [key, identity.accountId, identity.profileId]);
  const command = useCallback((value: GameCommand) => runtime.current?.command(value) ?? Promise.resolve(false), []);
  const retry = useCallback(() => runtime.current?.retry() ?? Promise.resolve(), []);
  const state = view.key === key ? view : empty(key);
  return { catalog: state.catalog, snapshot: state.snapshot, busy: state.sending || state.retryable, sending: state.sending, error: state.error, connected: state.connected, retryable: state.retryable, command, retry };
}
