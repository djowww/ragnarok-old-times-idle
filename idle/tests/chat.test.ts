import { afterEach, describe, expect, it } from 'vitest';
import catalogJSON from '../content/catalog.json';
import type { Catalog } from '../shared/types.js';
import { buildApp } from '../server/app.js';
import { createAuthService } from '../server/identity/service.js';
import { MysqlChatRepository } from '../server/chat.js';
import { MemoryAccountStore } from './portal-fixture.js';
import type { Pool } from 'mysql2/promise';

const catalog = catalogJSON as unknown as Catalog;
type Message = { id: number; name: string; text: string; at: number };
class MemoryChat {
  messages: Message[] = [];
  identities: Array<{ id: string; name: string }> = [];
  async list(after: number | null, limit: number) {
    const rows = after === null ? this.messages.slice(-limit) : this.messages.filter(message => message.id > after).slice(0, limit);
    return structuredClone(rows);
  }
  async append(profile: { id: string; name: string }, text: string, at: number) {
    this.identities.push(structuredClone(profile));
    const message = { id: (this.messages.at(-1)?.id ?? 0) + 1, name: profile.name, text, at };
    this.messages.push(message);
    return structuredClone(message);
  }
}
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => { for (const app of apps.splice(0)) await app.close(); });
async function setup(chatRepository: MemoryChat | undefined = new MemoryChat(), configured = true) {
  let at = 1000;
  const accounts = new MemoryAccountStore();
  const app = await buildApp({ catalog, accounts, profiles: accounts.profiles, chatRepository: configured ? chatRepository : undefined, now: () => at });
  const registered = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: 'chat_user', characterName: 'Djow do servidor', gender: 'male', password: 'valid-password', confirmation: 'valid-password' } });
  expect(registered.statusCode).toBe(201);
  const token = registered.cookies[0].value;
  const repository = accounts.profiles.forProfile(registered.json().profileId);
  apps.push(app);
  return { app, token, accounts, chat: chatRepository, repository, advance: (ms: number) => { at += ms; } };
}
describe('local global chat', () => {
  it('uses the shared expected-identity guard before history or message publication', async()=>{
    const {app,token,chat}=await setup();const a=(await app.inject({url:'/api/auth/me',cookies:{idle_session:token}})).json();
    const registration=await app.inject({method:'POST',url:'/api/auth/register',payload:{username:'guard_chat',characterName:'Guard Chat',gender:'female',password:'valid-password',confirmation:'valid-password'}});
    expect(registration.statusCode).toBe(201);const bToken=registration.cookies[0].value;const headers={'x-idle-expected-identity':JSON.stringify([a.accountId,a.profileId])};
    for(const method of ['GET','POST'] as const){const response=await app.inject({method,url:'/api/chat',cookies:{idle_session:bToken},headers,...(method==='POST'?{payload:{text:'wrong account'}}:{})});expect(response.statusCode).toBe(401);expect(response.json().error.code).toBe('AUTH_REQUIRED');}
    expect(chat.messages).toEqual([]);expect(chat.identities).toEqual([]);
    const accepted=await app.inject({method:'POST',url:'/api/chat',cookies:{idle_session:token},headers,payload:{text:'correct account',name:'Fake',profileId:'foreign'}});
    expect(accepted.statusCode).toBe(201);expect(chat.identities).toEqual([{id:a.profileId,name:a.characterName}]);
  });
  it('rejects anonymous chat and authors messages from two resolved accounts', async () => {
    const { app, token, chat } = await setup();
    expect((await app.inject('/api/chat')).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/api/chat', payload: { text: 'anonymous' } })).statusCode).toBe(401);
    const b = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: 'second_user', characterName: 'Segundo autor', gender: 'female', password: 'valid-password', confirmation: 'valid-password' } });
    expect(b.statusCode).toBe(201);
    for (const session of [token, b.cookies[0].value]) expect((await app.inject({ method: 'POST', url: '/api/chat', cookies: { idle_session: session }, payload: { text: 'Olá', profileId: 'forged', name: 'Admin' } })).statusCode).toBe(201);
    expect(chat.messages.map(message => message.name)).toEqual(['Djow do servidor', 'Segundo autor']);
    expect(chat.identities[0].id).not.toBe(chat.identities[1].id);
  });
  it('trims text and uses the server profile identity instead of submitted names', async () => {
    const { app, token, chat, repository } = await setup();
    const response = await app.inject({ cookies: { idle_session: token }, method: 'POST', url: '/api/chat', payload: { text: '  Olá, Prontera!  ', name: 'Administrador', profileId: 'forged-profile' } });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ message: { id: 1, name: 'Djow do servidor', text: 'Olá, Prontera!', at: 1000 } });
    expect(chat.identities).toEqual([{ id: (await repository.read()).id, name: 'Djow do servidor' }]);
    expect((await repository.read()).revision).toBe(0);
  });
  it.each([{ payload: null }, { payload: [] }, { payload: {} }, { payload: { text: 42 } }, { payload: { text: '  \n  ' } }, { payload: { text: 'x'.repeat(241) } }, { payload: { text: 'a\u0000b' } }])('rejects malformed or excessive message text: %j', async ({ payload }) => {
    const { app, token, chat } = await setup();
    const response = await app.inject({ cookies: { idle_session: token }, method: 'POST', url: '/api/chat', headers: { 'Content-Type': 'application/json' }, payload: JSON.stringify(payload) });
    expect(response.statusCode).toBe(400);
    expect(chat.messages).toEqual([]);
  });
  it('accepts the text boundary and returns markup as plain message text', async () => {
    const { app, token } = await setup();
    const boundary = await app.inject({ cookies: { idle_session: token }, method: 'POST', url: '/api/chat', payload: { text: 'x'.repeat(240) } });
    expect(boundary.statusCode).toBe(201);
    const markup = await app.inject({ cookies: { idle_session: token }, method: 'POST', url: '/api/chat', payload: { text: '<img src=x onerror=alert(1)>' } });
    expect(markup.statusCode).toBe(201);
    expect(markup.json().message.text).toBe('<img src=x onerror=alert(1)>');
  });
  it('serves the latest 50 messages in order then pages every unseen message without skipping', async () => {
    const chat = new MemoryChat();
    chat.messages = Array.from({ length: 105 }, (_, index) => ({ id: index + 1, name: 'Teste', text: `Mensagem ${index + 1}`, at: 1000 }));
    const { app, token } = await setup(chat);
    const recent = (await app.inject({ url: '/api/chat', cookies: { idle_session: token } })).json();
    expect(recent.messages).toHaveLength(50);
    expect(recent.messages[0].id).toBe(56);
    expect(recent.messages.at(-1).id).toBe(105);
    expect(recent.nextCursor).toBe(105);
    const first = (await app.inject({ url: '/api/chat?after=0&limit=99999', cookies: { idle_session: token } })).json();
    expect(first.messages).toHaveLength(50);
    expect(first.messages[0].id).toBe(1);
    expect(first.nextCursor).toBe(50);
    expect(first.hasMore).toBe(true);
    const second = (await app.inject({ url: '/api/chat?after=50', cookies: { idle_session: token } })).json();
    expect(second.messages[0].id).toBe(51);
    expect(second.nextCursor).toBe(100);
    expect(second.hasMore).toBe(true);
    const last = (await app.inject({ url: '/api/chat?after=100', cookies: { idle_session: token } })).json();
    expect(last.messages.map((message: Message) => message.id)).toEqual([101, 102, 103, 104, 105]);
    expect(last.hasMore).toBe(false);
    const empty = (await app.inject({ url: '/api/chat?after=105', cookies: { idle_session: token } })).json();
    expect(empty).toEqual({ messages: [], nextCursor: 105, hasMore: false });
  });
  it.each(['-1', '1.5', 'abc', '4294967296', '1e3', ''])('rejects an invalid history cursor %j', async cursor => {
    const { app, token } = await setup();
    expect((await app.inject({ url: `/api/chat?after=${cursor}`, cookies: { idle_session: token } })).statusCode).toBe(400);
  });
  it('limits the same profile across browser addresses and allows a later message', async () => {
    const { app, token, chat, advance } = await setup();
    for (let index = 0; index < 5; index++) {
      expect((await app.inject({ cookies: { idle_session: token }, method: 'POST', url: '/api/chat', remoteAddress: `127.0.0.${index + 1}`, payload: { text: 'Teste' } })).statusCode).toBe(201);
    }
    const denied = await app.inject({ cookies: { idle_session: token }, method: 'POST', url: '/api/chat', remoteAddress: '127.0.0.9', payload: { text: 'Excesso' } });
    expect(denied.statusCode).toBe(429);
    expect(denied.headers['retry-after']).toBe('10');
    expect(chat.messages).toHaveLength(5);
    advance(10_000);
    expect((await app.inject({ cookies: { idle_session: token }, method: 'POST', url: '/api/chat', payload: { text: 'Após a pausa' } })).statusCode).toBe(201);
  });
  it('also limits one address when its authenticated profiles differ', async () => {
    const { app, accounts, chat } = await setup();
    for (let index = 0; index < 16; index++) {
      // Real sessions from separate identities; seeding avoids HTTP registration IP limits.
      const auth = createAuthService({ accounts, catalog, now: () => 1000, secureCookie: false, passwords: { async hash() { return 'test-hash'; }, async verify() { return true; } } });
      const identity = await auth.register({ username: `chat_${index}`, characterName: `Personagem ${index}`, gender: 'male', password: 'valid-password', confirmation: 'valid-password' });
      const result = await app.inject({ method: 'POST', url: '/api/chat', cookies: { idle_session: identity.token }, payload: { text: 'Teste' } });
      expect(result.statusCode).toBe(index < 15 ? 201 : 429);
    }
    expect(chat.messages).toHaveLength(15);
  });
  it('rejects a foreign origin without publishing a message', async () => {
    const { app, token, chat } = await setup();
    expect((await app.inject({ cookies: { idle_session: token }, method: 'POST', url: '/api/chat', headers: { origin: 'https://example.invalid' }, payload: { text: 'Teste' } })).statusCode).toBe(403);
    expect(chat.messages).toEqual([]);
  });
  it('returns a recoverable availability error when persistence is unavailable', async () => {
    const { app, token, chat } = await setup();
    chat.list = async () => { throw new Error('Database unavailable'); };
    chat.append = async () => { throw new Error('Database unavailable'); };
    expect((await app.inject({ url: '/api/chat', cookies: { idle_session: token } })).statusCode).toBe(503);
    expect((await app.inject({ cookies: { idle_session: token }, method: 'POST', url: '/api/chat', payload: { text: 'Teste' } })).statusCode).toBe(503);
    expect(chat.messages).toEqual([]);
  });
  it('reports unavailable chat when the server has no configured persistence', async () => {
    const { app, token } = await setup(undefined, false);
    const response = await app.inject({ url: '/api/chat', cookies: { idle_session: token } });
    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe('CHAT_UNAVAILABLE');
  });
});

describe('chat SQL boundary without a live database', () => {
  it('reads recent database rows in chronological order and caps SQL work', async () => {
    let parameters: unknown[] | undefined;
    const pool = {
      async query(sql: string, values: unknown[]) {
        if (!sql.includes('ORDER BY id DESC') || sql.includes('WHERE')) throw new Error('Unexpected recent query');
        parameters = values;
        return [[
          { id: 9, player_name: 'Ana', message_text: 'Última', created_at_ms: '3000' },
          { id: 7, player_name: 'Djow', message_text: 'Primeira', created_at_ms: '1000' },
        ], []];
      },
    } as unknown as Pool;
    expect(await new MysqlChatRepository(pool).list(null, 99999)).toEqual([
      { id: 7, name: 'Djow', text: 'Primeira', at: 1000 },
      { id: 9, name: 'Ana', text: 'Última', at: 3000 },
    ]);
    expect(parameters).toEqual([51]);
  });
  it('passes the cursor and row bound as parameters for incremental reads', async () => {
    let parameters: unknown[] | undefined;
    const pool = {
      async query(sql: string, values: unknown[]) {
        if (!sql.includes('WHERE id > ? ORDER BY id ASC LIMIT ?')) throw new Error('Unexpected incremental query');
        parameters = values;
        return [[{ id: 10, player_name: 'Ana', message_text: 'Seguinte', created_at_ms: 4000 }], []];
      },
    } as unknown as Pool;
    expect(await new MysqlChatRepository(pool).list(9, 51)).toEqual([{ id: 10, name: 'Ana', text: 'Seguinte', at: 4000 }]);
    expect(parameters).toEqual([9, 51]);
  });
  it('stores identities and literal text through prepared values without interpolating messages', async () => {
    let parameters: unknown[] | undefined;
    const pool = {
      async execute(sql: string, values: unknown[]) {
        if (!sql.startsWith('INSERT INTO idle_chat_messages') || !sql.endsWith('VALUES (?, ?, ?, ?)') || sql.includes('DROP')) throw new Error('Unexpected insert');
        parameters = values;
        return [{ insertId: 11, affectedRows: 1 }, []];
      },
    } as unknown as Pool;
    const text = "'); DROP TABLE idle_profiles; --";
    expect(await new MysqlChatRepository(pool).append({ id: 'local-djow', name: 'Djow' }, text, 5000)).toEqual({ id: 11, name: 'Djow', text, at: 5000 });
    expect(parameters).toEqual(['local-djow', 'Djow', text, 5000]);
  });
});
