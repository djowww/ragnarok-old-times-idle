import { createPool, type Pool } from 'mysql2/promise';

// Only opt-in tests may connect; cleanup targets explicitly tracked fixture IDs.
export async function createDbFixture(): Promise<{ pool: Pool; profileIds: string[]; cleanup(): Promise<void> }> {
  if (process.env.IDLE_DB_TEST !== '1') throw new Error('SQL fixture requires IDLE_DB_TEST=1');
  const pool = createPool({ host: process.env.DB_HOST ?? 'database', port: Number(process.env.DB_PORT ?? 3306), user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME, connectionLimit: 6, charset: 'utf8mb4' });
  await pool.query('SELECT 1');
  const profileIds: string[] = [];
  return { pool, profileIds, async cleanup() {
    try {
      for (const id of profileIds) {
        await pool.execute('DELETE s FROM idle_sessions s JOIN idle_accounts a ON a.id = s.account_id WHERE a.profile_id = ?', [id]).catch(ignoreMissingTable);
        await pool.execute('DELETE FROM idle_accounts WHERE profile_id = ?', [id]).catch(ignoreMissingTable);
        await pool.execute('DELETE FROM idle_profiles WHERE id = ?', [id]);
      }
    } finally { await pool.end(); }
  } };
}
function ignoreMissingTable(error: unknown): void { if ((error as { code?: string }).code !== 'ER_NO_SUCH_TABLE') throw error; }
