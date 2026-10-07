import { expect, it } from 'vitest';
import { PendingCommands } from '../web/pending-command';
import type { AccountView } from '../shared/portal-types';
const a: AccountView = { accountId: 'account-a', profileId: 'profile-a', username: 'a', characterName: 'A' };
const b = { ...a, accountId: 'account-b' };
const receipt = { requestId: 'purchase-0001', command: { type: 'buy' as const, itemId: 501, quantity: 2 } };
function storage(): Storage {
  const values = new Map<string, string>();
  return { get length() { return values.size; }, clear: () => values.clear(), key: i => [...values.keys()][i] ?? null, getItem: k => values.get(k) ?? null, setItem: (k, v) => { values.set(k, v); }, removeItem: k => { values.delete(k); } };
}
it('survives a new instance and namespaces both account and profile', () => {
  const s = storage(); const pending = new PendingCommands(s); pending.write(a, receipt);
  expect(new PendingCommands(s).read(a)).toEqual(receipt); expect(pending.read(b)).toBeNull(); expect(pending.read({ ...a, profileId: 'other' })).toBeNull();
  pending.write(b, { ...receipt, requestId: 'purchase-0002' }); pending.clear(a, receipt.requestId); expect(pending.read(a)).toBeNull(); expect(pending.read(b)?.requestId).toBe('purchase-0002');
});
it('clears only the matching receipt and rejects malformed/version/identity data', () => {
  const s = storage(); const pending = new PendingCommands(s); pending.write(a, receipt); const key = s.key(0)!;
  pending.clear(a, 'older-id'); expect(pending.read(a)).toEqual(receipt);
  const envelope = JSON.parse(s.getItem(key)!);
  for (const value of ['{bad', JSON.stringify({ ...envelope, version: 999 }), JSON.stringify({ ...envelope, accountId: b.accountId }), JSON.stringify({ ...envelope, receipt: { ...receipt, command: { type: 'buy', itemId: 501, quantity: -1 } } })]) {
    s.setItem(key, value); expect(pending.read(a)).toBeNull();
  }
});
it('propagates storage failure and validates before writing', () => {
  const s = storage(); s.setItem = () => { throw new Error('quota'); };
  expect(() => new PendingCommands(s).write(a, receipt)).toThrow('quota');
  expect(() => new PendingCommands(storage()).write(a, { ...receipt, requestId: 'bad' })).toThrow();
});
