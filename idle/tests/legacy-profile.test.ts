import type { Pool } from 'mysql2/promise';
import { describe, expect, it } from 'vitest';
import { resolveLegacyProfileId } from '../server/repository.js';
import { SqlGameProfiles } from '../server/profiles.js';

describe('legacy profile compatibility', () => {
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
