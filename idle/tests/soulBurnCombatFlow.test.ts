import { afterEach, describe, expect, it, vi } from 'vitest';
import rawCatalog from '../content/catalog.json';
import type { Catalog, Skill } from '../shared/types';
import { createInitialState, applyCommand } from '../engine';
import { beginBattle } from '../engine/encounters';
import { derivedStats } from '../engine/stats';
import * as stateTools from '../engine/state';
import { BATTLE_HERO } from '../shared/battleSpatial';
import { fixture } from './engine-fixture';

const catalog = rawCatalog as unknown as Catalog;
const sourceSkill = catalog.skills.pf_soulburn;
function setup(level = 5) {
  vi.spyOn(stateTools, 'random').mockReturnValue(0);
  const c = fixture();
  const skill: Skill = { ...structuredClone(sourceSkill), implementation: 'supported',
    kind: 'magical', damageType: 'magic', targetType: 'enemy', ignoreElement: true };
  Object.assign(skill, { manualUse: 'soulBurn' });
  c.skills[skill.id] = skill;
  c.classes.professor = { ...structuredClone(catalog.classes.professor), skills: [...new Set([...catalog.classes.professor.skills, skill.id])] };
  c.monsters[1191] = structuredClone(catalog.monsters[1191]);
  Object.assign(c.monsters[1191], { hp: 2000, maxSp: 182, mdef: 0,
    stats: { str: 0, agi: 1, vit: 0, int: 0, dex: 0, luk: 0 },
    attack: [0, 0], baseExp: 0, jobExp: 0, boss: false, canMove: false, drops: [] });
  const s = createInitialState(c, 0);
  s.job = 'professor'; s.baseLevel = 50; s.jobLevel = 50;
  s.learnedSkills = { [skill.id]: level }; s.rotation = [];
  s.status = 'challenge'; s.autoPotion = { hpThreshold: 0, spThreshold: 0 };
  s.hp = derivedStats(s, c).maxHp; s.sp = 500;
  beginBattle(s, c, 1191, 0, 'mastering');
  const enemy = s.battle!.enemies![0];
  Object.assign(enemy, { hp: 1000, position: { ...BATTLE_HERO }, approachFrom: { ...BATTLE_HERO },
    homePosition: { ...BATTLE_HERO }, startedAt: 0, arrivedAt: 0, hostile: false });
  s.battle!.targetId = enemy.id;
  s.battle!.playerNextAttackAt = s.battle!.playerNextSkillAt = s.battle!.playerActionReadyAt = 999999;
  return { c, s, skill, enemy };
}
const cast = (ctx: ReturnType<typeof setup>, at = 0) => applyCommand(ctx.s, ctx.c,
  { type: 'useSkill', skillId: ctx.skill.id, expectedEnemyId: ctx.enemy.id }, at);
afterEach(() => vi.restoreAllMocks());

describe('manual source-accurate Soul Burn', () => {
  it('on a level-five success deals twice target SP through MDEF, drains it, and pays 120 SP', () => {
    const ctx = setup(5), roll = vi.spyOn(stateTools, 'random').mockReturnValue(0.69);
    expect(ctx.enemy.sp).toBe(182);
    const next = cast(ctx);
    expect(next.sp).toBe(380);
    expect(next.battle!.enemies![0]).toMatchObject({ hp: 637, sp: 0 });
    expect(next.events.some(event => event.kind === 'damage' && event.skillId === ctx.skill.id && event.target === 'enemy')).toBe(true);
    expect(next.skillReadyAt[ctx.skill.id]).toBe(15000);
  });

  it('on a level-five failure attacks the caster using post-cost SP and drains all caster SP', () => {
    const ctx = setup(5); vi.spyOn(stateTools, 'random').mockReturnValue(0.70);
    const defense = derivedStats(ctx.s, ctx.c);
    const damage = Math.max(1, Math.trunc(760 * (100 - (defense.hardMdef ?? 0)) / 100) - (defense.softMdef ?? 0));
    const next = cast(ctx);
    expect(next.sp).toBe(0);
    expect(next.hp).toBe(Math.max(0, ctx.s.hp - damage));
    expect(next.battle!.enemies![0]).toMatchObject({ hp: 1000, sp: 182 });
    expect(next.events.some(event => event.kind === 'damage' && event.skillId === ctx.skill.id && event.target === 'player')).toBe(true);
  });

  it('rejects reuse one millisecond before cooldown and accepts at the boundary', () => {
    const ctx = setup(5);
    vi.spyOn(stateTools, 'random').mockReturnValue(0);
    const first = cast(ctx);
    expect(first.skillReadyAt[ctx.skill.id]).toBe(15000);
    expect(() => cast({ ...ctx, s: first }, 14999)).toThrow(/recarregamento/);
    const ready = cast({ ...ctx, s: first }, 15000);
    expect(ready.skillReadyAt[ctx.skill.id]).toBe(30000);
  });

  it.each([1, 2, 3, 4])('success at level %i drains target SP without damage', level => {
    const ctx = setup(level); vi.spyOn(stateTools, 'random').mockReturnValue(0);
    const next = cast(ctx);
    expect(next.sp).toBe(500 - [80, 90, 100, 110][level - 1]);
    expect(next.battle!.enemies![0]).toMatchObject({ hp: 1000, sp: 0 });
    expect(next.events.some(event => event.kind === 'damage' && event.skillId === ctx.skill.id)).toBe(false);
  });

  it.each([[1, 0.4], [2, 0.5], [3, 0.6], [4, 0.7]] as const)(
    'at level %i the source chance boundary fails without damage and drains caster SP', (level, rollPct) => {
      const ctx = setup(level);
      vi.spyOn(stateTools, 'random').mockReturnValue(rollPct);
      const hpBefore = ctx.s.hp;
      const next = cast(ctx);
      expect(next.sp).toBe(0);
      expect(next.hp).toBe(hpBefore);
      expect(next.battle!.enemies![0]).toMatchObject({ hp: 1000, sp: 182 });
      expect(next.events.some(event => event.kind === 'damage' && event.skillId === ctx.skill.id)).toBe(false);
    },
  );

  it('is excluded from automatic rotations because failed casts can hurt the caster', () => {
    const ctx = setup();
    expect(() => applyCommand(ctx.s, ctx.c, { type: 'setRotation', skillIds: [ctx.skill.id] }, 500)).toThrow();
  });
});
