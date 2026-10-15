import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { StateRepository } from './repository.js';

export interface ChatMessage { id: number; name: string; text: string; at: number; }
export interface ChatIdentity { id: string; name: string; }
export interface ChatRepository {
  /** Recent rows or rows following a cursor, always in chronological order. */
  list(after: number | null, limit: number): Promise<ChatMessage[]>;
  append(profile: ChatIdentity, text: string, at: number): Promise<ChatMessage>;
}
export class MysqlChatRepository implements ChatRepository {
  constructor(private pool: Pool) {}
  async list(after: number | null, limit: number): Promise<ChatMessage[]> {
    const count = Math.max(1, Math.min(51, Math.floor(limit)));
    const [rows] = after === null
      ? await this.pool.query<RowDataPacket[]>('SELECT id, player_name, message_text, created_at_ms FROM idle_chat_messages ORDER BY id DESC LIMIT ?', [count])
      : await this.pool.query<RowDataPacket[]>('SELECT id, player_name, message_text, created_at_ms FROM idle_chat_messages WHERE id > ? ORDER BY id ASC LIMIT ?', [after, count]);
    const messages = rows.map(row => ({ id: Number(row.id), name: String(row.player_name), text: String(row.message_text), at: Number(row.created_at_ms) }));
    return after === null ? messages.reverse() : messages;
  }
  async append(profile: ChatIdentity, text: string, at: number): Promise<ChatMessage> {
    const [result] = await this.pool.execute<ResultSetHeader>('INSERT INTO idle_chat_messages (profile_id, player_name, message_text, created_at_ms) VALUES (?, ?, ?, ?)', [profile.id, profile.name, text, at]);
    return { id: result.insertId, name: profile.name, text, at };
  }
}

const PAGE_SIZE = 50;
const RATE_WINDOW_MS = 10_000;
class ChatInputError extends Error {}
function messageText(body: unknown): string {
  if (!body || typeof body !== 'object' || Array.isArray(body) || typeof (body as { text?: unknown }).text !== 'string')
    throw new ChatInputError('Escreva uma mensagem de até 240 caracteres.');
  const text = (body as { text: string }).text.trim();
  if (!text || text.length > 240 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text))
    throw new ChatInputError('Escreva uma mensagem de 1 a 240 caracteres.');
  return text;
}
function historyCursor(query: unknown): number | null {
  const after = (query as { after?: unknown })?.after;
  if (after === undefined) return null;
  if (typeof after !== 'string' || !/^\d{1,10}$/.test(after) || Number(after) > 4_294_967_295)
    throw new ChatInputError('Histórico de chat inválido.');
  return Number(after);
}
class ChatRateLimit {
  private entries = new Map<string, number[]>();
  private nextCleanupAt = 0;
  take(profileId: string, ip: string, at: number): number {
    if (at >= this.nextCleanupAt) {
      for (const [key, times] of this.entries) if ((times.at(-1) ?? 0) <= at - RATE_WINDOW_MS) this.entries.delete(key);
      this.nextCleanupAt = at + RATE_WINDOW_MS;
    }
    const limits = [{ key: `profile:${profileId}`, max: 5 }, { key: `ip:${ip}`, max: 15 }];
    const windows = limits.map(limit => ({ ...limit, times: (this.entries.get(limit.key) ?? []).filter(time => time > at - RATE_WINDOW_MS) }));
    const retryMs = Math.max(0, ...windows.map(window => window.times.length >= window.max ? window.times[0] + RATE_WINDOW_MS - at : 0));
    if (retryMs) return Math.max(1, Math.ceil(retryMs / 1000));
    for (const window of windows) this.entries.set(window.key, [...window.times, at]);
    return 0;
  }
}
export function registerChatRoutes(app: FastifyInstance, chat: ChatRepository | undefined, resolveProfile: (request: FastifyRequest) => Promise<StateRepository>, now: () => number): void {
  const rateLimit = new ChatRateLimit();
  const unavailable = { error: { code: 'CHAT_UNAVAILABLE', message: 'Chat indisponível. O histórico continua visível; a conexão será tentada novamente.' } };
  app.get('/api/chat', async (request, reply) => {
    await resolveProfile(request);
    try {
      const after = historyCursor(request.query);
      if (!chat) return reply.code(503).send(unavailable);
      const rows = await chat.list(after, PAGE_SIZE + 1);
      const messages = after === null ? rows.slice(-PAGE_SIZE) : rows.slice(0, PAGE_SIZE);
      return { messages, nextCursor: messages.at(-1)?.id ?? after ?? 0, hasMore: after !== null && rows.length > PAGE_SIZE };
    } catch (error) {
      if (error instanceof ChatInputError) return reply.code(400).send({ error: { code: 'INVALID_CHAT', message: error.message } });
      return reply.code(503).send(unavailable);
    }
  });
  app.post('/api/chat', async (request, reply) => {
    const profiles = await resolveProfile(request);
    try {
      const text = messageText(request.body);
      if (!chat) return reply.code(503).send(unavailable);
      const profile = await profiles.read();
      const at = now();
      const retryAfter = rateLimit.take(profile.id, request.ip, at);
      if (retryAfter) return reply.code(429).header('Retry-After', String(retryAfter)).send({ error: { code: 'CHAT_RATE_LIMIT', message: `Aguarde ${retryAfter} s antes de enviar outra mensagem.` } });
      const message = await chat.append({ id: profile.id, name: profile.name }, text, at);
      return reply.code(201).send({ message });
    } catch (error) {
      if (error instanceof ChatInputError) return reply.code(400).send({ error: { code: 'INVALID_CHAT', message: error.message } });
      return reply.code(503).send(unavailable);
    }
  });
}
