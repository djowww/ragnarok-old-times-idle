// @vitest-environment jsdom
import { StrictMode, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import PortalApp from '../web/portal/PortalApp';
import ChatJournal from '../web/components/ChatJournal';
import { navigate } from '../web/portal/router';
import catalogJSON from '../content/catalog.json';
import { createInitialState, getSnapshot } from '../engine';
import type { Catalog } from '../shared/types';
const account = { accountId: 'account-ui', profileId: 'profile-ui', username: 'aventureiro', characterName: 'Luna' };
const catalog = catalogJSON as unknown as Catalog;
const state = createInitialState(catalog, 1000); state.id = account.profileId; state.name = account.characterName;
const snapshot = getSnapshot(state, catalog, 1000);
const entry = { slug: 'boas-vindas', title: 'Bem-vindo', category: 'Comunicado', publishedAt: '2026-10-04', summary: 'Seu mundo.', body: ['<script>alert(1)</script>', 'A aventura começa.'] };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
let root: Root; let host: HTMLDivElement; let authenticated: boolean; let requests: Array<{ path: string; options: RequestInit }>;
let override: (path: string, options: RequestInit) => Promise<Response> | undefined;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); authenticated = false; requests = []; override = () => undefined;
  window.history.replaceState(null, '', '/'); host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener() {}, removeEventListener() {} });
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  vi.stubGlobal('fetch', async (path: string, options: RequestInit = {}) => {
    requests.push({ path, options }); const custom = override(path, options); if (custom) return custom;
    if (path === '/api/auth/me') return authenticated ? json(account) : json({ error: { code: 'AUTH_REQUIRED', message: 'Entre novamente.' } }, 401);
    if (path === '/api/catalog') return json(catalog);
    if (path === '/api/session') return json(snapshot);
    if (path === '/api/portal/news') return json([entry]);
    if (path.startsWith('/api/portal/news/')) return json(entry);
    if (path.startsWith('/api/portal/ranking')) return json({ category: 'level', classId: null, page: Number(new URL(path, location.href).searchParams.get('page') ?? 1), pageSize: 20, total: 41, updatedAt: 1000, rows: [{ rank: 1, characterName: 'Luna', classId: 'novice', reborn: false, baseLevel: 1, jobLevel: 1, value: 1 }] });
    if (path === '/api/portal/status') return json({ status: 'ok', accounts: 1, hunting: 0, rates: catalog.rates, checkedAt: 1000 });
    if (path === '/api/chat') return json({ messages: [], nextCursor: 0, hasMore: false });
    if (path.startsWith('/assets/')) return new Response('', { status: 404 });
    throw new Error(`Unexpected ${path}`);
  });
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
async function render(path: string, strict = false) { window.history.replaceState(null, '', path); await act(async () => root.render(strict ? <StrictMode><PortalApp /></StrictMode> : <PortalApp />)); }
async function input(name: string, value: string) { const element = host.querySelector<HTMLInputElement>(`[name="${name}"]`)!; expect(element).not.toBeNull(); await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, value); element.dispatchEvent(new Event('input', { bubbles: true })); }); }
async function submit(index = 0) { await act(async () => host.querySelectorAll('form')[index]?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))); }
async function click(text: string) { const element = [...host.querySelectorAll('a,button')].find(node => node.textContent === text) as HTMLElement; expect(element).toBeDefined(); await act(async () => element.click()); }
async function registration() { await input('username', 'aventureiro'); await input('characterName', 'Luna'); await input('password', 'password-123'); await input('confirmation', 'password-123'); }
it('validates confirmation before registering, exposes server field errors and preserves fields on network loss', async () => {
  await render('/registro'); await registration(); await input('confirmation', 'different'); await submit();
  expect(host.textContent).toContain('As senhas precisam corresponder'); expect(requests.some(r => r.path === '/api/auth/register')).toBe(false);
  await input('confirmation', 'password-123'); override = path => path === '/api/auth/register' ? Promise.resolve(json({ error: { code: 'USERNAME_TAKEN', message: 'Confira os campos.', fields: { username: 'Usuário já cadastrado.' } } }, 409)) : undefined;
  await submit(); expect(host.querySelector('[name="username"]')?.getAttribute('aria-invalid')).toBe('true'); expect(host.textContent).toContain('Usuário já cadastrado.');
  override = path => path === '/api/auth/register' ? Promise.reject(new TypeError('network')) : undefined; await submit(); expect(host.querySelector<HTMLInputElement>('[name="password"]')?.value).toBe('password-123'); expect(host.querySelector('[role="alert"]')).not.toBeNull();
});
it('blocks duplicate registration and enters the account dashboard after success', async () => {
  let resolve!: (response: Response) => void; override = path => path === '/api/auth/register' ? new Promise(done => { resolve = done; }) : undefined;
  await render('/cadastro'); await registration(); await submit(); await submit(); expect(requests.filter(r => r.path === '/api/auth/register')).toHaveLength(1);
  await act(async () => resolve(json(account, 201))); expect(location.pathname).toBe('/painel'); expect(host.textContent).toContain('Luna');
});
it('guards Jogar, sends login fields and returns only to the intended internal route', async () => {
  await render('/'); await click('Jogar'); expect(location.pathname).toBe('/login'); expect(requests.some(r => r.path === '/api/session')).toBe(false);
  override = path => path === '/api/auth/login' ? Promise.resolve(json(account)) : path === '/api/session' ? new Promise(() => {}) : undefined;
  await input('username', 'aventureiro'); await input('password', 'password-123'); await submit(); expect(location.pathname).toBe('/jogar');
  expect(JSON.parse(requests.find(r => r.path === '/api/auth/login')!.options.body as string)).toEqual({ username: 'aventureiro', password: 'password-123' });
});
it('redirects the registration alias to the canonical route', async () => {
  await render('/cadastro'); expect(location.pathname).toBe('/registro'); expect(host.querySelector('[name="characterName"]')).not.toBeNull();
});
it('guards chat GET and POST with the current identity and invalidates on expiry', async () => {
  let expired = false; const auth = vi.fn();
  override = path => path === '/api/chat' && expired ? Promise.resolve(json({ error: { code: 'AUTH_REQUIRED', message: 'Entre novamente.' } }, 401)) : undefined;
  const props = { catalog, snapshot, busy: false, command: async () => true, identity: account, onAuthRequired: auth };
  await act(async () => root.render(<ChatJournal {...props} />));
  expect(new Headers(requests.find(r => r.path === '/api/chat')!.options.headers).get('X-Idle-Expected-Identity')).toBe('["account-ui","profile-ui"]');
  await click('Global'); const element = host.querySelector<HTMLInputElement>('.chat-compose input')!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, 'Olá'); element.dispatchEvent(new Event('input', { bubbles: true })); });
  expired = true; await submit(); expect(auth).toHaveBeenCalledTimes(1);
  expect(new Headers(requests.filter(r => r.path === '/api/chat').at(-1)!.options.headers).get('X-Idle-Expected-Identity')).toBe('["account-ui","profile-ui"]');
});
it('ignores a stale chat expiry after switching identities and aborts old requests', async () => {
  let release!: (response: Response) => void; const auth = vi.fn(); let count = 0;
  override = path => path === '/api/chat' && ++count === 1 ? new Promise(done => { release = done; }) : undefined;
  const props = { catalog, snapshot, busy: false, command: async () => true, identity: account, onAuthRequired: auth };
  await act(async () => root.render(<ChatJournal {...props} />)); const signal = requests[0].options.signal;
  await act(async () => root.render(<ChatJournal {...props} identity={{ ...account, accountId: 'other', profileId: 'other-profile' }} />));
  await act(async () => release(json({ error: { code: 'AUTH_REQUIRED', message: 'Expired A' } }, 401)));
  expect(signal?.aborted).toBe(true); expect(auth).not.toHaveBeenCalled();
});
it('stops chat polling when the read endpoint requires authentication', async () => {
  vi.useFakeTimers(); const auth = vi.fn();
  override = path => path === '/api/chat' ? Promise.resolve(json({ error: { code: 'AUTH_REQUIRED', message: 'Entre novamente.' } }, 401)) : undefined;
  await act(async () => root.render(<ChatJournal catalog={catalog} snapshot={snapshot} busy={false} command={async () => true} identity={account} onAuthRequired={auth} />));
  expect(auth).toHaveBeenCalledTimes(1); const count = requests.length;
  await act(async () => vi.advanceTimersByTimeAsync(10000)); expect(requests).toHaveLength(count);
});
it('preserves chat cursor ordering, rate-limit draft and uncertain-send wording', async () => {
  vi.useFakeTimers(); let sendResult = 'ok';
  override = (path, options) => {
    if (!path.startsWith('/api/chat')) return undefined;
    if (options.method === 'POST') {
      if (sendResult === 'limited') return Promise.resolve(new Response(JSON.stringify({ error: { code: 'RATE_LIMITED', message: 'Aguarde um pouco.' } }), { status: 429, headers: { 'Retry-After': '2' } }));
      if (sendResult === 'uncertain') return Promise.reject(new TypeError('lost'));
      return Promise.resolve(json({ message: { id: 12, name: 'Luna', text: 'Mensagem enviada', at: 1000 } }));
    }
    return Promise.resolve(json({ messages: path.includes('after=10') ? [{ id: 11, name: 'Outro', text: 'Mensagem intermediária', at: 1000 }, { id: 12, name: 'Luna', text: 'Mensagem enviada', at: 1000 }] : [{ id: 10, name: 'Outro', text: 'Olá', at: 1000 }], nextCursor: path.includes('after=10') ? 12 : 10, hasMore: false }));
  };
  await act(async () => root.render(<ChatJournal catalog={catalog} snapshot={snapshot} busy={false} command={async () => true} identity={account} onAuthRequired={() => {}} />));
  await click('Global');
  async function draft(value: string) { await act(async () => { const field = host.querySelector<HTMLInputElement>('.chat-compose input')!; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field, value); field.dispatchEvent(new Event('input', { bubbles: true })); }); }
  await draft('Mensagem enviada'); await submit(); expect(requests.at(-1)?.path).toBe('/api/chat?after=10'); expect(host.textContent).toContain('Mensagem intermediária');
  sendResult = 'limited'; await draft('Ainda aqui'); await submit(); expect(host.querySelector<HTMLInputElement>('.chat-compose input')?.value).toBe('Ainda aqui'); expect(host.querySelector<HTMLButtonElement>('.chat-compose button')?.disabled).toBe(true);
  await act(async () => vi.advanceTimersByTimeAsync(1000)); await act(async () => vi.advanceTimersByTimeAsync(1000)); expect(host.querySelector<HTMLButtonElement>('.chat-compose button')?.disabled).toBe(false);
  sendResult = 'uncertain'; await submit(); expect(host.textContent).toContain('Envio não confirmado'); expect(host.querySelector<HTMLInputElement>('.chat-compose input')?.value).toBe('Ainda aqui');
});
it('contacts exactly once in StrictMode with JSON and identity, and retains panel on bad current password', async () => {
  authenticated = true; await render('/painel', true);
  const calls = requests.filter(r => r.path === '/api/session'); expect(calls).toHaveLength(1); expect(calls[0].options.method).toBe('POST'); expect(calls[0].options.body).toBe('{}'); expect(new Headers(calls[0].options.headers).get('X-Idle-Expected-Identity')).toBe('["account-ui","profile-ui"]');
  override = path => path === '/api/auth/password' ? Promise.resolve(json({ error: { code: 'CURRENT_PASSWORD_INVALID', message: 'A senha atual está incorreta.', fields: { currentPassword: 'A senha atual está incorreta.' } } }, 400)) : undefined;
  await input('currentPassword', 'wrong-password'); await input('newPassword', 'password-456'); await input('confirmation', 'password-456'); await submit();
  expect(new Headers(requests.find(r => r.path === '/api/auth/password')!.options.headers).get('X-Idle-Expected-Identity')).toBe('["account-ui","profile-ui"]');
  expect(location.pathname).toBe('/painel'); expect(host.querySelector('[role="alert"]')?.textContent).toContain('senha atual'); expect(host.querySelector('[name="currentPassword"]')).not.toBeNull();
  await act(async () => navigate('/noticias')); await act(async () => navigate('/painel')); expect(requests.filter(r => r.path === '/api/session')).toHaveLength(2);
});
it.each([200, 401])('ignores a delayed password response (%s) after logout and login to another account', async status => {
  authenticated = true; await render('/painel');
  let release!: (response: Response) => void;
  const other = { accountId: 'other-account', profileId: 'other-profile', username: 'other', characterName: 'Other' };
  const otherState = { ...state, id: other.profileId, name: other.characterName };
  override = path => path === '/api/auth/password' ? new Promise(done => { release = done; }) : path === '/api/auth/logout' ? Promise.resolve(json({ ok: true })) : path === '/api/auth/login' ? Promise.resolve(json(other)) : path === '/api/session' ? Promise.resolve(json(getSnapshot(otherState, catalog, 1000))) : undefined;
  await input('currentPassword', 'password-123'); await input('newPassword', 'password-456'); await input('confirmation', 'password-456'); await submit();
  expect(new Headers(requests.find(r => r.path === '/api/auth/password')!.options.headers).get('X-Idle-Expected-Identity')).toBe('["account-ui","profile-ui"]');
  const passwordSignal = requests.find(r => r.path === '/api/auth/password')!.options.signal;
  await click('Sair'); await click('Entrar na conta'); await input('username', 'other'); await input('password', 'password-123'); await submit();
  expect(passwordSignal?.aborted).toBe(true); expect(location.pathname).toBe('/painel'); expect(host.textContent).toContain('Other');
  await act(async () => release(status === 200 ? json(account) : json({ error: { code: 'AUTH_REQUIRED', message: 'Expired A' } }, 401)));
  expect(location.pathname).toBe('/painel'); expect(host.textContent).toContain('Other'); expect(host.textContent).not.toContain('Senha alterada');
});
it('removes private content on AUTH_REQUIRED and offers retry on an initial auth outage', async () => {
  override = path => path === '/api/auth/me' ? Promise.resolve(json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Serviço indisponível.' } }, 503)) : undefined;
  await render('/painel'); expect(host.querySelector('[name="currentPassword"]')).toBeNull(); expect(host.textContent).toContain('Serviço indisponível.');
  authenticated = true; override = path => path === '/api/session' ? Promise.resolve(json({ error: { code: 'AUTH_REQUIRED', message: 'Entre novamente.' } }, 401)) : undefined;
  await click('Tentar novamente'); expect(location.pathname).toBe('/login'); expect(host.querySelector('[name="currentPassword"]')).toBeNull();
});
it('renders news as text, updates titles and handles direct unknown routes', async () => {
  await render('/noticias/boas-vindas'); expect(document.querySelector('script')).toBeNull(); expect(host.textContent).toContain('<script>alert(1)</script>'); expect(document.title).toContain('Bem-vindo');
  await act(async () => { window.history.pushState(null, '', '/inexistente'); window.dispatchEvent(new PopStateEvent('popstate')); }); expect(host.textContent).toContain('Página não encontrada');
});
it('requests category, class and page changes and resets pagination when filters change', async () => {
  await render('/ranking');
  async function select(name: string, value: string) { await act(async () => { const field = host.querySelector<HTMLSelectElement>(`[name="${name}"]`)!; expect(field).not.toBeNull(); field.value = value; field.dispatchEvent(new Event('change', { bubbles: true })); }); }
  await select('category', 'zeny'); await select('class', 'novice'); await click('Próxima'); expect(requests.at(-1)?.path).toContain('category=zeny&class=novice&page=2');
  await select('category', 'kills'); expect(requests.at(-1)?.path).toContain('category=kills&class=novice&page=1'); expect(host.textContent).toContain('Luna');
});
