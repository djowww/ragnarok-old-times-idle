import type { AccountView, LoginInput, PasswordInput, RegistrationInput } from '../../shared/portal-types.js';
import type { Catalog } from '../../shared/types.js';
import type { AccountStore } from './types.js';
import { PortalError } from './types.js';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { createInitialState } from '../../engine/index.js';
import { characterKey, validateLogin, validatePassword, validateRegistration } from './validation.js';
import { hashPassword, verifyPassword } from './password.js';
export type AuthResult = { account: AccountView; token: string; expiresAt: number };
export type PasswordHasher = { hash(password: string): Promise<string>; verify(password: string, encoded: string): Promise<boolean> };
export interface AuthService {
  readonly now: () => number;
  readonly secureCookie: boolean;
  resolve(token: string | undefined): Promise<AccountView | null>;
  register(input: RegistrationInput): Promise<AuthResult>;
  login(input: LoginInput): Promise<AuthResult>;
  logout(token: string | undefined): Promise<void>;
  changePassword(account: AccountView, input: PasswordInput): Promise<AuthResult>;
}
const SESSION_MS = 7 * 86400000;
// Precomputed from a discarded random secret, so startup needs no derivation.
// Unknown users perform the same work; its result cannot authenticate them.
const RESERVE_HASH = 'scrypt$v1$32768$8$3$19464eee9135e279d860e5e1496be5a3$89e5c56ad430873f04093f4baf22941d64f86bd682a25bd927dde03a5a31f1e865722450aa459d6804fc06084d596c77b1c0bdb51156c63e51744601a62ff8e6';
function tokenHash(token: string): string { return createHash('sha256').update(token).digest('hex'); }
function invalidCredentials(): PortalError { return new PortalError('INVALID_CREDENTIALS', 401, 'Usuário ou senha incorretos.'); }

export function createAuthService({ accounts, catalog, now, secureCookie, passwords = { hash: hashPassword, verify: verifyPassword } }: { accounts: AccountStore; catalog: Catalog; now: () => number; secureCookie: boolean; passwords?: PasswordHasher }): AuthService {
  function session() {
    const token = randomBytes(32).toString('base64url');
    const createdAt = now(); const expiresAt = createdAt + SESSION_MS;
    return { token, expiresAt, seed: { tokenHash: tokenHash(token), createdAt, expiresAt } };
  }
  return {
    now, secureCookie,
    async resolve(token) {
      if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
      return accounts.getSession(tokenHash(token), now());
    },
    async register(input) {
      const validated = validateRegistration(input);
      const passwordHash = await passwords.hash(validated.password);
      const profile = createInitialState(catalog, now());
      profile.id = randomUUID(); profile.name = validated.characterName;
      profile.gender = validated.gender; profile.rngState = randomBytes(4).readUInt32LE();
      const issued = session();
      const account = await accounts.register({ username: validated.username, passwordHash, nameKey: characterKey(validated.characterName), profile }, issued.seed);
      return { account, token: issued.token, expiresAt: issued.expiresAt };
    },
    async login(input) {
      const validated = validateLogin(input);
      const record = await accounts.findCredentials(validated.username);
      const verified = await passwords.verify(validated.password, record?.passwordHash ?? RESERVE_HASH);
      if (!record || !verified) throw invalidCredentials();
      const issued = session();
      const account = await accounts.issueSession(record.accountId, record.credentialVersion, issued.seed);
      return { account, token: issued.token, expiresAt: issued.expiresAt };
    },
    async logout(token) { if (token) await accounts.revokeSession(tokenHash(token)); },
    async changePassword(account, input) {
      const validated = validatePassword(input);
      const record = await accounts.findCredentials(account.username);
      if (!record || record.accountId !== account.accountId || record.profileId !== account.profileId) throw new PortalError('AUTH_REQUIRED', 401, 'Entre na sua conta para continuar.');
      if (!await passwords.verify(validated.currentPassword, record.passwordHash)) {
        throw new PortalError('CURRENT_PASSWORD_INVALID', 400, 'Senha atual incorreta.', { currentPassword: 'Senha atual incorreta.' });
      }
      const passwordHash = await passwords.hash(validated.newPassword);
      const issued = session();
      const updated = await accounts.changePassword(record.accountId, record.credentialVersion, passwordHash, issued.seed);
      return { account: updated, token: issued.token, expiresAt: issued.expiresAt };
    },
  };
}
