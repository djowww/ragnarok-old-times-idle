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

it('uses a server-selected character for grants while keeping the caller identity', async () => {
  const betaState = createInitialState(catalog, 1000);
  const target = { profileId: accountB.profileId, username: accountB.username,
    characterName: accountB.characterName, classId: betaState.job, baseLevel: betaState.baseLevel,
    jobLevel: betaState.jobLevel, gender: betaState.gender, status: betaState.status, zeny: betaState.zeny };
  responder = async path => path === '/api/admin/session'
    ? json({ enabled: true, authenticated: true })
    : path.startsWith('/api/admin/characters?')
      ? json({ characters: [target] })
      : json({ ok: true, target: { ...target, baseLevel: target.baseLevel + 1 } });
  await render(accountA);
  const search = host.querySelector<HTMLInputElement>('.admin-target-search input');
  expect(search).not.toBeNull();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(search, 'b');
    search!.dispatchEvent(new Event('input', { bubbles: true }));
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(search, 'be');
    search!.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => host.querySelector<HTMLButtonElement>('.admin-target-search button')!.click());
  await act(async () => host.querySelector<HTMLButtonElement>('.admin-target-results button')!.click());
  await clickBase();
  const action = requests.find(call => call.path === '/api/admin/action')!;
  expect(JSON.parse(action.options.body as string)).toMatchObject({ targetProfileId: accountB.profileId,
    action: { type: 'baseLevels', amount: 1 } });
  expect(new Headers(action.options.headers).get('X-Idle-Expected-Identity'))
    .toBe(JSON.stringify([accountA.accountId, accountA.profileId]));
});

it('ignores an older character search response that arrives after a newer one', async () => {
  const pending = new Map<string, (response: Response) => void>();
  const state = createInitialState(catalog, 1000);
  const character = (name: string) => ({ profileId: `profile-${name}`, username: name,
    characterName: name, classId: state.job, baseLevel: state.baseLevel,
    jobLevel: state.jobLevel, gender: state.gender, status: state.status, zeny: state.zeny });
  responder = async path => path === '/api/admin/session'
    ? json({ enabled: true, authenticated: true })
    : new Promise<Response>(resolve => { pending.set(path, resolve); });
  await render();
  const input = host.querySelector<HTMLInputElement>('.admin-target-search input')!;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  const search = async (query: string) => {
    await act(async () => {
      setter.call(input, query.slice(0, 1)); input.dispatchEvent(new Event('input', { bubbles: true }));
      setter.call(input, query); input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => host.querySelector<HTMLButtonElement>('.admin-target-search button')!.click());
  };
  await search('al');
  await search('be');
  expect(pending.has('/api/admin/characters?query=al')).toBe(true);
  expect(pending.has('/api/admin/characters?query=be')).toBe(true);
  await act(async () => pending.get('/api/admin/characters?query=be')!(json({ characters: [character('beta')] })));
  expect(host.querySelector('.admin-target-results')?.textContent).toContain('beta');
  await act(async () => pending.get('/api/admin/characters?query=al')!(json({ characters: [character('alpha')] })));
  expect(host.querySelector('.admin-target-results')?.textContent).toContain('beta');
  expect(host.querySelector('.admin-target-results')?.textContent).not.toContain('alpha');
});

it('reuses a pending v1 self-grant receipt after an upgrade', async () => {
  const action = { type: 'baseLevels', amount: 1 };
  const legacyId = 'legacy-admin-request-01';
  const storageKey = 'ragidle-admin-pending-action-ids-v1:account-a:profile-a';
  sessionStorage.setItem(storageKey, JSON.stringify({ [JSON.stringify(action)]: legacyId }));
  responder = async path => path === '/api/admin/session'
    ? json({ enabled: true, authenticated: true })
    : Promise.reject(new TypeError('connection lost after sending'));
  await render(); await clickBase();
  const sent = requests.find(call => call.path === '/api/admin/action')!;
  expect(JSON.parse(sent.options.body as string).requestId).toBe(legacyId);
  const pending = JSON.parse(sessionStorage.getItem(storageKey)!);
  expect(pending[JSON.stringify([accountA.profileId, action])]).toBe(legacyId);
  expect(pending[JSON.stringify(action)]).toBeUndefined();
});

it('shows a restricted state without a token form when this account is not an admin', async () => {
  responder = async path => path === '/api/admin/session'
    ? json({ error: { code: 'ADMIN_ACCOUNT_FORBIDDEN', message: 'Esta conta não tem acesso ao painel administrativo.' } }, 403)
    : json({ ok: true });
  await render();
  expect(host.textContent).toContain('Acesso restrito');
  expect(host.textContent).toContain('Esta conta não tem acesso');
  expect(host.querySelector('input[type=password]')).toBeNull();
});

it('keeps the new target selected when an earlier grant finishes later', async () => {
  const state = createInitialState(catalog, 1000);
  const character = (name: string) => ({ profileId: `target-${name}`, username: name,
    characterName: name, classId: state.job, baseLevel: state.baseLevel,
    jobLevel: state.jobLevel, gender: state.gender, status: state.status, zeny: state.zeny });
  const alpha = character('alpha'); const beta = character('beta');
  let finishAlpha!: (response: Response) => void;
  let grants = 0;
  responder = async path => {
    if (path === '/api/admin/session') return json({ enabled: true, authenticated: true });
    if (path === '/api/admin/characters?query=al') return json({ characters: [alpha] });
    if (path === '/api/admin/characters?query=be') return json({ characters: [beta] });
    if (path === '/api/admin/action') {
      grants++;
      return grants === 1 ? new Promise<Response>(resolve => { finishAlpha = resolve; })
        : json({ ok: true, target: beta });
    }
    return json({ ok: true });
  };
  await render();
  const input = host.querySelector<HTMLInputElement>('.admin-target-search input')!;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  const select = async (query: string) => {
    await act(async () => {
      setter.call(input, query.slice(0, 1)); input.dispatchEvent(new Event('input', { bubbles: true }));
      setter.call(input, query); input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => host.querySelector<HTMLButtonElement>('.admin-target-search button')!.click());
    await act(async () => host.querySelector<HTMLButtonElement>('.admin-target-results button')!.click());
  };
  await select('al'); await clickBase();
  await select('be');
  expect(host.querySelector('.admin-target-heading')?.textContent).toContain('beta');
  await act(async () => finishAlpha(json({ ok: true, target: { ...alpha, baseLevel: alpha.baseLevel + 1 } })));
  expect(host.querySelector('.admin-target-heading')?.textContent).toContain('beta');
  await clickBase();
  const actions = requests.filter(call => call.path === '/api/admin/action');
  expect(actions.map(call => JSON.parse(call.options.body as string).targetProfileId))
    .toEqual([alpha.profileId, beta.profileId]);
});
