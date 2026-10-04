import { resolve } from 'node:path';
import { createPool } from 'mysql2/promise';
import { createInitialState, advanceState } from '../engine/index.js';
import { loadCatalog } from './catalog.js';
import { GameRepository, migrate } from './repository.js';
import { buildApp } from './app.js';

const catalog = await loadCatalog();
const pool = createPool({ host: process.env.DB_HOST ?? 'database', port: Number(process.env.DB_PORT ?? 3306), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME, connectionLimit: 6, charset: 'utf8mb4' });
await migrate(pool);
const repository = new GameRepository(pool, () => createInitialState(catalog, Date.now(), 'Aventureiro'));
await repository.read();
const app = buildApp({ catalog, repository, now: Date.now, assetOrigin: process.env.ASSET_ORIGIN, webRoot: resolve('public-build') });
let ticking = false;
const timer = setInterval(async () => {
  if (ticking) return;
  ticking = true;
  try { await repository.transact(null, state => advanceState(state, catalog, Date.now())); }
  catch { console.error('Não foi possível salvar o progresso idle.'); }
  finally { ticking = false; }
}, 5000);
app.addHook('onClose', async () => { clearInterval(timer); await pool.end(); });
await app.listen({ host: '0.0.0.0', port: Number(process.env.PORT ?? 3339) });
console.info('Ragnarok Old Times Idle disponível na porta 3339.');
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void app.close(); });
