import type { AccountView } from '../shared/portal-types';
import type { CommandRequest } from '../shared/types';
import { parseCommandRequest } from '../server/validation';
export class PendingCommands {
  constructor(private readonly storage: Storage) { }
  private key(identity: AccountView): string { return `idle:pending:v1:${encodeURIComponent(identity.accountId)}:${encodeURIComponent(identity.profileId)}`; }
  read(identity: AccountView): CommandRequest | null {
    const raw = this.storage.getItem(this.key(identity));
    if (raw === null) return null;
    try {
      const value = JSON.parse(raw);
      if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== 1 || value.accountId !== identity.accountId || value.profileId !== identity.profileId || Object.keys(value).some(key => !['version', 'accountId', 'profileId', 'receipt'].includes(key))) return null;
      return parseCommandRequest(value.receipt);
    } catch { return null; }
  }
  write(identity: AccountView, receipt: CommandRequest): void {
    const parsed = parseCommandRequest(receipt);
    this.storage.setItem(this.key(identity), JSON.stringify({ version: 1, accountId: identity.accountId, profileId: identity.profileId, receipt: parsed }));
  }
  clear(identity: AccountView, requestId: string): void {
    if (this.read(identity)?.requestId === requestId) this.storage.removeItem(this.key(identity));
  }
}
