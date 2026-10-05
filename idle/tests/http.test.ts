import { afterEach, expect, it, vi } from 'vitest';
import { ApiFailure, request } from '../web/http';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
it('sends same-origin JSON and preserves precise API errors', async () => {
  const fetcher = vi.fn(async () => new Response(JSON.stringify({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid', fields: { password: 'Invalid' } } }), { status: 401 }));
  vi.stubGlobal('fetch', fetcher);
  await expect(request('/api/auth/login', { method: 'POST', body: { username: 'a' } })).rejects.toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS', fields: { password: 'Invalid' }, uncertain: false });
  expect(fetcher.mock.calls[0]).toEqual(['/api/auth/login', expect.objectContaining({ method: 'POST', credentials: 'same-origin', body: '{"username":"a"}', headers: expect.objectContaining({ 'Content-Type': 'application/json' }) })]);
});
it('retains AUTH_REQUIRED and conflict snapshots without conflating all 401s', async () => {
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: { code: 'AUTH_REQUIRED', message: 'Login' } }), { status: 401 }));
  await expect(request('/api/session', { method: 'POST', body: {} })).rejects.toMatchObject({ code: 'AUTH_REQUIRED', uncertain: false });
  const snapshot = { serverTime: 12 };
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: { code: 'CONFLICT', message: 'Conflict' }, snapshot }), { status: 409 }));
  await expect(request('/api/command')).rejects.toMatchObject({ snapshot, uncertain: false });
});
it('sends expected account/profile only when an identity guard is requested', async()=>{
  const calls:RequestInit[]=[];vi.stubGlobal('fetch',async(_:string,options:RequestInit)=>{calls.push(options);return new Response('{}');});
  await request('/api/session',{method:'POST',body:{},identity:{accountId:'account-a',profileId:'profile-a'}});
  expect(calls[0].headers).toMatchObject({'X-Idle-Expected-Identity':'["account-a","profile-a"]'});
  await request('/api/portal/status');expect(calls[1].headers).not.toHaveProperty('X-Idle-Expected-Identity');
});
it('keeps network/503/invalid JSON uncertain, but caller cancellation is an AbortError', async () => {
  vi.stubGlobal('fetch', async () => { throw new TypeError('network'); });
  await expect(request('/api/command')).rejects.toMatchObject({ uncertain: true });
  vi.stubGlobal('fetch', async () => new Response('{bad', { status: 200 }));
  await expect(request('/api/command')).rejects.toBeInstanceOf(ApiFailure);
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Unavailable' } }), { status: 503 }));
  await expect(request('/api/command')).rejects.toMatchObject({ uncertain: true, status: 503 });
  const controller = new AbortController(); controller.abort();
  await expect(request('/api/session', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
});
it('times out after fifteen seconds and cleans up timers', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', (_: string, options: RequestInit) => new Promise((_, reject) => options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))));
  let settled = false; const pending = request('/api/command').catch(error => { settled = true; return error; });
  await vi.advanceTimersByTimeAsync(14999); const early = settled;
  await vi.advanceTimersByTimeAsync(1); const failure = await pending;
  expect(early).toBe(false); expect(failure).toMatchObject({ uncertain: true }); expect(vi.getTimerCount()).toBe(0);
});
it('rejects URLs outside the same origin before sending', async () => {
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  await expect(request('https://example.invalid/api')).rejects.toMatchObject({ uncertain: false });
  expect(fetcher).not.toHaveBeenCalled();
});
it('cannot accept a late response after timeout even if the transport ignores abort', async () => {
  vi.useFakeTimers(); let release!: (response: Response) => void;
  vi.stubGlobal('fetch', () => new Promise<Response>(resolve => { release = resolve; }));
  const outcome = request('/api/command').catch(error => error);
  await vi.advanceTimersByTimeAsync(15000); release(new Response('{}'));
  expect(await outcome).toMatchObject({ uncertain: true });
});
