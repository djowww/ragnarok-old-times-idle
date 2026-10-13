import type { Pool, RowDataPacket } from 'mysql2/promise';
import { describe, expect, it } from 'vitest';
import { SqlAccountStore } from '../server/identity/repository.js';

describe('SQL account session maintenance', () => {
  it('deletes expired sessions in bounded batches and retains active sessions', async () => {
    const sessions = Array.from({ length: 251 }, (_, index) => ({
      token_hash: `expired-${String(index).padStart(3, '0')}`,
      account_id: 'account-1', credential_version: 1, created_at_ms: index, expires_at_ms: 100,
    }));
    sessions.push({ token_hash: 'active-session', account_id: 'account-1', credential_version: 1, created_at_ms: 101, expires_at_ms: 100_000 });
    const cleanups: { sql: string; cutoff: number; removed: number }[] = [];
    const pool = {
      async execute(sql: string, parameters: unknown[] = []) {
        const cutoff = Number(parameters[0]);
        const limit = Number(sql.match(/LIMIT\s+(\d+)/i)?.[1] ?? 0);
        const expired = sessions.filter(session => session.expires_at_ms <= cutoff)
          .sort((a, b) => a.expires_at_ms - b.expires_at_ms || a.created_at_ms - b.created_at_ms)
          .slice(0, limit);
        const removed = new Set(expired.map(session => session.token_hash));
        for (let index = sessions.length - 1; index >= 0; index--) if (removed.has(sessions[index].token_hash)) sessions.splice(index, 1);
        cleanups.push({ sql, cutoff, removed: expired.length });
        return [{ affectedRows: expired.length }, []];
      },
      async query(_sql: string, parameters: unknown[] = []) {
        const session = sessions.find(item => item.token_hash === parameters[0] && item.expires_at_ms > Number(parameters[1]));
        return [session ? [{ accountId: 'account-1', username: 'hero', profileId: 'profile-1', characterName: 'Hero' }] as RowDataPacket[] : [], []];
      },
    } as unknown as Pool;
    let now = 2_000;
    const store = new SqlAccountStore(pool);

    expect(await store.getSession('expired-000', now)).toBeNull();
    expect(sessions).toHaveLength(2);
    expect(sessions.some(session => session.token_hash === 'active-session')).toBe(true);
    expect((await store.getSession('active-session', now))?.profileId).toBe('profile-1');

    now = 62_000;
    expect(await store.getSession('expired-250', now)).toBeNull();
    expect(sessions).toEqual([expect.objectContaining({ token_hash: 'active-session' })]);
    expect(cleanups.map(cleanup => cleanup.removed)).toEqual([250, 1]);
    expect(cleanups.every(cleanup => cleanup.cutoff === 2_000 || cleanup.cutoff === 62_000)).toBe(true);
  });
});
