import type { Pool, RowDataPacket } from 'mysql2/promise';
import type { Catalog } from '../../shared/types.js';
import type { PortalStatus, RankingPage, RankingQuery } from '../../shared/portal-types.js';
import type { PortalQueries } from './types.js';
import { PortalError } from '../identity/types.js';

const numeric = (path: string) => `CAST(JSON_UNQUOTE(JSON_EXTRACT(p.state_json, '$.${path}')) AS DECIMAL(30, 0))`;
const orders = {
  level: `reborn DESC, baseLevel DESC, ${numeric('baseExp')} DESC, jobLevel DESC, ${numeric('jobExp')} DESC, p.id ASC`,
  zeny: `${numeric('zeny')} DESC, p.id ASC`,
  kills: `${numeric('totals.kills')} DESC, p.id ASC`,
};
const values = { level: numeric('baseLevel'), zeny: numeric('zeny'), kills: numeric('totals.kills') };
const linked = 'FROM idle_profiles p JOIN idle_accounts a ON a.profile_id = p.id';

export class SqlPortalQueries implements PortalQueries {
  constructor(private readonly pool: Pool) {}
  async ranking(query: RankingQuery, now: number): Promise<RankingPage> {
    const offset = (query.page - 1) * query.pageSize;
    if (!Object.hasOwn(orders, query.category) || !Number.isSafeInteger(query.page) || query.page < 1 || !Number.isSafeInteger(query.pageSize) || query.pageSize < 1 || query.pageSize > 50 || !Number.isSafeInteger(offset))
      throw new PortalError('INVALID_RANKING_QUERY', 400, 'Filtros do ranking inválidos.');
    // Exact current class match; the only interpolated SQL comes from our allowlists.
    const filter = query.classId === null ? '' : "WHERE BINARY JSON_UNQUOTE(JSON_EXTRACT(p.state_json, '$.job')) = BINARY ?";
    const parameters = query.classId === null ? [] : [query.classId];
    const [counts] = await this.pool.execute<RowDataPacket[]>(`SELECT COUNT(*) AS total ${linked} ${filter}`, parameters);
    const [rows] = await this.pool.execute<RowDataPacket[]>(`
      SELECT JSON_UNQUOTE(JSON_EXTRACT(p.state_json, '$.name')) AS characterName,
        JSON_UNQUOTE(JSON_EXTRACT(p.state_json, '$.job')) AS classId,
        CASE WHEN JSON_UNQUOTE(JSON_EXTRACT(p.state_json, '$.reborn')) = 'true' THEN 1 ELSE 0 END AS reborn,
        ${numeric('baseLevel')} AS baseLevel, ${numeric('jobLevel')} AS jobLevel,
        ${values[query.category]} AS value
      ${linked} ${filter} ORDER BY ${orders[query.category]} LIMIT ? OFFSET ?`, [...parameters, query.pageSize, offset]);
    return { ...query, total: Number(counts[0].total), updatedAt: now, rows: rows.map((row, index) => ({
      rank: offset + index + 1, characterName: row.characterName as string, classId: row.classId as string,
      reborn: Number(row.reborn) === 1, baseLevel: Number(row.baseLevel), jobLevel: Number(row.jobLevel), value: Number(row.value),
    })) };
  }
  async status(catalog: Catalog, now: number): Promise<PortalStatus> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(`SELECT COUNT(*) AS accounts,
      COALESCE(SUM(JSON_UNQUOTE(JSON_EXTRACT(p.state_json, '$.status')) IN ('hunting', 'challenge', 'resting')), 0) AS hunting ${linked}`);
    return { status: 'ok', accounts: Number(rows[0].accounts), hunting: Number(rows[0].hunting), rates: catalog.rates, checkedAt: now };
  }
}
