import { afterEach, describe, expect, it, vi } from 'vitest';
import { advanceState } from '../engine';
import * as rng from '../engine/state';
import { rogueSetup, npcCopyCast } from './rogue-copy-fixture';
afterEach(() => vi.restoreAllMocks());
function preserveSetup(copy = true) {
  const x = rogueSetup(); x.s.job = 'stalker'; x.s.learnedSkills.st_preserve = 1;
  x.c.skills.st_preserve.implementation = 'supported'; x.s.rotation = ['st_preserve'];
  if (copy) x.s.copiedSkill = { skillId: 'fire_bolt', level: 3 };
  delete x.e.npcCombat!.cast;
  return x;
}
describe('Preserve real self-cast and source protection', () => {
  it('waits for a valid copy without blocking initial acquisition', () => {
    const x = preserveSetup(false);
    let end = advanceState(x.s, x.c, 250);
    expect(end.battle!.cast).toBeUndefined(); expect(end.sp).toBe(1000);
    npcCopyCast({ ...x, s: end, e: end.battle!.enemies![0] }, 0, 3, 500);
    end = advanceState(end, x.c, 500);
    expect(end.copiedSkill).toEqual({ skillId: 'fire_bolt', level: 3 });
    expect(end.battle!.cast).toMatchObject({ skillId: 'st_preserve', level: 1 });
  });
  it('casts for source 1s, charges 30SP once and applies 600s with one status RNG draw', () => {
    const x = preserveSetup();
    let end = advanceState(x.s, x.c, 750);
    expect(end.battle!.cast).toMatchObject({ skillId: 'st_preserve', endsAt: 1000 }); expect(end.sp).toBe(1000);
    const random = vi.spyOn(rng, 'random').mockReturnValue(0);
    end = advanceState(end, x.c, 1000);
    expect(end.buffs.st_preserve).toMatchObject({ startsAt: 1000, expiresAt: 601000 });
    expect(end.sp).toBe(970); expect(random).toHaveBeenCalledTimes(1);
    expect(end.events.find(e => e.kind === 'skill' && e.skillId === 'st_preserve')).toMatchObject({ skillLevel: 1 });
  });
  it('rejects replacement while active and admits it after expiry', () => {
    const x = preserveSetup(); let end = advanceState(x.s, x.c, 1000); end.rotation = [];
    end.buffs.st_preserve.expiresAt = 1750;
    npcCopyCast({ ...x, s: end, e: end.battle!.enemies![0] }, 1, 2, 1250);
    end = advanceState(end, x.c, 1250); expect(end.copiedSkill?.skillId).toBe('fire_bolt');
    npcCopyCast({ ...x, s: end, e: end.battle!.enemies![0] }, 1, 2, 1750);
    end = advanceState(end, x.c, 1750); expect(end.copiedSkill).toEqual({ skillId: 'cold_bolt', level: 2 });
  });
  it('does not let a future Preserve protect an earlier hit', () => {
    const x = rogueSetup(); x.s.buffs.st_preserve = { startsAt: 1000, expiresAt: 601000, effects: {} };
    const end = advanceState(x.s, x.c, 250); expect(end.copiedSkill?.skillId).toBe('fire_bolt');
  });
  it('removes Preserve on death while retaining the copied spell', () => {
    const x = preserveSetup(); let end = advanceState(x.s, x.c, 1000); end.rotation = []; end.hp = 1;
    npcCopyCast({ ...x, s: end, e: end.battle!.enemies![0] }, 1, 2, 1250);
    end = advanceState(end, x.c, 1250);
    expect(end.totals.deaths).toBe(1); expect(end.buffs.st_preserve).toBeUndefined();
    expect(end.combatEffects?.buffLevels?.st_preserve).toBeUndefined();
    expect(end.copiedSkill).toEqual({ skillId: 'fire_bolt', level: 3 });
  });
  it('pays no cost for a damage-interrupted cast', () => {
    const x = preserveSetup(); npcCopyCast(x, 1, 2, 250);
    const end = advanceState(x.s, x.c, 1000);
    expect(end.events.some(e => e.kind === 'cast-interrupted' && e.skillId === 'st_preserve')).toBe(true);
    expect(end.buffs.st_preserve).toBeUndefined(); expect(end.sp).toBe(1000);
  });
  it('does not cast while silenced or unable to pay source SP', () => {
    const x = preserveSetup(); x.s.sp = 29;
    expect(advanceState(x.s, x.c, 1000).battle!.cast).toBeUndefined();
    x.s.sp = 1000; x.s.playerStatuses = { SC_SILENCE: { startsAt: 0, expiresAt: 5000, level: 1 } };
    expect(advanceState(x.s, x.c, 1000).battle!.cast).toBeUndefined();
  });
});
