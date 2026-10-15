import { afterEach, describe, expect, it, vi } from 'vitest';
import { advanceState } from '../engine';
import { executeCommand } from '../engine/commands';
import * as rng from '../engine/state';
import { copySpells, rogueSetup, npcCopyCast, slot } from './rogue-copy-fixture';

afterEach(() => vi.restoreAllMocks());
describe('Rogue copy through real incoming NPC magic', () => {
  it.each(copySpells)('copies %s only after its damaging cast completes', (sourceName, id, _element, _sourceId) => {
    const x = rogueSetup(); npcCopyCast(x, copySpells.findIndex(row => row[0] === sourceName), 8, 250);
    const before = advanceState(x.s, x.c, 249);
    expect(slot(before)).toBeUndefined();
    const end = advanceState(before, x.c, 250);
    expect(slot(end)).toEqual({ skillId: id, level: 5 });
    expect(end.learnedSkills).toEqual(x.s.learnedSkills);
    expect(end.skillPoints).toBe(x.s.skillPoints);
    expect(end.rotation).toEqual([]);
  });
  it.each(['unlearned', 'unflagged', 'zero', 'miss', 'lethal'])('does not copy a %s hit', reason => {
    vi.spyOn(rng, 'random').mockReturnValue(0);
    const x = rogueSetup();
    if (reason === 'unlearned') x.s.learnedSkills = {};
    if (reason === 'unflagged') (x.c.skills.fire_bolt as any).allowPlagiarism = false;
    if (reason === 'zero') { x.s.buffs.sa_magicrod = { startsAt: 0, expiresAt: 1000, effects: {} }; x.s.combatEffects = { buffLevels: { sa_magicrod: 5 } }; }
    if (reason === 'miss') x.s.buffs.pf_fogwall = { expiresAt: 1000, effects: {} };
    if (reason === 'lethal') x.s.hp = 1;
    const end = advanceState(x.s, x.c, 250);
    expect(slot(end)).toBeUndefined();
    if (reason === 'lethal') expect(end.totals.deaths).toBe(1);
  });
  it('does not consume an extra random draw or pay points while capturing', () => {
    const a = rogueSetup(), b = rogueSetup(); b.s.learnedSkills = {};
    const copied = advanceState(a.s, a.c, 250), plain = advanceState(b.s, b.c, 250);
    expect(slot(copied)).toEqual({ skillId: 'fire_bolt', level: 3 });
    expect(copied.rngState).toBe(plain.rngState);
    expect(copied.hp).toBe(plain.hp); expect(copied.sp).toBe(plain.sp);
  });
  it('keeps the same copy level, replaces a different copy, and restores an own level', () => {
    const x = rogueSetup(); x.s.learnedSkills.fire_bolt = 1;
    let end = advanceState(x.s, x.c, 250);
    executeCommand(end, x.c, { type: 'setRotation', skillIds: ['fire_bolt'] }, 250);
    const own = { ...end.learnedSkills }, points = end.skillPoints;
    npcCopyCast({ ...x, s: end, e: end.battle!.enemies![0] }, 0, 9, 750);
    end = advanceState(end, x.c, 750);
    expect(slot(end)).toEqual({ skillId: 'fire_bolt', level: 3 });
    npcCopyCast({ ...x, s: end, e: end.battle!.enemies![0] }, 1, 2, 1000);
    end = advanceState(end, x.c, 1000);
    expect(slot(end)).toEqual({ skillId: 'cold_bolt', level: 2 });
    expect(end.rotation).toEqual(['fire_bolt']); // Own level remains available.
    expect(end.learnedSkills).toEqual(own); expect(end.skillPoints).toBe(points);
  });
  it('clears the old copy when incoming skill has a higher own paid level', () => {
    const x = rogueSetup(); (x.s as any).copiedSkill = { skillId: 'cold_bolt', level: 2 };
    x.s.rotation = ['cold_bolt']; x.s.learnedSkills.fire_bolt = 7;
    const end = advanceState(x.s, x.c, 250);
    expect(slot(end)).toBeUndefined(); expect(end.rotation).toEqual([]);
    expect(end.learnedSkills.fire_bolt).toBe(7);
  });
  it('casts the copied level at range with original SP, duration and hit count', () => {
    const x = rogueSetup(); x.s.stats.int = 30;
    let end = advanceState(x.s, x.c, 250);
    const enemy = end.battle!.enemies![0]; enemy.position = { x: 0.8, y: 0.5 }; enemy.approachFrom = { ...enemy.position }; enemy.arrivedAt = 250;
    executeCommand(end, x.c, { type: 'setRotation', skillIds: ['fire_bolt'] }, 250);
    end.battle!.playerNextSkillAt = end.battle!.playerActionReadyAt = 250;
    end.battle!.enemies![0].enemyNextAttackAt = 999999; end = advanceState(end, x.c, 500);
    expect(end.battle!.cast).toMatchObject({ skillId: 'fire_bolt', level: 3, startedAt: 250 });
    const deadline = end.battle!.cast!.endsAt, sp = end.sp;
    end = advanceState(end, x.c, Math.ceil(deadline / 250) * 250);
    expect(end.sp).toBe(sp - x.c.skills.fire_bolt.spCost[2]);
    expect(end.events.find(e => e.kind === 'damage' && e.sourceActorId === end.id && e.skillId === 'fire_bolt'))
      .toMatchObject({ skillLevel: 3, hitCount: 3, at: deadline });
    expect(end.learnedSkills.fire_bolt).toBeUndefined();
  });
  it('finishes an initiated uninterruptible cast snapshot after a new copy replaces it', () => {
    const x = rogueSetup(); x.c.skills.fire_bolt.interruptCast = false;
    let end = advanceState(x.s, x.c, 250);
    executeCommand(end, x.c, { type: 'setRotation', skillIds: ['fire_bolt'] }, 250);
    end.battle!.playerNextSkillAt = end.battle!.playerActionReadyAt = 250;
    end.battle!.enemies![0].enemyNextAttackAt = 999999; end = advanceState(end, x.c, 500);
    const cast = structuredClone(end.battle!.cast!);
    npcCopyCast({ ...x, s: end, e: end.battle!.enemies![0] }, 1, 2, 750);
    end = advanceState(end, x.c, 750);
    expect(slot(end)).toEqual({ skillId: 'cold_bolt', level: 2 });
    expect(end.rotation).toEqual([]); expect(end.battle!.cast).toEqual(cast);
    const sp = end.sp; end = advanceState(end, x.c, Math.ceil(cast.endsAt / 250) * 250);
    expect(end.sp).toBe(sp - x.c.skills.fire_bolt.spCost[2]);
    expect(end.events.find(e => e.kind === 'damage' && e.actionId === cast.actionId))
      .toMatchObject({ skillId: 'fire_bolt', skillLevel: 3 });
    expect(end.events.filter(e => e.kind === 'cast' && e.skillId === 'fire_bolt')).toHaveLength(1);
  });
  it('retains the durable copy through defeat', () => {
    const x = rogueSetup(); (x.s as any).copiedSkill = { skillId: 'cold_bolt', level: 2 }; x.s.hp = 1;
    const end = advanceState(x.s, x.c, 250);
    expect(end.totals.deaths).toBe(1); expect(slot(end)).toEqual({ skillId: 'cold_bolt', level: 2 });
  });
});
