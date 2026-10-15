import { randomUUID } from 'node:crypto';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { AccountView } from '../../shared/portal-types.js';
import { PortalError, type AccountRecord, type AccountSeed, type AccountStore, type SessionSeed } from './types.js';

const projection = `a.id AS accountId, a.username, a.profile_id AS profileId,
  JSON_UNQUOTE(JSON_EXTRACT(p.state_json, '$.name')) AS characterName`;
function view(row: RowDataPacket): AccountView {
  return { accountId: row.accountId, username: row.username, profileId: row.profileId, characterName: row.characterName };
}
function duplicate(error: unknown, field: 'username' | 'characterName'): never {
  if ((error as { code?: string }).code === 'ER_DUP_ENTRY') {
    const message = field === 'username' ? 'Usuário já cadastrado.' : 'Nome de personagem já utilizado.';
    throw new PortalError(field === 'username' ? 'USERNAME_TAKEN' : 'CHARACTER_NAME_TAKEN', 409, message, { [field]: message });
  }
  throw error;
}
export class SqlAccountStore implements AccountStore {
  constructor(private readonly pool: Pool) {}
  private async transaction<T>(action: (connection: PoolConnection) => Promise<T>): Promise<T> {
    const connection = await this.pool.getConnection();
    try { await connection.beginTransaction(); const result = await action(connection); await connection.commit(); return result; }
    catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  }
  private async insertSession(connection: PoolConnection, accountId: string, version: number, session: SessionSeed): Promise<void> {
    await connection.execute('INSERT INTO idle_sessions (token_hash, account_id, credential_version, created_at_ms, expires_at_ms) VALUES (?, ?, ?, ?, ?)',
      [session.tokenHash, accountId, version, session.createdAt, session.expiresAt]);
  }
  async register(seed: AccountSeed, session: SessionSeed): Promise<AccountView> {
    return this.transaction(async connection => {
      const accountId = randomUUID(); const username = seed.username.toLowerCase();
      try {
        await connection.execute('INSERT INTO idle_profiles (id, state_json, character_name_key) VALUES (?, ?, ?)',
          [seed.profile.id, JSON.stringify(seed.profile), seed.nameKey]);
      } catch (error) { duplicate(error, 'characterName'); }
      try {
        await connection.execute('INSERT INTO idle_accounts (id, username, password_hash, profile_id, created_at_ms) VALUES (?, ?, ?, ?, ?)',
          [accountId, username, seed.passwordHash, seed.profile.id, session.createdAt]);
      } catch (error) { duplicate(error, 'username'); }
      await this.insertSession(connection, accountId, 1, session);
      return { accountId, username, profileId: seed.profile.id, characterName: seed.profile.name };
    });
  }
  async findCredentials(username: string): Promise<AccountRecord | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(`SELECT ${projection}, a.password_hash AS passwordHash, a.credential_version AS credentialVersion
      FROM idle_accounts a JOIN idle_profiles p ON p.id = a.profile_id WHERE a.username = ?`, [username.toLowerCase()]);
    return rows.length ? { ...view(rows[0]), passwordHash: rows[0].passwordHash, credentialVersion: Number(rows[0].credentialVersion) } : null;
  }
  async getSession(tokenHash: string, now: number): Promise<AccountView | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(`SELECT ${projection} FROM idle_sessions s
      JOIN idle_accounts a ON a.id = s.account_id AND a.credential_version = s.credential_version
      JOIN idle_profiles p ON p.id = a.profile_id WHERE s.token_hash = ? AND s.expires_at_ms > ?`, [tokenHash, now]);
    return rows.length ? view(rows[0]) : null;
  }
  private async lockedAccount(connection: PoolConnection, accountId: string, expectedVersion: number): Promise<AccountView> {
    const [rows] = await connection.query<RowDataPacket[]>(`SELECT ${projection}, a.credential_version AS credentialVersion
      FROM idle_accounts a JOIN idle_profiles p ON p.id = a.profile_id WHERE a.id = ? FOR UPDATE`, [accountId]);
    if (!rows.length) throw new PortalError('AUTH_REQUIRED', 401, 'Entre na sua conta para continuar.');
    if (Number(rows[0].credentialVersion) !== expectedVersion) throw new PortalError('INVALID_CREDENTIALS', 401, 'Credenciais alteradas. Entre novamente.');
    return view(rows[0]);
  }
  async issueSession(accountId: string, expectedVersion: number, session: SessionSeed): Promise<AccountView> {
    return this.transaction(async connection => {
      const account = await this.lockedAccount(connection, accountId, expectedVersion);
      await this.insertSession(connection, accountId, expectedVersion, session); return account;
    });
  }
  async changePassword(accountId: string, expectedVersion: number, passwordHash: string, session: SessionSeed): Promise<AccountView> {
    return this.transaction(async connection => {
      const account = await this.lockedAccount(connection, accountId, expectedVersion);
      await connection.execute('UPDATE idle_accounts SET password_hash = ?, credential_version = credential_version + 1 WHERE id = ?', [passwordHash, accountId]);
      await connection.execute('DELETE FROM idle_sessions WHERE account_id = ?', [accountId]);
      await this.insertSession(connection, accountId, expectedVersion + 1, session); return account;
    });
  }
  async revokeSession(tokenHash: string): Promise<void> { await this.pool.execute('DELETE FROM idle_sessions WHERE token_hash = ?', [tokenHash]); }
  async health(): Promise<boolean> { try { await this.pool.query('SELECT 1'); return true; } catch { return false; } }
}
