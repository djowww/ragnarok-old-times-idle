import { createHash } from 'node:crypto';
import type { InjectOptions } from 'fastify';
import { buildApp as buildAccountApp, type AppOptions } from '../server/app';
import type { StateRepository } from '../server/repository';
import type { GameProfiles } from '../server/identity/types';
import { MemoryAccountStore } from './portal-fixture';

type GameplayOptions = Omit<AppOptions, 'accounts' | 'profiles'> & { repository: StateRepository };

/** Exercises legacy gameplay regressions through a real synthetic account session. */
export function buildApp({ repository, ...options }: GameplayOptions) {
  const token = 'g'.repeat(43);
  const accountApp = (async () => {
    const state = await repository.read();
    const accounts = new MemoryAccountStore();
    await accounts.register({ username: 'gameplay_fixture', passwordHash: 'test-only-hash', nameKey: state.name.toLowerCase(), profile: state }, {
      tokenHash: createHash('sha256').update(token).digest('hex'), createdAt: 0, expiresAt: Number.MAX_SAFE_INTEGER,
    });
    const profiles: GameProfiles = {
      forProfile: id => {
        if (id !== state.id) throw new Error('Unexpected gameplay fixture profile');
        return repository;
      },
      eligible: async () => [state.id],
      health: () => repository.health(),
    };
    return buildAccountApp({ ...options, accounts, profiles });
  })();
  return {
    inject: async (input: InjectOptions | string) => {
      const options: InjectOptions = typeof input === 'string' ? { url: input } : { ...input };
      const headers = { ...options.headers } as Record<string, string | string[] | number | undefined>;
      const prior = typeof headers.cookie === 'string' ? headers.cookie : '';
      const supplied = options.cookies ? Object.entries(options.cookies).map(([key, value]) => key + '=' + value).join('; ') : '';
      const cookies = [prior, supplied].filter(Boolean).join('; ');
      headers.cookie = /(?:^|;\s*)idle_session=/.test(cookies) ? cookies : 'idle_session=' + token + (cookies ? '; ' + cookies : '');
      delete options.cookies;
      options.headers = headers;
      if (String(options.method).toUpperCase() === 'POST' && options.payload === undefined) options.payload = {};
      return (await accountApp).inject(options);
    },
    close: async () => (await accountApp).close(),
    ready: async () => (await accountApp).ready(),
  };
}
