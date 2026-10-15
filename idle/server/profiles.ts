import type { Pool, RowDataPacket } from 'mysql2/promise';
import type { GameProfiles } from './identity/types.js';
import { GameRepository, LEGACY_PROFILE_IDS } from './repository.js';
export class SqlGameProfiles implements GameProfiles {
  constructor(private readonly pool: Pool) {}
  forProfile(id: string): GameRepository {
    return new GameRepository(this.pool, () => { throw new Error('Profile does not exist'); }, id);
  }
  async eligible(after: string | null, limit: number): Promise<string[]> {
    const count = Math.max(1, Math.min(50, Math.floor(limit)));
    const [rows] = await this.pool.query<RowDataPacket[]>(`SELECT p.id FROM idle_profiles p
      WHERE (p.id IN (?, ?) OR EXISTS (SELECT 1 FROM idle_accounts a WHERE a.profile_id = p.id))
      AND JSON_UNQUOTE(JSON_EXTRACT(p.state_json, '$.status')) IN ('hunting', 'challenge', 'resting')
      ${after === null ? '' : 'AND p.id > ?'} ORDER BY p.id ASC LIMIT ?`, after === null ? [...LEGACY_PROFILE_IDS, count] : [...LEGACY_PROFILE_IDS, after, count]);
    return rows.map(row => String(row.id));
  }
  async health(): Promise<boolean> { try { await this.pool.query('SELECT 1'); return true; } catch { return false; } }
}
