import { readFile } from 'node:fs/promises';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import type { GameState } from '../shared/types.js';
export interface StateRepository {
  transact(requestId: string | null, action: (state: GameState) => GameState, fingerprint?: string): Promise<GameState>;
  read(): Promise<GameState>;
  health(): Promise<boolean>;
}
export async function migrate(pool: Pool): Promise<void> {
  const schema = await readFile(new URL('./schema.sql', import.meta.url), 'utf8')
    .catch(() => readFile(new URL('../../server/schema.sql', import.meta.url), 'utf8'));
  for (const statement of schema.split(';').map(s => s.trim()).filter(Boolean)) await pool.query(statement);
}
function decode(value: unknown): GameState {
  const state = (typeof value === 'string' ? JSON.parse(value) : value) as GameState;
  if (state.schemaVersion !== 1) throw new Error('Unsupported idle state schema');
  return structuredClone(state);
}
export class GameRepository implements StateRepository {
  constructor(private pool: Pool, private createState: () => GameState, readonly profileId = 'local-default') {}
  private async initialize(): Promise<void> {
    const [rows] = await this.pool.query<RowDataPacket[]>('SELECT id FROM idle_profiles WHERE id = ?', [this.profileId]);
    if (rows.length) return;
    const initial = this.createState(); initial.id = this.profileId;
    // Autocommit insertion avoids competing gap locks on first contact.
    await this.pool.execute('INSERT IGNORE INTO idle_profiles (id, state_json) VALUES (?, ?)', [this.profileId, JSON.stringify(initial)]);
  }
  async transact(requestId: string | null, action: (state: GameState) => GameState, fingerprint = ''): Promise<GameState> {
    await this.initialize();
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query<RowDataPacket[]>('SELECT state_json FROM idle_profiles WHERE id = ? FOR UPDATE', [this.profileId]);
      const previous = decode(rows[0].state_json);
      if (requestId) {
        const [receipts] = await connection.query<RowDataPacket[]>('SELECT fingerprint FROM idle_commands WHERE profile_id = ? AND request_id = ?', [this.profileId, requestId]);
        if (receipts.length) {
          if (receipts[0].fingerprint !== fingerprint) throw Object.assign(new Error('Identificador de comando já utilizado.'), { code: 'REQUEST_REUSED' });
          await connection.commit(); return previous;
        }
      }
      const next = action(structuredClone(previous));
      if (next.id !== previous.id || next.schemaVersion !== 1) throw new Error('Invalid idle state identity');
      next.revision = previous.revision + 1;
      await connection.execute('UPDATE idle_profiles SET state_json = ? WHERE id = ?', [JSON.stringify(next), this.profileId]);
      if (requestId) await connection.execute('INSERT INTO idle_commands (profile_id, request_id, fingerprint) VALUES (?, ?, ?)', [this.profileId, requestId, fingerprint]);
      await connection.commit(); return structuredClone(next);
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  }
  async read(): Promise<GameState> {
    await this.initialize();
    const [rows] = await this.pool.query<RowDataPacket[]>('SELECT state_json FROM idle_profiles WHERE id = ?', [this.profileId]);
    return decode(rows[0].state_json);
  }
  async health(): Promise<boolean> { try { await this.pool.query('SELECT 1'); return true; } catch { return false; } }
}
