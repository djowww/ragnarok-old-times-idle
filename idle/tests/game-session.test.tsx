// @vitest-environment jsdom
import { StrictMode, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useGame } from '../web/game-session';
import { PendingCommands } from '../web/pending-command';
import catalogJSON from '../content/catalog.json';
import { createInitialState, getSnapshot } from '../engine';
import type { AccountView } from '../shared/portal-types';
import type { Catalog, GameSnapshot } from '../shared/types';
const a: AccountView = { accountId: 'account-a', profileId: 'profile-a', username: 'a', characterName: 'A' };
const b = { ...a, accountId: 'account-b', profileId: 'profile-b', characterName: 'B' };
const catalog = catalogJSON as unknown as Catalog;
function snapshot(identity = a, revision = 1, time = 1000, status = 'idle'): GameSnapshot {
  const state = createInitialState(catalog, 1000); state.id = identity.profileId; state.name = identity.characterName; state.revision = revision; state.status = status as typeof state.status;
  return getSnapshot(state, catalog, time);
}
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
let root: Root; let host: HTMLDivElement; let game: ReturnType<typeof useGame>; let auth: ReturnType<typeof vi.fn<() => void>>;
let observations: Array<{ identity: string; name?: string; error: string | null }>;
function Probe({ identity }: { identity: AccountView }) { game = useGame(identity, auth); observations.push({ identity: identity.accountId, name: game.snapshot?.state.name, error: game.error }); return <span>{game.snapshot?.state.name ?? 'empty'}</span>; }
async function render(identity = a, strict = false) { await act(async () => root.render(strict ? <StrictMode><Probe identity={identity} /></StrictMode> : <Probe identity={identity} />)); }
beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); Object.defineProperty(document, 'hidden', { configurable: true, value: false }); sessionStorage.clear(); observations = []; host = document.createElement('div'); document.body.append(host); root = createRoot(host); auth = vi.fn<() => void>(); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
it('exposes all nine fields, adaptive polling and rejects stale revisions/times', async () => {
  let next = snapshot(a, 5, 2000, 'hunting'); let sessions = 0;
  vi.stubGlobal('fetch', async (path: string) => { if (path === '/api/catalog') return json(catalog); sessions++; return json(next); });
  await render(); expect(Object.keys(game).sort()).toEqual(['busy', 'catalog', 'command', 'connected', 'error', 'retry', 'retryable', 'sending', 'snapshot']);
  expect(game.snapshot?.state.revision).toBe(5); expect(sessions).toBe(1);
  next = snapshot(a, 4, 3000, 'hunting'); await act(async () => vi.advanceTimersByTimeAsync(250)); expect(game.snapshot?.state.revision).toBe(5);
  next = snapshot(a, 5, 1000, 'hunting'); await act(async () => vi.advanceTimersByTimeAsync(250)); expect(game.snapshot?.serverTime).toBe(2000);
  next = snapshot(a, 6, 4000); await act(async () => vi.advanceTimersByTimeAsync(250)); const before = sessions;
  await act(async () => vi.advanceTimersByTimeAsync(849)); expect(sessions).toBe(before); await act(async () => vi.advanceTimersByTimeAsync(1)); expect(sessions).toBe(before + 1);
  Object.defineProperty(document, 'hidden', { configurable: true, value: true }); await act(async () => vi.advanceTimersByTimeAsync(850)); expect(sessions).toBe(before + 1);
  Object.defineProperty(document, 'hidden', { configurable: true, value: false }); await act(async () => document.dispatchEvent(new Event('visibilitychange'))); expect(sessions).toBe(before + 2);
  await act(async () => window.dispatchEvent(new Event('online'))); expect(sessions).toBe(before + 3);
});
it('writes before POST, prevents a second purchase and replays the same ID after remount', async () => {
  const receipts: unknown[] = []; let uncertain = true;
  vi.stubGlobal('fetch', async (path: string, options: RequestInit) => {
    if (path === '/api/catalog') return json(catalog);
    if (path === '/api/command') { const body = JSON.parse(options.body as string); expect(new PendingCommands(sessionStorage).read(a)).toEqual(body); receipts.push(body); if (uncertain) throw new TypeError('lost response'); }
    return json(snapshot());
  });
  await render(); await act(async () => { expect(await game.command({ type: 'buy', itemId: 501, quantity: 2 })).toBe(false); });
  const saved = new PendingCommands(sessionStorage).read(a); expect(saved).not.toBeNull(); expect(game.busy).toBe(true); expect(game.sending).toBe(false);
  await act(async () => { expect(await game.command({ type: 'buy', itemId: 501, quantity: 3 })).toBe(false); }); expect(receipts).toHaveLength(1);
  await act(async () => root.unmount()); root = createRoot(host); uncertain = false; await render(); expect(receipts).toEqual([saved, saved]); expect(new PendingCommands(sessionStorage).read(a)).toBeNull(); expect(game.busy).toBe(false);
});
it('preserves pending on AUTH_REQUIRED, aborts private work and resumes original receipt on reentry', async () => {
  const receipt = { requestId: 'purchase-0001', command: { type: 'buy' as const, itemId: 501, quantity: 2 } }; new PendingCommands(sessionStorage).write(a, receipt);
  let expired = true; let calls = 0;
  vi.stubGlobal('fetch', async (path: string, options: RequestInit) => { calls++; if (path === '/api/catalog') return json(catalog); if (expired) return json({ error: { code: 'AUTH_REQUIRED', message: 'Login' } }, 401); if (path === '/api/command') expect(JSON.parse(options.body as string)).toEqual(receipt); return json(snapshot()); });
  await render(); expect(auth).toHaveBeenCalledTimes(1); expect(new PendingCommands(sessionStorage).read(a)).toEqual(receipt); const stopped = calls;
  await act(async () => vi.advanceTimersByTimeAsync(5000)); await act(async () => window.dispatchEvent(new Event('online'))); expect(calls).toBe(stopped); expect(vi.getTimerCount()).toBe(0);
  await act(async () => root.unmount()); root = createRoot(host); expired = false; await render(); expect(new PendingCommands(sessionStorage).read(a)).toBeNull(); expect(game.snapshot?.state.name).toBe('A');
});
it('verifies the cookie-selected profile before replaying a durable receipt', async () => {
  const receipt = { requestId: 'purchase-0001', command: { type: 'buy' as const, itemId: 501, quantity: 2 } };
  new PendingCommands(sessionStorage).write(a, receipt);
  const paths: string[] = [];
  vi.stubGlobal('fetch', async (path: string) => { paths.push(path); return json(path === '/api/catalog' ? catalog : snapshot()); });
  await render();
  expect(paths.indexOf('/api/session')).toBeGreaterThanOrEqual(0);
  expect(paths.indexOf('/api/session')).toBeLessThan(paths.indexOf('/api/command'));
  expect(new PendingCommands(sessionStorage).read(a)).toBeNull();
});
it('halts before replay when the cookie resolves B while the hook still identifies A', async () => {
  const receipt = { requestId: 'purchase-0001', command: { type: 'buy' as const, itemId: 501, quantity: 2 } };
  new PendingCommands(sessionStorage).write(a, receipt);
  const paths: string[] = [];
  vi.stubGlobal('fetch', async (path: string) => { paths.push(path); return json(path === '/api/catalog' ? catalog : snapshot(b)); });
  await render();
  expect(paths.filter(path => path === '/api/command')).toHaveLength(0);
  expect(auth).toHaveBeenCalledTimes(1);
  expect(game.snapshot).toBeNull();
  expect(new PendingCommands(sessionStorage).read(a)).toEqual(receipt);
  const count=paths.length;await act(async()=>vi.advanceTimersByTimeAsync(5000));expect(paths).toHaveLength(count);
});
it('guards the original receipt when the cookie changes between session preflight and replay', async()=>{
  const receipt={requestId:'purchase-0001',command:{type:'buy' as const,itemId:501,quantity:2}};new PendingCommands(sessionStorage).write(a,receipt);
  const calls:Array<{path:string;identity:unknown}>=[];let debitsB=0;
  vi.stubGlobal('fetch',async(path:string,options:RequestInit)=>{
    if(path==='/api/catalog')return json(catalog);
    const expected=new Headers(options.headers).get('X-Idle-Expected-Identity');calls.push({path,identity:expected});
    if(path==='/api/session')return json(snapshot(a));
    // Cookie is now B. The private API guard rejects A's expected identity before execution.
    if(expected==='["account-a","profile-a"]')return json({error:{code:'AUTH_REQUIRED',message:'Identity changed'}},401);
    debitsB++;return json(snapshot(b));
  });
  await render();expect(calls).toEqual([{path:'/api/session',identity:'["account-a","profile-a"]'},{path:'/api/command',identity:'["account-a","profile-a"]'}]);
  expect(debitsB).toBe(0);expect(auth).toHaveBeenCalledTimes(1);expect(new PendingCommands(sessionStorage).read(a)).toEqual(receipt);
});
it('ignores delayed A responses after switching to B and aborts requests in StrictMode/unmount', async () => {
  let resolveA!: (response: Response) => void; let resolveB!: (response: Response) => void; let pendingB: AbortSignal | undefined; const signals: AbortSignal[] = []; let sessions = 0; let holdB = false;
  vi.stubGlobal('fetch', async (path: string, options: RequestInit) => { signals.push(options.signal!); if (path === '/api/catalog') return json(catalog); sessions++; if (sessions === 1) return new Promise<Response>(resolve => { resolveA = resolve; }); if (holdB) { pendingB = options.signal!; return new Promise<Response>(resolve => { resolveB = resolve; }); } return json(snapshot(b)); });
  await render(a, true); await render(b, true); expect(host.textContent).toBe('B'); expect(signals.some(signal => signal.aborted)).toBe(true);
  await act(async () => resolveA(json(snapshot(a, 999, 9999)))); expect(host.textContent).toBe('B'); expect(game.connected).toBe(true);
  holdB = true; await act(async () => vi.advanceTimersByTimeAsync(850)); expect(pendingB?.aborted).toBe(false);
  await act(async () => root.unmount()); root = createRoot(host); expect(pendingB?.aborted).toBe(true);
  await act(async () => resolveB(json(snapshot(b)))); expect(vi.getTimerCount()).toBe(0);
});
it('hides A state during the very first B render, before effect cleanup', async () => {
  let player = a; vi.stubGlobal('fetch', async (path: string) => path === '/api/catalog' ? json(catalog) : json(snapshot(player)));
  await render(a); expect(host.textContent).toBe('A'); player = b; await render(b);
  const bViews = observations.filter(value => value.identity === b.accountId); expect(bViews.length).toBeGreaterThan(0); expect(bViews[0].name).toBeUndefined(); expect(bViews.every(value => value.name !== 'A')).toBe(true);
});
it('preserves an in-flight A purchase across identity changes without changing B', async () => {
  let player = a; let release!: (response: Response) => void; let commandSignal: AbortSignal | undefined;
  vi.stubGlobal('fetch', async (path: string, options: RequestInit) => {
    if (path === '/api/catalog') return json(catalog);
    if (path === '/api/command') { commandSignal = options.signal!; return new Promise<Response>(resolve => { release = resolve; }); } return json(snapshot(player));
  });
  await render(); let result!: Promise<boolean>; await act(async () => { result = game.command({ type: 'buy', itemId: 501, quantity: 2 }); }); expect(game.sending).toBe(true);
  const saved = new PendingCommands(sessionStorage).read(a); player = b; await render(b); expect(commandSignal?.aborted).toBe(true); expect(host.textContent).toBe('B'); expect(game.busy).toBe(false);
  await act(async () => { release(json(snapshot(a, 999, 9999))); expect(await result).toBe(false); }); expect(host.textContent).toBe('B'); expect(new PendingCommands(sessionStorage).read(a)).toEqual(saved); expect(new PendingCommands(sessionStorage).read(b)).toBeNull();
});
it('never sends malformed storage entries or a command when storage write fails', async () => {
  new PendingCommands(sessionStorage).write(a, { requestId: 'purchase-0001', command: { type: 'buy', itemId: 501, quantity: 2 } }); const key = sessionStorage.key(0)!; sessionStorage.setItem(key, '{bad'); let commands = 0;
  vi.stubGlobal('fetch', async (path: string) => { if (path === '/api/catalog') return json(catalog); if (path === '/api/command') commands++; return json(snapshot()); });
  await render(); expect(commands).toBe(0); vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  await act(async () => { expect(await game.command({ type: 'buy', itemId: 501, quantity: 2 })).toBe(false); }); expect(commands).toBe(0); expect(game.error).toBeTruthy();
});
it('clears a conclusive conflict, accepts its snapshot and allows the next command', async () => {
  let conflict = true; vi.stubGlobal('fetch', async (path: string) => path === '/api/catalog' ? json(catalog) : path === '/api/session' ? json(snapshot(a, 1)) : conflict ? json({ error: { code: 'NO_ZENY', message: 'No zeny' }, snapshot: snapshot(a, 7) }, 409) : json(snapshot(a, 8)));
  await render(); await act(async () => { expect(await game.command({ type: 'buy', itemId: 501, quantity: 2 })).toBe(false); }); expect(new PendingCommands(sessionStorage).read(a)).toBeNull(); expect(game.retryable).toBe(false); expect(game.snapshot?.state.revision).toBe(7);
  conflict = false; await act(async () => { expect(await game.command({ type: 'rest' })).toBe(true); });
});
