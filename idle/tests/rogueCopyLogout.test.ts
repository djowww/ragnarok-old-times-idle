import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectionIds, rogueSessionSetup } from './rogue-session-fixture';
const apps: Awaited<ReturnType<typeof rogueSessionSetup>>['app'][] = [];
afterEach(async () => { vi.restoreAllMocks(); for (const app of apps.splice(0)) await app.close(); });
async function setup() { const x = await rogueSessionSetup(); apps.push(x.app); return x; }
describe('trusted logout clears only its profile Preserve', () => {
  it('revokes the token then clears Preserve while keeping the copy and another account intact', async () => {
    const x = await setup();
    const response = await x.app.inject({ method: 'POST', url: '/api/auth/logout', cookies: x.cookies.alpha,
      headers: { 'x-idle-expected-identity': x.identities.alpha }, payload: {} });
    expect(response.statusCode).toBe(200);
    expect((await x.app.inject({ method: 'GET', url: '/api/auth/me', cookies: x.cookies.alpha })).statusCode).toBe(401);
    const alpha = await x.profiles.forProfile('profile-alpha').openSession(connectionIds.alpha, s => s);
    expect(alpha.buffs.st_preserve).toBeUndefined(); expect(alpha.copiedSkill?.level).toBe(5);
    expect((await x.profiles.forProfile('profile-beta').read()).buffs.st_preserve).toBeDefined();
    expect((await x.accounts.profiles.forProfile('profile-alpha').read()).copiedSkill?.level).toBe(5);
  });
  it.each(['wrong', 'malformed', 'missing-session'])('does not clear any profile for %s identity', async kind => {
    const x = await setup();
    const response = await x.app.inject({ method: 'POST', url: '/api/auth/logout',
      cookies: kind === 'missing-session' ? {} : x.cookies.alpha,
      headers: kind === 'missing-session' ? {} : { 'x-idle-expected-identity': kind === 'wrong' ? x.identities.beta : '[' }, payload: {} });
    expect(response.statusCode).toBe(kind === 'missing-session' ? 200 : 401);
    expect((await x.profiles.forProfile('profile-alpha').read()).buffs.st_preserve).toBeDefined();
    expect((await x.profiles.forProfile('profile-beta').read()).buffs.st_preserve).toBeDefined();
  });
  it('keeps the profile volatile state if token revocation fails', async () => {
    const x = await setup(); vi.spyOn(x.accounts, 'revokeSession').mockRejectedValueOnce(new Error('DB unavailable'));
    const response = await x.app.inject({ method: 'POST', url: '/api/auth/logout', cookies: x.cookies.alpha, payload: {} });
    expect(response.statusCode).toBe(503);
    expect((await x.profiles.forProfile('profile-alpha').read()).buffs.st_preserve).toBeDefined();
    expect((await x.app.inject({ method: 'GET', url: '/api/auth/me', cookies: x.cookies.alpha })).statusCode).toBe(200);
  });
});
