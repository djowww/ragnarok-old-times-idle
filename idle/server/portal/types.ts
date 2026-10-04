import type { Catalog } from '../../shared/types.js';
import type { PortalStatus, RankingPage, RankingQuery } from '../../shared/portal-types.js';

export interface PortalQueries {
  ranking(query: RankingQuery, now: number): Promise<RankingPage>;
  status(catalog: Catalog, now: number): Promise<PortalStatus>;
}
