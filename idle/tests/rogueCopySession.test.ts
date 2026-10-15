import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionGameProfiles } from '../server/profiles';
import { connectionIds, rogueSessionSetup } from './rogue-session-fixture';
const apps: Awaited<ReturnType<typeof rogueSessionSetup>>['app'][] = [];
afterEach(async () => { vi.restoreAllMocks(); for (const app of apps.splice(0)) await app.close(); });
async function setup() { const x = await rogueSessionSetup(); apps.push(x.app); return x; }
describe('Rogue durable copy and Preserve NoSave', () => {
  it('keeps only the copy in durable JSON and restores Preserve across same-session requests and receipts', async () => {
    const { profiles, accounts } = await setup(), repo = profiles.forProfile('profile-alpha');
    const before = await repo.read(), stored = await accounts.profiles.forProfile('profile-alpha').read();
    expect(stored.buffs.st_preserve).toBeUndefined(); expect(stored.combatEffects?.buffLevels?.st_preserve).toBeUndefined();
    expect(stored.copiedSkill).toEqual({ skillId: 'fire_bolt', level: 5 });
    expect(before.buffs.st_preserve).toMatchObject({ expiresAt: 601000 });
    const duplicate = await repo.transact('activate-preserve-alpha', () => { throw new Error('receipt must skip action'); }, 'preserve');
    expect(duplicate.buffs.st_preserve).toEqual(before.buffs.st_preserve);
    expect(duplicate.combatEffects?.buffLevels?.st_preserve).toBe(1);
    expect(duplicate.inventory).toEqual(stored.inventory); expect(duplicate.skillPoints).toBe(stored.skillPoints);
  });
  it('keeps the old volatile value on an action or commit failure', async () => {
    const { profiles, accounts } = await setup(), repo = profiles.forProfile('profile-alpha');
    const before = await repo.read(), durable = accounts.profiles.forProfile('profile-alpha');
    await expect(repo.transact(null, s => { delete s.buffs.st_preserve; throw new Error('action failure'); })).rejects.toThrow();
    const transact = durable.transactCooperatively!.bind(durable);
    vi.spyOn(durable, 'transactCooperatively').mockImplementationOnce((id, action, fingerprint) =>
      transact(id, async s => { await action(s); throw new Error('commit failure'); }, fingerprint));
    await expect(repo.transactCooperatively!(null, async s => { delete s.buffs.st_preserve; return s; })).rejects.toThrow('commit failure');
    expect((await repo.read()).buffs.st_preserve).toEqual(before.buffs.st_preserve);
    expect((await repo.read()).copiedSkill).toEqual(before.copiedSkill);
  });
  it('drops Preserve on a new connection and process wrapper, retaining both profiles copies', async () => {
    const { profiles, accounts } = await setup(), alpha = profiles.forProfile('profile-alpha');
    expect((await alpha.openSession(connectionIds.alpha, s => s)).buffs.st_preserve).toBeDefined();
    const end = await alpha.openSession(connectionIds.fresh, s => s);
    expect(end.buffs.st_preserve).toBeUndefined(); expect(end.combatEffects?.buffLevels?.st_preserve).toBeUndefined();
    expect(end.copiedSkill?.level).toBe(5);
    expect((await profiles.forProfile('profile-beta').read()).buffs.st_preserve).toBeDefined();
    const restarted = new SessionGameProfiles(accounts.profiles);
    expect((await restarted.forProfile('profile-beta').read()).buffs.st_preserve).toBeUndefined();
    expect((await restarted.forProfile('profile-beta').read()).copiedSkill?.level).toBe(3);
  });
  it('serializes explicit cleanup after a pending transaction without touching another profile or creating unknown stores', async () => {
    const { profiles, accounts } = await setup(), alpha = profiles.forProfile('profile-alpha');
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; }), started = new Promise<void>(resolve => { entered = resolve; });
    const pending = alpha.transactCooperatively!(null, async s => { entered(); await gate; s.copiedSkill!.level = 6; return s; });
    await started;
    const clear = (profiles as any).endSession('profile-alpha'); release(); await pending; await clear;
    const end = await alpha.openSession(connectionIds.alpha, s => s);
    expect(end.buffs.st_preserve).toBeUndefined(); expect(end.copiedSkill?.level).toBe(6);
    expect((await profiles.forProfile('profile-beta').read()).buffs.st_preserve).toBeDefined();
    const lookup = vi.spyOn(accounts.profiles, 'forProfile');
    await (profiles as any).endSession('does-not-exist'); expect(lookup).not.toHaveBeenCalled();
  });
});
