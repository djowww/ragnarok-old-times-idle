import { describe, expect, it } from 'vitest';
import { characterKey, validateLogin, validatePassword, validateRegistration } from '../server/identity/validation.js';
import { MemoryAccountStore, MemoryGameProfiles, accountSeed, sessionSeed } from './portal-fixture.js';

const valid = { username: 'Hero_A', characterName: 'Éowyn', gender: 'female', password: ' 1234567890 ', confirmation: ' 1234567890 ' };
describe('account input validation', () => {
  it('normalizes names without changing password', () => {
    expect(characterKey('  Éowyn  ')).toBe('éowyn');
    expect(characterKey('  Éowyn  ')).toBe(characterKey('E\u0301OWYN'));
    expect(validateRegistration({ ...valid, characterName: '  E\u0301owyn  ' })).toEqual({ ...valid, username: 'hero_a' });
    expect(validateLogin({ username: 'HERO_A', password: valid.password })).toEqual({ username: 'hero_a', password: valid.password });
    expect(validatePassword({ currentPassword: 'old', newPassword: valid.password, confirmation: valid.password }).newPassword).toBe(valid.password);
  });
  it('rejects character length and reserved djow', () => {
    for (const characterName of ['A', 'A'.repeat(25), ' DjOw ', '😀😀', 'A\nB']) {
      expect(() => validateRegistration({ ...valid, characterName })).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR', fields: expect.objectContaining({ characterName: expect.any(String) }) }));
    }
    expect(validateRegistration({ ...valid, characterName: '𐐀'.repeat(24) }).characterName).toBe('𐐀'.repeat(24));
  });
  it('rejects malformed input and invalid username gender password or confirmation', () => {
    for (const input of [null, [], 'invalid', { ...valid, username: 'éowyn' }, { ...valid, username: 'aa' }, { ...valid, username: 'a'.repeat(25) }, { ...valid, gender: 'other' }, { ...valid, password: '123456789' }, { ...valid, password: 'a'.repeat(129) }, { ...valid, confirmation: 'different' }]) {
      expect(() => validateRegistration(input)).toThrow(expect.objectContaining({ statusCode: 400 }));
    }
    expect(validateRegistration({ ...valid, password: '𐐀'.repeat(128), confirmation: '𐐀'.repeat(128) }).password).toBe('𐐀'.repeat(128));
    expect(() => validateLogin({ username: 'abc', password: '' })).toThrow();
    expect(() => validatePassword({ currentPassword: '', newPassword: valid.password, confirmation: valid.password })).toThrow();
  });
});

describe('memory account fixture contract', () => {
  it('registers independent profiles and refuses missing profile creation', async () => {
    const profiles = new MemoryGameProfiles();
    const store = new MemoryAccountStore(profiles);
    const first = await store.register(accountSeed('memory_a', 'Alice'), sessionSeed());
    const second = await store.register(accountSeed('memory_b', 'Bob'), sessionSeed());
    await profiles.forProfile(first.profileId).transact('purchase', s => ({ ...s, zeny: 150 }), 'buy');
    expect((await profiles.forProfile(first.profileId).read()).zeny).toBe(150);
    expect((await profiles.forProfile(second.profileId).read()).zeny).toBe(200);
    expect(await profiles.eligible(null, 50)).toEqual([first.profileId, second.profileId].sort());
    expect(() => profiles.forProfile('absent')).toThrow();
  });
  it('matches duplicate expiry version and password revocation semantics', async () => {
    const store = new MemoryAccountStore();
    const session = sessionSeed();
    const account = await store.register(accountSeed('memory_c', 'Carol'), session);
    await expect(store.register(accountSeed('MEMORY_C', 'Other'), sessionSeed())).rejects.toMatchObject({ code: 'USERNAME_TAKEN' });
    expect(await store.getSession(session.tokenHash, session.expiresAt)).toBeNull();
    const credentials = (await store.findCredentials('MEMORY_C'))!;
    const replacement = sessionSeed();
    await store.changePassword(account.accountId, credentials.credentialVersion, 'new-hash', replacement);
    expect(await store.getSession(session.tokenHash, session.createdAt)).toBeNull();
    expect(await store.getSession(replacement.tokenHash, replacement.createdAt)).toEqual(account);
    await expect(store.issueSession(account.accountId, credentials.credentialVersion, sessionSeed())).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    await store.revokeSession(replacement.tokenHash);
    expect(await store.getSession(replacement.tokenHash, replacement.createdAt)).toBeNull();
  });
});
