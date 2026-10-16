import type { Pool, RowDataPacket } from 'mysql2/promise';
import type { AdminCharacter } from '../shared/admin.js';

export type AdminCharacterRecord = AdminCharacter & { accountId: string };
export interface AdminDirectory {
  search(query: string): Promise<AdminCharacterRecord[]>;
  find(profileId: string): Promise<AdminCharacterRecord | null>;
}

const projection = `a.id AS accountId, a.profile_id AS profileId, a.username,
  JSON_UNQUOTE(JSON_EXTRACT(p.state_json, '$.name')) AS characterName,
  JSON_UNQUOTE(JSON_EXTRACT(p.state_json, '$.job')) AS classId,
  JSON_UNQUOTE(JSON_EXTRACT(p.state_json, '$.baseLevel')) AS baseLevel,
  JSON_UNQUOTE(JSON_EXTRACT(p.state_json, '$.jobLevel')) AS jobLevel,
  JSON_UNQUOTE(JSON_EXTRACT(p.state_json, '$.gender')) AS gender,
  JSON_UNQUOTE(JSON_EXTRACT(p.state_json, '$.status')) AS status,
  JSON_UNQUOTE(JSON_EXTRACT(p.state_json, '$.zeny')) AS zeny`;
const linked = 'FROM idle_accounts a JOIN idle_profiles p ON p.id = a.profile_id';
function character(row: RowDataPacket): AdminCharacterRecord {
  return {
    accountId: String(row.accountId), profileId: String(row.profileId),
    username: String(row.username), characterName: String(row.characterName),
    classId: String(row.classId), baseLevel: Number(row.baseLevel),
    jobLevel: Number(row.jobLevel), gender: row.gender, status: row.status,
    zeny: Number(row.zeny),
  };
}
export class SqlAdminDirectory implements AdminDirectory {
  constructor(private readonly pool: Pool) {}
  async search(query: string): Promise<AdminCharacterRecord[]> {
    const term = query.toLocaleLowerCase('pt-BR');
    const [rows] = await this.pool.execute<RowDataPacket[]>(`SELECT ${projection} ${linked}
      WHERE LOCATE(?, LOWER(a.username)) > 0 OR
        LOCATE(?, LOWER(JSON_UNQUOTE(JSON_EXTRACT(p.state_json, '$.name')))) > 0
      ORDER BY a.username ASC LIMIT 20`, [term, term]);
    return rows.map(character);
  }
  async find(profileId: string): Promise<AdminCharacterRecord | null> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(`SELECT ${projection} ${linked}
      WHERE a.profile_id = ? LIMIT 1`, [profileId]);
    return rows.length ? character(rows[0]) : null;
  }
}
