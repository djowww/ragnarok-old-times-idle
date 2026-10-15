import type { Pool } from 'mysql2/promise';
import { describe, expect, it } from 'vitest';
import { migrate, resolveLegacyProfileId } from '../server/repository.js';
import { SqlGameProfiles } from '../server/profiles.js';

describe('legacy profile compatibility', () => {
  it('reserves the normalized character name of the selected legacy profile without rewriting its state or receipts', async () => {
    const originalState = { id: 'local-default', name: 'Éowyn Legacy', zeny: 987 };
    const originalUpdatedAt = '2026-01-02 03:04:05.000';
    const profile = { id: 'local-default', state_json: JSON.stringify(originalState), updated_at: originalUpdatedAt, character_name_key: null as string | null };
    const executed: { sql: string; parameters: unknown[] }[] = [];
    const pool = {
      async query(sql: string, parameters: unknown[] = []) {
        if (sql.startsWith('SELECT id FROM idle_profiles WHERE id IN')) return [[{ id: 'local-default' }], []];
        if (sql.includes('SELECT state_json') && sql.includes('idle_profiles')) return [[{ state_json: profile.state_json }], []];
        return [[], []];
      },
      async execute(sql: string, parameters: unknown[] = []) {
        executed.push({ sql, parameters });
        if (sql.includes('UPDATE idle_profiles') && parameters.at(-1) === profile.id && profile.character_name_key === null) {
          profile.character_name_key = String(parameters[0]);
        }
        return [{ affectedRows: 1 }, []];
      },
    } as unknown as Pool;

    await migrate(pool);

    expect(profile.character_name_key).toBe('éowyn legacy');
    expect(profile.state_json).toBe(JSON.stringify(originalState));
    expect(profile.updated_at).toBe(originalUpdatedAt);
    expect(executed).toHaveLength(1);
    expect(executed[0].sql).toContain('character_name_key = ?');
    expect(executed[0].sql).toContain('updated_at = updated_at');
    expect(executed[0].parameters).toEqual(['éowyn legacy', 'local-default']);
  });

  it('continues from local-default when upgrading an existing database', async () => {
    const calls: { sql: string; parameters: unknown[] }[] = [];
    const pool = {
      async query(sql: string, parameters: unknown[] = []) {
        calls.push({ sql, parameters });
        return [[{ id: 'local-default' }], []];
      },
    } as unknown as Pool;

    expect(await resolveLegacyProfileId(pool)).toBe('local-default');
    expect(calls).toHaveLength(1);
  });

  it('uses the current legacy id only for a fresh database', async () => {
    const pool = {
      async query() { return [[], []]; },
    } as unknown as Pool;

    expect(await resolveLegacyProfileId(pool)).toBe('local-djow');
  });

  it('keeps old and current legacy profiles eligible for offline progress', async () => {
    const calls: { sql: string; parameters: unknown[] }[] = [];
    const pool = {
      async query(sql: string, parameters: unknown[] = []) {
        calls.push({ sql, parameters });
        return [[{ id: 'local-default' }], []];
      },
    } as unknown as Pool;

    expect(await new SqlGameProfiles(pool).eligible(null, 50)).toEqual(['local-default']);
    expect(calls[0].sql).toContain('p.id IN (?, ?)');
    expect(calls[0].parameters).toEqual(['local-djow', 'local-default', 50]);
  });
});
