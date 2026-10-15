// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Admin from '../web/panels/Admin';
import catalogJSON from '../content/catalog.json';
import { createInitialState, getSnapshot } from '../engine';
import type { AccountView } from '../shared/portal-types';
import type { Catalog } from '../shared/types';

const accountA: AccountView = { accountId: 'account-a', profileId: 'profile-a', username: 'a', characterName: 'A' };
const accountB: AccountView = { accountId: 'account-b', profileId: 'profile-b', username: 'b', characterName: 'B' };
const catalog = catalogJSON as unknown as Catalog;
function snapshot(identity: AccountView) {
  const state = createInitialState(catalog, 1000); state.id = identity.profileId; state.name = identity.characterName;
  return getSnapshot(state, catalog, 1000);
}
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
let root: Root; let host: HTMLDivElement;
let requests: Array<{ path: string; options: RequestInit }>;
let responder: (path: string, options: RequestInit) => Promise<Response>;
const authA = vi.fn(); const authB = vi.fn(); const changedA = vi.fn(); const changedB = vi.fn();

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); requests = [];
  responder = async path => path === '/api/admin/session' ? json({ enabled: true, authenticated: true }) : json({ ok: true });
  vi.stubGlobal('fetch', (path: string, options: RequestInit = {}) => { requests.push({ path, options }); return responder(path, options); });
  sessionStorage.clear(); authA.mockReset(); authB.mockReset(); changedA.mockReset(); changedB.mockReset();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function props(identity: AccountView) {
  return { catalog, snapshot: snapshot(identity), busy: false, command: async () => true, identity,
    onAuthRequired: identity === accountA ? authA : authB, onChanged: identity === accountA ? changedA : changedB };
}
async function render(identity = accountA) { await act(async () => root.render(<Admin {...props(identity)} />)); }
async function clickBase() {
  const button = [...host.querySelectorAll<HTMLButtonElement>('.admin-action-card button')][0];
  expect(button).toBeDefined(); await act(async () => button.click());
}

it('sends the current identity on each private admin request', async () => {
  await render(); await clickBase();
  const calls = requests.filter(call => call.path.startsWith('/api/admin/'));
  expect(calls.map(call => new Headers(call.options.headers).get('X-Idle-Expected-Identity')))
    .toEqual(['["account-a","profile-a"]', '["account-a","profile-a"]']);
});

it('keeps uncertain action receipts isolated by account and profile', async () => {
  const actionIds: string[] = [];
  responder = async (path, options) => {
    if (path === '/api/admin/session') return json({ enabled: true, authenticated: true });
    if (path === '/api/admin/action') {
      actionIds.push(JSON.parse(options.body as string).requestId);
      throw new TypeError('connection lost after sending');
    }
    return json({ ok: true });
  };
  await render(accountA); await clickBase();
  await render(accountB); await clickBase();
  await render(accountA); await clickBase();
  expect(actionIds).toHaveLength(3);
  expect(actionIds[0]).not.toBe(actionIds[1]);
  expect(actionIds[2]).toBe(actionIds[0]);
});

it('aborts and ignores an action response from the previous identity', async () => {
  let resolve!: (response: Response) => void;
  responder = async (path) => path === '/api/admin/session'
    ? json({ enabled: true, authenticated: true })
    : new Promise<Response>(done => { resolve = done; });
  await render(accountA); await clickBase();
  const action = requests.find(call => call.path === '/api/admin/action')!;
  await render(accountB);
  expect(action.options.signal?.aborted).toBe(true);
  await act(async () => resolve(json({ ok: true })));
  expect(changedA).not.toHaveBeenCalled(); expect(authA).not.toHaveBeenCalled();
  expect(host.textContent).not.toContain('Níveis Base concedidos');
});

it('does not invalidate authentication when an expired response arrives after unmount', async () => {
  let resolve!: (response: Response) => void;
  responder = async (path) => path === '/api/admin/session'
    ? json({ enabled: true, authenticated: true })
    : new Promise<Response>(done => { resolve = done; });
  await render(accountA); await clickBase();
  const action = requests.find(call => call.path === '/api/admin/action')!;
  await act(async () => root.unmount());
  expect(action.options.signal?.aborted).toBe(true);
  await act(async () => resolve(json({ error: { code: 'AUTH_REQUIRED', message: 'Sessão expirada.' } }, 401)));
  expect(authA).not.toHaveBeenCalled(); expect(changedA).not.toHaveBeenCalled();
});
