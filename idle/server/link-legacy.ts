import { createPool, type Pool, type RowDataPacket } from 'mysql2/promise';
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import type { AccountView } from '../shared/portal-types.js';
import { PortalError } from './identity/types.js';
import { LEGACY_PROFILE_IDS } from './repository.js';

export async function linkLegacyAccount(pool: Pool, username: string): Promise<{ account: AccountView; previousProfileId: string }> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    // Every maintenance operation locks the legacy row first. Competing owners
    // serialize here before looking up or changing their account.
    const [legacy] = await connection.query<RowDataPacket[]>(`SELECT id, state_json FROM idle_profiles
      WHERE id IN (?, ?) ORDER BY FIELD(id, ?, ?) LIMIT 1 FOR UPDATE`, [...LEGACY_PROFILE_IDS, ...LEGACY_PROFILE_IDS]);
    if (!legacy.length) throw new PortalError('LEGACY_NOT_FOUND', 404, 'Perfil legado não encontrado.');
    const legacyProfileId = String(legacy[0].id);
    const [rows] = await connection.query<RowDataPacket[]>('SELECT id, username, profile_id FROM idle_accounts WHERE username = ? FOR UPDATE', [username.toLowerCase()]);
    if (!rows.length) throw new PortalError('ACCOUNT_NOT_FOUND', 404, 'Conta não encontrada.');
    const [owners] = await connection.query<RowDataPacket[]>('SELECT id FROM idle_accounts WHERE profile_id = ?', [legacyProfileId]);
    if (owners.length) throw new PortalError('LEGACY_OWNED', 409, 'Perfil legado já associado a uma conta.');
    const row = rows[0];
    const state = typeof legacy[0].state_json === 'string' ? JSON.parse(legacy[0].state_json) : legacy[0].state_json;
    await connection.execute('UPDATE idle_accounts SET profile_id = ?, credential_version = credential_version + 1 WHERE id = ?', [legacyProfileId, row.id]);
    await connection.execute('DELETE FROM idle_sessions WHERE account_id = ?', [row.id]);
    await connection.commit();
    return { account: { accountId: row.id, username: row.username, profileId: legacyProfileId, characterName: state.name }, previousProfileId: row.profile_id };
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--username' || !/^[A-Za-z0-9_]{3,24}$/.test(args[1])) throw new Error('Uso: node dist/server/link-legacy.js --username USUARIO');
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('A associação exige confirmação em um terminal interativo.');
  const pool = createPool({ host: process.env.DB_HOST ?? 'database', port: Number(process.env.DB_PORT ?? 3306), user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME, connectionLimit: 1, charset: 'utf8mb4' });
  try {
    // Preview uses only IDs/names; it never prints credentials or full JSON.
    const [accounts] = await pool.query<RowDataPacket[]>(`SELECT a.id, a.username, a.profile_id,
      JSON_UNQUOTE(JSON_EXTRACT(p.state_json, '$.name')) AS name FROM idle_accounts a JOIN idle_profiles p ON p.id = a.profile_id WHERE a.username = ?`, [args[1].toLowerCase()]);
    const [legacy] = await pool.query<RowDataPacket[]>(`SELECT id, JSON_UNQUOTE(JSON_EXTRACT(state_json, '$.name')) AS name FROM idle_profiles
      WHERE id IN (?, ?) ORDER BY FIELD(id, ?, ?) LIMIT 1`, [...LEGACY_PROFILE_IDS, ...LEGACY_PROFILE_IDS]);
    if (!accounts.length || !legacy.length) throw new Error('Conta ou perfil legado não encontrado.');
    console.info(`Conta: ${accounts[0].id} (${accounts[0].username})\nPerfil anterior: ${accounts[0].profile_id} (${accounts[0].name})\nPerfil legado: ${legacy[0].id} (${legacy[0].name})`);
    const input = createInterface({ input: process.stdin, output: process.stdout });
    let answer: string;
    try { answer = await input.question('Digite ASSOCIAR para confirmar: '); } finally { input.close(); }
    if (answer !== 'ASSOCIAR') { console.info('Associação cancelada.'); return; }
    const linked = await linkLegacyAccount(pool, args[1]);
    console.info(`Conta ${linked.account.accountId} associada a ${linked.account.profileId}. Perfil anterior ${linked.previousProfileId} preservado.`);
  } finally { await pool.end(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error instanceof PortalError ? error.message : 'Não foi possível associar o legado. Verifique os argumentos, o terminal e a conexão.'); process.exitCode = 1; });
}
