import { expect, it, vi } from 'vitest';
import type { Pool } from 'mysql2/promise';
import catalogJSON from '../content/catalog.json';
import { createInitialState } from '../engine';
import { GameRepository, type AdminAuditRecord } from '../server/repository';
import type { Catalog } from '../shared/types';

const catalog = catalogJSON as unknown as Catalog;
const audit: AdminAuditRecord = {
  actorAccountId: 'account-a', actorProfileId: 'profile-a',
  targetAccountId: 'account-b', targetProfileId: 'profile-b',
  actionType: 'zeny', actionJson: JSON.stringify({ type: 'zeny', amount: 500 }), at: 1000,
};

function fixture(failAudit = false) {
  const state = createInitialState(catalog, 1000); state.id = 'profile-b';
  const operations: string[] = [];
  const execute = vi.fn(async (sql: string, _params?: unknown[]) => {
    if (sql.startsWith('UPDATE idle_profiles')) operations.push('state');
    else if (sql.startsWith('INSERT INTO idle_commands')) operations.push('receipt');
    else if (sql.includes('INSERT INTO idle_admin_audit')) {
      operations.push('audit');
      if (failAudit) throw new Error('audit insert failed');
    }
    return [];
  });
  const connection = {
    beginTransaction: vi.fn(async () => { operations.push('begin'); }),
    query: vi.fn(async (sql: string) => sql.includes('idle_commands')
      ? [[]] : [[{ state_json: JSON.stringify(state) }]]),
    execute,
    commit: vi.fn(async () => { operations.push('commit'); }),
    rollback: vi.fn(async () => { operations.push('rollback'); }),
    release: vi.fn(),
  };
  const pool = {
    query: vi.fn(async () => [[{ id: state.id }]]),
    getConnection: vi.fn(async () => connection),
  } as unknown as Pool;
  return { repository: new GameRepository(pool, () => structuredClone(state), state.id),
    execute, connection, operations };
}

it('writes the grant, receipt and actor/target audit before one commit', async () => {
  const { repository, execute, operations } = fixture();
  await repository.transact('admin-grant-01', state => { state.zeny += 500; return state; },
    'admin-fingerprint', audit);
  expect(operations).toEqual(['begin', 'state', 'receipt', 'audit', 'commit']);
  const auditCall = execute.mock.calls.find(([sql]) => sql.includes('INSERT INTO idle_admin_audit'));
  expect(auditCall?.[1]).toEqual(['profile-b', 'admin-grant-01', 'account-a', 'profile-a',
    'account-b', 'zeny', audit.actionJson, 1000]);
});

it('rolls back the grant and receipt if the audit insert fails', async () => {
  const { repository, connection, operations } = fixture(true);
  await expect(repository.transact('admin-grant-02', state => { state.zeny += 500; return state; },
    'admin-fingerprint', audit)).rejects.toThrow('audit insert failed');
  expect(operations).toEqual(['begin', 'state', 'receipt', 'audit', 'rollback']);
  expect(connection.commit).not.toHaveBeenCalled();
});
