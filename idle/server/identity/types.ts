import type { AccountView } from '../../shared/portal-types.js';
import type { GameState } from '../../shared/types.js';
import type { StateRepository } from '../repository.js';

export type AccountRecord = AccountView & { passwordHash: string; credentialVersion: number };
export type SessionSeed = { tokenHash: string; createdAt: number; expiresAt: number };
export type AccountSeed = { username: string; passwordHash: string; nameKey: string; profile: GameState };
export interface AccountStore {
  register(seed: AccountSeed, session: SessionSeed): Promise<AccountView>;
  findCredentials(username: string): Promise<AccountRecord | null>;
  getSession(tokenHash: string, now: number): Promise<AccountView | null>;
  issueSession(accountId: string, expectedVersion: number, session: SessionSeed): Promise<AccountView>;
  changePassword(accountId: string, expectedVersion: number, passwordHash: string, session: SessionSeed): Promise<AccountView>;
  revokeSession(tokenHash: string): Promise<void>;
  health(): Promise<boolean>;
}
export interface GameProfiles {
  forProfile(profileId: string): StateRepository;
  eligible(afterId: string | null, limit: number): Promise<string[]>;
  health(): Promise<boolean>;
}
export class PortalError extends Error {
  constructor(readonly code: string, readonly statusCode: number, message: string, readonly fields?: Record<string, string>) {
    super(message); this.name = 'PortalError';
  }
}
