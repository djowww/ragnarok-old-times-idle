import { describe, expect, it } from 'vitest';
import catalogJson from '../content/catalog.json';
import type { Battle, Catalog } from '../shared/types.js';
import { BATTLE_HERO } from '../shared/battleSpatial.js';
import { createInitialState } from '../engine/index.js';
import { executeCommand } from '../engine/commands.js';
import { beginBattle } from '../engine/encounters.js';
import { derivedStats } from '../engine/stats.js';

function setup(level = 1, falconEquipped = true) {
  const c = structuredClone(catalogJson) as unknown as Catalog;
  const skill = c.skills.ht_springtrap;
  const s = createInitialState(c, 0);
  s.job = 'hunter'; s.status = 'challenge';
  s.learnedSkills = { ht_removetrap: 1, ht_falcon: 1, ht_landmine: 1, [skill.id]: level };
  s.falconEquipped = falconEquipped;
  s.sp = derivedStats(s, c).maxSp;
  beginBattle(s, c, 1002, 0, 'mastering');
  s.battle!.playerNextAttackAt = s.battle!.playerNextSkillAt = 999999;
  return { c, s, skill };
}

function place(ctx: ReturnType<typeof setup>, id: string, cells: number, skillId = 'ht_landmine', overrides: Partial<NonNullable<Battle['traps']>[number]> = {}) {
  const trap: NonNullable<Battle['traps']>[number] = {
    id, skillId, level: 1, position: { x: BATTLE_HERO.x + cells / 12, y: BATTLE_HERO.y },
    placedAt: 0, nextTickAt: 999999, expiresAt: 30000, ...overrides,
  };
  ctx.s.battle!.traps = [...(ctx.s.battle!.traps ?? []), trap];
  return trap;
}

describe('Spring Trap', () => {
  it('exports the pinned level range, SP cost, Falcon requirement, and manual solo support', () => {
    const skill = (catalogJson as unknown as Catalog).skills.ht_springtrap;
    expect(skill).toMatchObject({
      implementation: 'supported', manualUse: 'springTrap', maxLevel: 5,
      spCost: [10, 10, 10, 10, 10], range: [4, 5, 6, 7, 8], requiredState: 'Falcon',
    });
  });

  it('springs the nearest active trap within learned range without returning a trap item', () => {
    const { c, s, skill } = setup(2);
    const nearest = place({ c, s, skill }, 'nearest', 4);
    place({ c, s, skill }, 'farther', 5);
    place({ c, s, skill }, 'outside', 6);
    const sp = s.sp;

    executeCommand(s, c, { type: 'useSkill', skillId: skill.id }, 0);

    expect(nearest.triggeredAt).toBe(0);
    expect(nearest.expiresAt).toBe(1500);
    expect(s.battle!.traps!.map(trap => trap.id)).toEqual(['nearest', 'farther', 'outside']);
    expect(s.inventory.find(item => item.itemId === 1065)).toBeUndefined();
    expect(s.sp).toBe(sp - 10);
    expect(s.events.some(event => event.kind === 'skill' && event.skillId === skill.id)).toBe(true);
  });

  it('rejects a trap outside the level range without spending SP', () => {
    const { c, s, skill } = setup(1);
    place({ c, s, skill }, 'out-of-range', 7);
    const sp = s.sp;

    expect(() => executeCommand(s, c, { type: 'useSkill', skillId: skill.id }, 0)).toThrowError(
      expect.objectContaining({ code: 'TRAP_UNAVAILABLE' }),
    );
    expect(s.battle!.traps!.map(trap => trap.id)).toEqual(['out-of-range']);
    expect(s.sp).toBe(sp);
  });

  it('requires the Falcon state and does not spring an occupied Ankle Snare', () => {
    const noFalcon = setup(5, false);
    place(noFalcon, 'mine', 1);
    const sp = noFalcon.s.sp;
    expect(() => executeCommand(noFalcon.s, noFalcon.c, { type: 'useSkill', skillId: noFalcon.skill.id }, 0)).toThrowError(
      expect.objectContaining({ code: 'TRAP_UNAVAILABLE' }),
    );
    expect(noFalcon.s.sp).toBe(sp);

    const captured = setup(5);
    place(captured, 'captured', 1, 'ht_anklesnare', { capturedEnemyId: 'enemy' });
    const capturedSp = captured.s.sp;
    expect(() => executeCommand(captured.s, captured.c, { type: 'useSkill', skillId: captured.skill.id }, 0)).toThrowError(
      expect.objectContaining({ code: 'TRAP_UNAVAILABLE' }),
    );
    expect(captured.s.battle!.traps!.map(trap => trap.id)).toEqual(['captured']);
    expect(captured.s.sp).toBe(capturedSp);
  });
});
