import { randomUUID, createHash } from 'node:crypto';
import catalogJSON from '../content/catalog.json';
import { createInitialState } from '../engine/index.js';
import type { Catalog, GameState } from '../shared/types.js';
import type { AccountView } from '../shared/portal-types.js';
import type { StateRepository } from '../server/repository.js';
import { PortalError, type AccountRecord, type AccountSeed, type AccountStore, type GameProfiles, type SessionSeed } from '../server/identity/types.js';

export function accountSeed(username: string, characterName: string): AccountSeed {
  const profile = createInitialState(catalogJSON as unknown as Catalog, 1000);
  profile.id = `test-${randomUUID()}`; profile.name = characterName.trim().normalize('NFC');
  return { username, passwordHash: 'test-hash', nameKey: profile.name.toLowerCase(), profile };
}
export function sessionSeed(): SessionSeed {
  return { tokenHash: createHash('sha256').update(randomUUID()).digest('hex'), createdAt: 1000, expiresAt: 1000 + 7 * 86400000 };
}
class MemoryStateRepository implements StateRepository {
  private state: GameState;
  private receipts = new Map<string, string>();
  private pending: Promise<unknown> = Promise.resolve();
  constructor(state: GameState) { this.state = structuredClone(state); }
  transact(requestId: string | null, action: (state: GameState) => GameState, fingerprint = ''): Promise<GameState> {
    return this.transactCooperatively(requestId, async state => action(state), fingerprint);
  }
  transactCooperatively(requestId: string | null, action: (state: GameState) => Promise<GameState>, fingerprint = ''): Promise<GameState> {
    const result = this.pending.then(async () => {
      if (requestId && this.receipts.has(requestId)) {
        if (this.receipts.get(requestId) !== fingerprint) throw Object.assign(new Error('Identificador de comando já utilizado.'), { code: 'REQUEST_REUSED' });
        return structuredClone(this.state);
      }
      const next = await action(structuredClone(this.state));
      if (next.id !== this.state.id || next.schemaVersion !== 1) throw new Error('Invalid idle state identity');
      next.revision = this.state.revision + 1; this.state = structuredClone(next);
      if (requestId) this.receipts.set(requestId, fingerprint);
      return structuredClone(this.state);
    });
    this.pending = result.catch(() => {}); return result;
  }
  async read(): Promise<GameState> { await this.pending; return structuredClone(this.state); }
  async health(): Promise<boolean> { return true; }
}
export class MemoryGameProfiles implements GameProfiles {
  private readonly repositories = new Map<string, MemoryStateRepository>();
  add(profile: GameState): void {
    if (this.repositories.has(profile.id)) throw new Error('Duplicate profile ID');
    this.repositories.set(profile.id, new MemoryStateRepository(profile));
  }
  forProfile(profileId: string): StateRepository {
    const repository = this.repositories.get(profileId);
    if (!repository) throw new Error('Profile does not exist'); return repository;
  }
  async eligible(afterId: string | null, limit: number): Promise<string[]> {
    return [...this.repositories.keys()].sort().filter(id => afterId === null || id > afterId).slice(0, limit);
  }
  async health(): Promise<boolean> { return true; }
}
function accountView(record: AccountRecord): AccountView {
  const { accountId, username, profileId, characterName } = record; return { accountId, username, profileId, characterName };
}
export class MemoryAccountStore implements AccountStore {
  readonly profiles: MemoryGameProfiles;
  private readonly accounts = new Map<string, AccountRecord>();
  private readonly nameKeys = new Set<string>();
  private readonly sessions = new Map<string, SessionSeed & { accountId: string; credentialVersion: number }>();
  constructor(profiles = new MemoryGameProfiles()) { this.profiles = profiles; }
  private availableSession(session: SessionSeed): void {
    if (this.sessions.has(session.tokenHash)) throw new Error('Duplicate session hash');
  }
  private account(accountId: string, expectedVersion: number): AccountRecord {
    const record = this.accounts.get(accountId);
    if (!record) throw new PortalError('AUTH_REQUIRED', 401, 'Entre na sua conta para continuar.');
    if (record.credentialVersion !== expectedVersion) throw new PortalError('INVALID_CREDENTIALS', 401, 'Credenciais alteradas. Entre novamente.');
    return record;
  }
  async register(seed: AccountSeed, session: SessionSeed): Promise<AccountView> {
    const username = seed.username.toLowerCase();
    if (this.nameKeys.has(seed.nameKey)) throw new PortalError('CHARACTER_NAME_TAKEN', 409, 'Nome de personagem já utilizado.', { characterName: 'Nome de personagem já utilizado.' });
    if ([...this.accounts.values()].some(a => a.username === username)) throw new PortalError('USERNAME_TAKEN', 409, 'Usuário já cadastrado.', { username: 'Usuário já cadastrado.' });
    this.availableSession(session);
    const account: AccountRecord = { accountId: randomUUID(), username, profileId: seed.profile.id, characterName: seed.profile.name, passwordHash: seed.passwordHash, credentialVersion: 1 };
    this.profiles.add(seed.profile); this.accounts.set(account.accountId, account); this.nameKeys.add(seed.nameKey);
    this.sessions.set(session.tokenHash, { ...session, accountId: account.accountId, credentialVersion: 1 });
    return accountView(account);
  }
  async findCredentials(username: string): Promise<AccountRecord | null> {
    const record = [...this.accounts.values()].find(a => a.username === username.toLowerCase()); return record ? structuredClone(record) : null;
  }
  async getSession(tokenHash: string, now: number): Promise<AccountView | null> {
    const session = this.sessions.get(tokenHash); if (!session || now >= session.expiresAt) return null;
    const account = this.accounts.get(session.accountId);
    return account && account.credentialVersion === session.credentialVersion ? accountView(account) : null;
  }
  async issueSession(accountId: string, expectedVersion: number, session: SessionSeed): Promise<AccountView> {
    const account = this.account(accountId, expectedVersion); this.availableSession(session);
    this.sessions.set(session.tokenHash, { ...session, accountId, credentialVersion: expectedVersion }); return accountView(account);
  }
  async changePassword(accountId: string, expectedVersion: number, passwordHash: string, session: SessionSeed): Promise<AccountView> {
    const account = this.account(accountId, expectedVersion);
    const existing = this.sessions.get(session.tokenHash);
    if (existing && existing.accountId !== accountId) throw new Error('Duplicate session hash');
    account.passwordHash = passwordHash; account.credentialVersion++;
    for (const [hash, entry] of this.sessions) if (entry.accountId === accountId) this.sessions.delete(hash);
    this.sessions.set(session.tokenHash, { ...session, accountId, credentialVersion: account.credentialVersion }); return accountView(account);
  }
  async revokeSession(tokenHash: string): Promise<void> { this.sessions.delete(tokenHash); }
  async health(): Promise<boolean> { return true; }
}
