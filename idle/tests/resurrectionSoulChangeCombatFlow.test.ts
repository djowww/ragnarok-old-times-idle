import { afterEach, describe, expect, it, vi } from 'vitest';
import rawCatalog from '../content/catalog.json';
import type { Catalog, GameState, Skill } from '../shared/types';
import { createInitialState, advanceState, applyCommand } from '../engine';
import { beginBattle } from '../engine/encounters';
import { classicMagicDamage } from '../engine/classic';
import { derivedStats } from '../engine/stats';
import * as stateTools from '../engine/state';
import { BATTLE_HERO } from '../shared/battleSpatial';
import { offensiveSkill, skillTargetInRange } from '../shared/combatRange';
import { fixture } from './engine-fixture';

const catalog = rawCatalog as unknown as Catalog;
const sourceSkill = (name: string) => Object.values(catalog.skills).find(skill => skill.sourceName === name)!;
function setup(source: 'ALL_RESURRECTION' | 'PF_SOULCHANGE', level = source === 'ALL_RESURRECTION' ? 4 : 1) {
  vi.spyOn(stateTools, 'random').mockReturnValue(0);
  const c = fixture(), jobId = source === 'ALL_RESURRECTION' ? 'priest' : 'professor';
  const skill: Skill = { ...structuredClone(sourceSkill(source)), implementation: 'supported',
    ...(source === 'ALL_RESURRECTION' && { kind: 'magical', damageType: 'magic', targetType: 'enemy', ignoreDefense: false }) };
  c.skills[skill.id] = skill;
  c.classes[jobId] = { ...structuredClone(catalog.classes[jobId]), hp: Array(99).fill(2000),
    // Keep the fixture above the 50% regeneration limit, below the 90% attack limit.
    sp: Array(99).fill(1000), jobBonuses: {}, baseWeight: 45, skills: [skill.id] };
  c.items[717] = structuredClone(catalog.items[717]);
  c.elementModifiers = { holy: { undead: [100] } };
  Object.assign(c.monsters[1002], { hp: 2000, attack: [0, 0], baseExp: 0, jobExp: 0,
    stats: { str: 0, agi: 1000, vit: 20, int: 10, dex: 0, luk: 0 }, def: 0, mdef: 20,
    element: 'undead', race: 'undead', boss: false, canMove: false, drops: [] });
  const s = createInitialState(c, 0);
  s.job = jobId; s.baseLevel = 50; s.jobLevel = 50;
  s.stats = { str: 0, agi: 1, vit: 0, int: source === 'ALL_RESURRECTION' ? 30 : 0, dex: 0, luk: 10 };
  s.learnedSkills = { [skill.id]: level }; s.rotation = [skill.id];
  s.status = 'challenge'; s.autoPotion = { hpThreshold: 0, spThreshold: 0 };
  s.hp = derivedStats(s, c).maxHp; s.sp = source === 'ALL_RESURRECTION' ? 200 : 100;
  stateTools.addItem(s, c, 717, 3);
  beginBattle(s, c, 1002, 0, 'mastering');
  const enemy = s.battle!.enemies![0];
  const position = { x: BATTLE_HERO.x + 1 / 12, y: BATTLE_HERO.y };
  Object.assign(enemy, { hp: 1000, position, approachFrom: { ...position }, homePosition: { ...position },
    startedAt: 0, arrivedAt: 0, enemyNextAttackAt: 999999, hostile: false });
  s.battle!.targetId = enemy.id; s.battle!.playerNextAttackAt = 999999;
  s.battle!.playerNextSkillAt = s.battle!.playerActionReadyAt = 1000;
  return { c, s, skill, enemy };
}
const gemCount = (s: GameState) => s.inventory.filter(item => item.itemId === 717).reduce((sum, item) => sum + item.quantity, 0);
const flag = (s: GameState) => (s.battle?.enemies?.[0] as { soulChangeUsed?: boolean } | undefined)?.soulChangeUsed;
const castAt = (ctx: ReturnType<typeof setup>) => advanceState(ctx.s, ctx.c, 1000);
afterEach(() => vi.restoreAllMocks());

describe('source solo Resurrection and Soul Change integration', () => {
  it('checks the nine-cell range of friendly Soul Change without making it offensive', () => {
    const { c, s, skill, enemy } = setup('PF_SOULCHANGE');
    expect(offensiveSkill(skill)).toBe(false);
    enemy.position = { x: BATTLE_HERO.x + 9 / 12, y: BATTLE_HERO.y };
    expect(skillTargetInRange(s, c, skill, 1, enemy, 1000)).toBe(true);
    enemy.position = { x: BATTLE_HERO.x + 11 / 12, y: BATTLE_HERO.y };
    expect(skillTargetInRange(s, c, skill, 1, enemy, 1000)).toBe(false);
    expect(skillTargetInRange(s, c, { ...skill, sourceName: 'PR_IMPOSITIO', targetType: 'self' }, 1, enemy, 1000)).toBe(true);
  });
  it.each([1, 2, 3, 4])('retains Resurrection level %i cast and aftercast timing', level => {
    const ctx = setup('ALL_RESURRECTION', level), start = castAt(ctx);
    const duration = [6000, 4000, 2000, 0][level - 1], delay = [0, 1000, 2000, 3000][level - 1];
    if (duration) expect(start.battle?.cast).toMatchObject({ skillId: ctx.skill.id, startedAt: 1000, endsAt: 1000 + duration });
    const end = duration ? advanceState(start, ctx.c, 1000 + duration) : start;
    expect(end.sp).toBe(140); expect(gemCount(end)).toBe(2);
    expect(end.battle?.playerActionReadyAt).toBeGreaterThanOrEqual(1000 + duration + delay);
    expect(end.events.filter(event => event.kind === 'damage' && event.skillId === ctx.skill.id)).toHaveLength(1);
  });
  it.each(['element', 'sp', 'gem'] as const)('does not start Resurrection with invalid %s', invalid => {
    const ctx = setup('ALL_RESURRECTION', 1);
    if (invalid === 'element') ctx.c.monsters[1002].element = 'neutral';
    if (invalid === 'sp') ctx.s.sp = 59;
    if (invalid === 'gem') ctx.s.inventory = ctx.s.inventory.filter(item => item.itemId !== 717);
    expect(castAt(ctx).battle?.cast).toBeUndefined();
  });
  it('uses the single source roll, MDEF and Holy element without MATK amplification', () => {
    const { c, skill } = setup('ALL_RESURRECTION');
    const stats = { attack: 0, magicAttack: [9999, 19999] as [number, number], baseLevel: 50, int: 30, luk: 10,
      targetHp: 1000, targetIsBoss: false, magicPowerPercent: 50, elementMultiplier: 1 };
    const rng = vi.fn(() => 0);
    expect(classicMagicDamage(stats, c.monsters[1002], skill, 4, rng)).toBe(780);
    expect(rng).toHaveBeenCalledTimes(1);
    expect(classicMagicDamage(stats, c.monsters[1002], skill, 4, () => .999)).toBe(76);
    expect(classicMagicDamage({ ...stats, targetIsBoss: true }, c.monsters[1002], skill, 4, () => 0)).toBe(76);
    const absorbed = vi.fn(() => 0);
    expect(classicMagicDamage({ ...stats, elementMultiplier: 0 }, c.monsters[1002], skill, 4, absorbed)).toBe(0);
    expect(absorbed).toHaveBeenCalledTimes(1);
  });
  it('bypasses physical flee and keeps a mitigated successful execution target alive', () => {
    const ctx = setup('ALL_RESURRECTION'), end = castAt(ctx);
    expect(end.battle?.enemies?.[0].hp).toBe(220);
    expect(end.events.find(event => event.kind === 'damage' && event.skillId === ctx.skill.id)?.amount).toBe(780);
    expect(end.buffs[ctx.skill.id]).toBeUndefined();
  });
  it('uses the real boss flag, not the presence of a challenge identifier', () => {
    const ctx = setup('ALL_RESURRECTION'); ctx.c.monsters[1002].boss = true;
    expect(castAt(ctx).battle?.enemies?.[0].hp).toBe(924);
  });
  it.each(['element', 'range', 'dead', 'removed'] as const)('revalidates Resurrection %s before payment at cast end', invalid => {
    const ctx = setup('ALL_RESURRECTION', 3), start = castAt(ctx);
    expect(start.battle?.cast).toBeTruthy();
    const target = start.battle!.enemies![0];
    if (invalid === 'element') ctx.c.monsters[1002].element = 'neutral';
    if (invalid === 'range') target.position = target.approachFrom = { x: BATTLE_HERO.x + 11 / 12, y: BATTLE_HERO.y };
    if (invalid === 'dead') target.hp = 0;
    if (invalid === 'removed') start.battle!.enemies = [{ ...target, id: 'replacement' }];
    const end = advanceState(start, ctx.c, 3000);
    expect(end.sp).toBe(200); expect(gemCount(end)).toBe(3);
    expect(end.events.filter(event => event.kind === 'damage' && event.skillId === ctx.skill.id)).toHaveLength(0);
  });
  it('recovers three percent once per monster, pays once and retains the five-second delay', () => {
    const ctx = setup('PF_SOULCHANGE'), start = castAt(ctx);
    expect(start.battle?.cast).toMatchObject({ startedAt: 1000, endsAt: 4000 });
    const end = advanceState(start, ctx.c, 4000);
    expect(end.sp).toBe(125); expect(flag(end)).toBe(true);
    expect(end.battle?.playerActionReadyAt).toBe(9000);
    expect(end.battle?.enemies?.[0]).toMatchObject({ hp: 1000, hostile: false });
    expect(end.buffs[ctx.skill.id]).toBeUndefined();
    expect(end.events.some(event => event.kind === 'damage' && event.skillId === ctx.skill.id)).toBe(false);
    end.battle!.supportNeedsOffense = false;
    expect(advanceState(end, ctx.c, 10000).sp).toBe(125);
  });
  it('caps recovery at max SP and skips full or useless recovery in AFK decisions', () => {
    const ctx = setup('PF_SOULCHANGE'); ctx.s.sp = 998;
    expect(advanceState(castAt(ctx), ctx.c, 4000).sp).toBe(1000);
    ctx.s.sp = 1000; expect(castAt(ctx).battle?.cast).toBeUndefined();
    const small = setup('PF_SOULCHANGE'); small.c.classes.professor.sp = Array(99).fill(100); small.s.sp = 50;
    expect(castAt(small).battle?.cast).toBeUndefined();
  });
  it.each(['boss', 'used', 'sp'] as const)('does not start Soul Change on invalid %s', invalid => {
    const ctx = setup('PF_SOULCHANGE');
    if (invalid === 'boss') ctx.c.monsters[1002].boss = true;
    if (invalid === 'used') Object.assign(ctx.enemy, { soulChangeUsed: true });
    if (invalid === 'sp') ctx.s.sp = 4;
    expect(castAt(ctx).battle?.cast).toBeUndefined();
  });
  it.each(['boss', 'used', 'range', 'dead', 'removed'] as const)('revalidates Soul Change %s before payment at cast end', invalid => {
    const ctx = setup('PF_SOULCHANGE'), start = castAt(ctx);
    expect(start.battle?.cast).toBeTruthy();
    const target = start.battle!.enemies![0];
    if (invalid === 'boss') ctx.c.monsters[1002].boss = true;
    if (invalid === 'used') Object.assign(target, { soulChangeUsed: true });
    if (invalid === 'range') target.position = target.approachFrom = { x: BATTLE_HERO.x + 11 / 12, y: BATTLE_HERO.y };
    if (invalid === 'dead') target.hp = 0;
    if (invalid === 'removed') start.battle!.enemies = [{ ...target, id: 'replacement' }];
    const end = advanceState(start, ctx.c, 4000);
    expect(end.sp).toBe(100); expect(end.buffs[ctx.skill.id]).toBeUndefined();
    if (invalid !== 'used') expect(flag(end)).not.toBe(true);
  });
  it('persists usage through JSON and keeps another instance of the same species eligible', () => {
    const ctx = setup('PF_SOULCHANGE'), end = advanceState(castAt(ctx), ctx.c, 4000);
    const restored = JSON.parse(JSON.stringify(end)) as GameState;
    restored.battle!.supportNeedsOffense = false;
    expect(advanceState(restored, ctx.c, 9000).battle?.cast).toBeUndefined();
    const fresh = { ...restored.battle!.enemies![0], id: 'new-instance' };
    delete (fresh as { soulChangeUsed?: boolean }).soulChangeUsed;
    restored.battle!.enemies = [fresh]; restored.battle!.targetId = fresh.id;
    expect(advanceState(restored, ctx.c, 9000).battle?.cast?.targetId).toBe(fresh.id);
  });
  it('produces the same effect when time is advanced in smaller chunks', () => {
    const ctx = setup('PF_SOULCHANGE'), one = advanceState(ctx.s, ctx.c, 4000);
    let chunks = structuredClone(ctx.s);
    for (let at = 250; at <= 4000; at += 250) chunks = advanceState(chunks, ctx.c, at);
    expect({ sp: chunks.sp, flag: flag(chunks), events: chunks.events }).toEqual({ sp: one.sp, flag: flag(one), events: one.events });
  });
  it.each(['ALL_RESURRECTION', 'PF_SOULCHANGE'] as const)('interrupts %s before paying or applying effects', source => {
    const ctx = setup(source, 1), start = castAt(ctx);
    // The zero roll used for Resurrection would trigger the player's lucky dodge.
    vi.mocked(stateTools.random).mockReturnValue(.5);
    Object.assign(ctx.c.monsters[1002], { attack: [100, 100], stats: { str: 0, agi: 0, vit: 0, int: 0, dex: 1000, luk: 0 } });
    Object.assign(start.battle!.enemies![0], { hostile: true, enemyNextAttackAt: 1250 });
    const end = advanceState(start, ctx.c, 1500);
    expect(end.events.some(event => event.kind === 'cast-interrupted' && event.skillId === ctx.skill.id)).toBe(true);
    expect(end.battle?.cast).toBeUndefined(); expect(end.sp).toBe(ctx.s.sp);
    expect(gemCount(end)).toBe(3); expect(flag(end)).not.toBe(true);
  });
  it('credits a valid Resurrection kill once through the normal kill pipeline', () => {
    const ctx = setup('ALL_RESURRECTION');
    ctx.enemy.hp = 100; ctx.c.monsters[1002].mdef = 0; ctx.c.monsters[1002].stats.int = ctx.c.monsters[1002].stats.vit = 0;
    vi.mocked(stateTools.random).mockReturnValue(.5); // Take the source's lower, non-HP damage branch past soft MDEF.
    const end = castAt(ctx);
    expect(end.totals.kills).toBe(1);
    expect(end.events.filter(event => event.kind === 'kill' && event.enemyId === ctx.enemy.id)).toHaveLength(1);
    expect(gemCount(end)).toBe(2); expect(end.sp).toBe(140);
    expect(advanceState(end, ctx.c, 2000).totals.kills).toBe(1);
  });
  it('preserves a used field instance while sitting and creates an eligible new respawn', () => {
    const ctx = setup('PF_SOULCHANGE'), end = advanceState(castAt(ctx), ctx.c, 4000);
    const enemy = end.battle!.enemies![0]; enemy.fieldSlot = 0; enemy.engaged = true;
    end.status = 'hunting'; end.areaId = 'prontera'; delete end.battle!.challengeId;
    end.fieldPopulation = { areaId: 'prontera', generation: 1, enemies: [structuredClone(enemy)], respawns: [] };
    const sitting = applyCommand(end, ctx.c, { type: 'rest' }, 4000);
    const later = advanceState(JSON.parse(JSON.stringify(sitting)), ctx.c, 4500);
    expect(later.fieldPopulation?.enemies.find(candidate => candidate.id === enemy.id)?.soulChangeUsed).toBe(true);
    const slot = later.fieldPopulation!.enemies.find(candidate => candidate.id === enemy.id)!.fieldSlot!;
    later.fieldPopulation!.enemies = later.fieldPopulation!.enemies.filter(candidate => candidate.id !== enemy.id);
    later.fieldPopulation!.respawns.push({ slot, at: 4750 });
    const respawned = advanceState(later, ctx.c, 5000);
    const fresh = respawned.fieldPopulation!.enemies.find(candidate => candidate.fieldSlot === slot)!;
    expect(fresh.id).not.toBe(enemy.id); expect(fresh.soulChangeUsed).toBeUndefined();
  });
  it.each([['all_resurrection', 'priest'], ['pf_soulchange', 'professor']] as const)('learns %s through its real prerequisites without granting parent effects', (id, job) => {
    const c = structuredClone(catalog); let s = createInitialState(c, 0);
    Object.assign(s, { job, jobLevel: 50, skillPoints: 1000, learnedSkills: {}, rotation: [] });
    function learn(skillId: string, level: number) {
      const skill = c.skills[skillId];
      for (const requirement of skill.prerequisitesByClass?.[job] ?? skill.prerequisites ?? []) learn(requirement.skillId, requirement.level);
      while ((s.learnedSkills[skillId] ?? 0) < level) s = applyCommand(s, c, { type: 'learnSkill', skillId }, 0);
    }
    const parent = id === 'all_resurrection' ? 'pr_strecovery' : 'sa_magicrod';
    expect(() => applyCommand(s, c, { type: 'learnSkill', skillId: id }, 0)).toThrow();
    learn(id, 1);
    expect(s.learnedSkills[id]).toBe(1);
    if (parent === 'pr_strecovery') {
      expect(c.skills[parent].implementation).toBe('supported');
      expect(applyCommand(s, c, { type: 'setRotation', skillIds: [parent] }, 0).rotation).toEqual([parent]);
    } else {
      expect(c.skills[parent].implementation).toBe('supported');
      expect(applyCommand(s, c, { type: 'setRotation', skillIds: [parent] }, 0).rotation).toEqual([parent]);
    }
    expect(applyCommand(s, c, { type: 'setRotation', skillIds: [id] }, 0).rotation).toEqual([id]);
    expect(s.buffs[parent]).toBeUndefined();
  });
});
