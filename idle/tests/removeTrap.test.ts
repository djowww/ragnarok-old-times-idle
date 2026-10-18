import { describe, expect, it } from 'vitest';
import catalogJson from '../content/catalog.json';
import type { Battle, Catalog } from '../shared/types.js';
import { BATTLE_HERO } from '../shared/battleSpatial.js';
import { createInitialState } from '../engine/index.js';
import { executeCommand } from '../engine/commands.js';
import { beginBattle } from '../engine/encounters.js';
import { derivedStats } from '../engine/stats.js';

function setup() {
  const c = structuredClone(catalogJson) as unknown as Catalog;
  const skill = c.skills.ht_removetrap;
  Object.assign(skill, { implementation: 'supported', manualUse: 'removeTrap' });
  const s = createInitialState(c, 0);
  s.job = 'hunter';
  s.status = 'challenge';
  s.learnedSkills = { [skill.id]: 1 };
  s.rotation = [];
  s.sp = derivedStats(s, c).maxSp;
  beginBattle(s, c, 1002, 0, 'mastering');
  s.battle!.playerNextAttackAt = s.battle!.playerNextSkillAt = 999999;
  return { c, s, skill };
}
function place(ctx: ReturnType<typeof setup>, id: string, x: number, y: number, overrides: Partial<NonNullable<Battle['traps']>[number]> = {}) {
  const trap: NonNullable<Battle['traps']>[number] = {
    id, skillId: 'ht_anklesnare', level: 5, position: { x, y },
    placedAt: 0, nextTickAt: 999999, expiresAt: 30000, ...overrides,
  };
  ctx.s.battle!.traps = [...(ctx.s.battle!.traps ?? []), trap];
  return trap;
}

describe('Remove Trap', () => {
  it('removes the nearest active Hunter trap within range 2, returns the unspent reagent, and spends 5 SP', () => {
    const ctx = setup();
    place(ctx, 'near', BATTLE_HERO.x + 1 / 12, BATTLE_HERO.y);
    place(ctx, 'farther', BATTLE_HERO.x + 2 / 12, BATTLE_HERO.y);
    const before = ctx.s.sp;
    executeCommand(ctx.s, ctx.c, { type: 'useSkill', skillId: ctx.skill.id }, 0);
    expect(ctx.s.battle!.traps!.map(trap => trap.id)).toEqual(['farther']);
    expect(ctx.s.inventory.find(item => item.itemId === 1065)?.quantity).toBe(1);
    expect(ctx.s.sp).toBe(before - 5);
  });

  it('does not remove or charge for a trap outside Hercules range 2', () => {
    const ctx = setup();
    place(ctx, 'too-far', BATTLE_HERO.x + 4 / 12, BATTLE_HERO.y);
    const before = ctx.s.sp;
    expect(() => executeCommand(ctx.s, ctx.c, { type: 'useSkill', skillId: ctx.skill.id }, 0))
      .toThrowError(expect.objectContaining({ code: 'TRAP_UNAVAILABLE' }));
    expect(ctx.s.battle!.traps!.map(trap => trap.id)).toEqual(['too-far']);
    expect(ctx.s.sp).toBe(before);
  });

  it('releases an Ankle Snare capture and does not refund its consumed reagent', () => {
    const ctx = setup();
    place(ctx, 'captured', BATTLE_HERO.x + 1 / 12, BATTLE_HERO.y, { capturedEnemyId: 'captured-enemy', triggeredAt: 10 });
    const enemy = ctx.s.battle!.enemies![0];
    enemy.id = 'captured-enemy';
    enemy.statuses = { SC_ANKLESNARE: { expiresAt: 5000, level: 5 } };
    enemy.approachPausedAt = 10;
    const before = ctx.s.sp;
    executeCommand(ctx.s, ctx.c, { type: 'useSkill', skillId: ctx.skill.id }, 20);
    expect(ctx.s.battle!.traps).toEqual([]);
    expect(enemy.statuses.SC_ANKLESNARE).toBeUndefined();
    expect(enemy.approachPausedAt).toBeUndefined();
    expect(ctx.s.inventory.find(item => item.itemId === 1065)).toBeUndefined();
    expect(ctx.s.sp).toBe(before - 5);
  });
});
