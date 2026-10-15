// @vitest-environment jsdom
import { StrictMode, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '../web/portal/AuthProvider';
const a = { accountId: 'a', profileId: 'pa', username: 'alice', characterName: 'Alice' }; const b = { ...a, accountId: 'b', profileId: 'pb' };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
let root: Root; let host: HTMLDivElement; let auth: ReturnType<typeof useAuth>;
function Probe() { auth = useAuth(); return <span>{auth.status}:{auth.account?.accountId}</span>; }
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
async function render() { await act(async () => root.render(<StrictMode><AuthProvider><Probe /></AuthProvider></StrictMode>)); }
it('initializes with account projection and preserves session on credential/password errors', async () => {
  let response = json(a); vi.stubGlobal('fetch', async () => response.clone()); await render(); expect(auth.status).toBe('authenticated'); expect(auth.account).toEqual(a);
  for (const [code, status] of [['INVALID_CREDENTIALS', 401], ['CURRENT_PASSWORD_INVALID', 400]] as const) { response = json({ error: { code, message: 'Invalid' } }, status); await act(async () => { await expect(auth.refresh()).rejects.toMatchObject({ code }); }); expect(auth.account).toEqual(a); expect(auth.status).toBe('authenticated'); }
  response = json({ error: { code: 'AUTH_REQUIRED', message: 'Login' } }, 401); await act(async () => auth.refresh()); expect(auth.status).toBe('anonymous'); expect(auth.account).toBeNull();
});
it('accept/invalidate/log out cannot be overwritten by delayed refresh or logout', async () => {
  let release!: (response: Response) => void; vi.stubGlobal('fetch', async () => json(a)); await render();
  vi.stubGlobal('fetch', () => new Promise<Response>(resolve => { release = resolve; }));
  let refresh!: Promise<void>; await act(async () => { refresh = auth.refresh(); }); expect(release).toBeTypeOf('function'); await act(async () => auth.accept(b)); await act(async () => { release(json(a)); await refresh; }); expect(auth.account).toEqual(b);
  let logout!: Promise<void>; await act(async () => { logout = auth.logout(); }); await act(async () => auth.accept(b)); await act(async () => { release(json({ ok: true })); await logout; }); expect(auth.account).toEqual(b);
  await act(async () => auth.invalidate()); expect(auth.status).toBe('anonymous');
});
it('successful logout clears auth and uses JSON POST without touching pending storage', async () => {
  sessionStorage.setItem('receipt', 'keep'); const calls: Array<[string, RequestInit]> = []; vi.stubGlobal('fetch', async (path: string, options: RequestInit) => { calls.push([path, options]); return json(path === '/api/auth/me' ? a : { ok: true }); }); await render(); await act(async () => auth.logout()); expect(auth.status).toBe('anonymous'); expect(calls.at(-1)).toEqual(['/api/auth/logout', expect.objectContaining({ method: 'POST', body: '{}' })]); expect(sessionStorage.getItem('receipt')).toBe('keep');
});
it('captures logout identity before local invalidation and ignores a stale rejection after accepting B', async () => {
  let release!: (response: Response) => void; let sentIdentity: string | null = null;
  vi.stubGlobal('fetch', async () => json(a)); await render();
  vi.stubGlobal('fetch', (_path: string, options: RequestInit) => { sentIdentity = new Headers(options.headers).get('X-Idle-Expected-Identity'); return new Promise<Response>(resolve => { release = resolve; }); });
  let logout!: Promise<void>; await act(async () => { logout = auth.logout(); });
  expect(auth.status).toBe('anonymous'); expect(auth.account).toBeNull(); expect(sentIdentity).toBe('["a","pa"]');
  await act(async () => auth.accept(b));
  await act(async () => { release(json({ error: { code: 'AUTH_REQUIRED', message: 'Stale A' } }, 401)); await logout; });
  expect(auth.account).toEqual(b); expect(auth.error).toBeNull();
});
it('shows an initial service failure while auth is unknown, then clears it on retry', async () => {
  let available = false; vi.stubGlobal('fetch', async () => available ? json(a) : json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Unavailable' } }, 503));
  await render(); expect(auth.status).toBe('loading'); expect(auth.error).toMatchObject({ code: 'SERVICE_UNAVAILABLE', uncertain: true });
  available = true; await act(async () => auth.refresh()); expect(auth.status).toBe('authenticated'); expect(auth.error).toBeNull();
});
it('cannot leak a stale failed refresh into the newly accepted account', async () => {
  vi.stubGlobal('fetch', async () => json(a)); await render(); let release!: (response: Response) => void;
  vi.stubGlobal('fetch', () => new Promise<Response>(resolve => { release = resolve; })); let refresh!: Promise<void>;
  await act(async () => { refresh = auth.refresh(); }); await act(async () => auth.accept(b));
  await act(async () => { release(json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'A failure' } }, 503)); await refresh; });
  expect(auth.account).toEqual(b); expect(auth.error).toBeNull();
});
