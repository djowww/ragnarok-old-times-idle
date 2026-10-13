import { createHash } from 'node:crypto';
import raw from '../content/catalog.json';
import type { Catalog } from '../shared/types';
import { createInitialState } from '../engine';
import { MemoryAccountStore } from './portal-fixture';
import { SessionGameProfiles } from '../server/profiles';
import { buildApp } from '../server/app';
export const connectionIds = {
  alpha: '1bd3543b-12fd-4c9c-a103-45fa1e68ad16', beta: '71b1d5a9-a1e7-4790-80aa-90ddc19c2b73',
  fresh: 'd1ae8d7f-a69d-439c-994b-d91cdf54f727',
};
export async function rogueSessionSetup() {
  const catalog = raw as unknown as Catalog, accounts = new MemoryAccountStore();
  const tokens = { alpha: 'a'.repeat(43), beta: 'b'.repeat(43) }, identities: Record<string, string> = {};
  for (const name of ['alpha', 'beta'] as const) {
    const profile = createInitialState(catalog, 1000); profile.id = 'profile-' + name; profile.name = name;
    profile.job = 'stalker'; profile.learnedSkills = { rg_plagiarism: 10, st_preserve: 1 };
    profile.copiedSkill = { skillId: 'fire_bolt', level: name === 'alpha' ? 5 : 3 };
    const account = await accounts.register({ username: name, passwordHash: 'test-only', nameKey: name, profile }, {
      tokenHash: createHash('sha256').update(tokens[name]).digest('hex'), createdAt: 1000, expiresAt: 100000,
    });
    identities[name] = JSON.stringify([account.accountId, account.profileId]);
  }
  const profiles = new SessionGameProfiles(accounts.profiles);
  const app = await buildApp({ catalog, accounts, profiles, now: () => 1000 });
  for (const name of ['alpha', 'beta'] as const) {
    const repo = profiles.forProfile('profile-' + name);
    await repo.openSession(connectionIds[name], s => s);
    await repo.transact('activate-preserve-' + name, s => {
      s.buffs.st_preserve = { startsAt: 1000, expiresAt: 601000, effects: {} };
      (s.combatEffects ??= {}).buffLevels = { st_preserve: 1 }; return s;
    }, 'preserve');
  }
  return { catalog, app, accounts, profiles, tokens, identities,
    cookies: { alpha: { idle_session: tokens.alpha }, beta: { idle_session: tokens.beta } } };
}
