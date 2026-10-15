import { afterEach, describe, expect, it, vi } from 'vitest';
import rawCatalog from '../content/catalog.json';
import type { Catalog, Monster, Skill } from '../shared/types';
import { createInitialState, advanceState } from '../engine';
import { beginBattle, playerWalkSpeed } from '../engine/encounters';
import { classicPhysicalDamage } from '../engine/classic';
import * as stateTools from '../engine/state';
import { BATTLE_HERO, enemyPositionAt } from '../shared/battleSpatial';
import { cellPoint } from '../engine/groundSolo';
import { fixture } from './engine-fixture';

const catalog = rawCatalog as unknown as Catalog;
const sourceSkill = (name: string) => Object.values(catalog.skills).find(skill => skill.sourceName === name)!;
function setup() {
  vi.spyOn(stateTools, 'random').mockReturnValue(0);
  const c = fixture();
  for (const name of ['KN_BRANDISHSPEAR', 'KN_RIDING', 'KN_CAVALIERMASTERY', 'KN_SPEARMASTERY', 'AL_INCAGI', 'MO_STEELBODY', 'CR_DEFENDER']) {
    const skill = sourceSkill(name);
    c.skills[skill.id] = { ...structuredClone(skill), implementation: 'supported' };
    c.classes.knight.skills.push(skill.id);
  }
  c.items[1401] = structuredClone(catalog.items[1401]);
  c.sizeModifiers = { spear: { small: 75, medium: 75, large: 100 } };
  Object.assign(c.monsters[1002], { hp: 100000, attack: [0, 0], baseExp: 0, jobExp: 0,
    stats: { str: 0, agi: 0, vit: 0, int: 0, dex: 0, luk: 0 }, def: 0, size: 'medium', element: 'neutral', boss: false, canMove: false });
  const s = createInitialState(c, 0);
  s.job = 'knight'; s.mounted = true;
  s.stats.str = 40;
  s.learnedSkills[sourceSkill('KN_RIDING').id] = 1;
  s.learnedSkills[sourceSkill('KN_CAVALIERMASTERY').id] = 5;
  stateTools.addItem(s, c, 1401, 1);
  s.equipment.weapon = s.inventory.find(item => item.itemId === 1401)!.uid;
  s.status = 'challenge'; s.autoPotion = { hpThreshold: 0, spThreshold: 0 };
  s.sp = 50; s.hp = 100;
  const skill = c.skills[sourceSkill('KN_BRANDISHSPEAR').id];
  s.rotation = [skill.id]; s.learnedSkills[skill.id] = 10;
  beginBattle(s, c, 1002, 0, 'mastering');
  const enemy = s.battle!.enemies![0];
  Object.assign(enemy, { position: cellPoint({ x: 7, y: 7 }), approachFrom: cellPoint({ x: 7, y: 7 }),
    homePosition: cellPoint({ x: 7, y: 7 }), startedAt: 0, arrivedAt: 0, enemyNextAttackAt: 999999 });
  s.battle!.targetId = enemy.id; s.battle!.playerNextAttackAt = s.battle!.playerNextSkillAt = 1000;
  return { c, s, skill, enemy };
}
afterEach(() => vi.restoreAllMocks());

describe('mounted Hercules combat integration', () => {
  it('stacks Riding speed with Increase Agility but retains Steel Body and Defender limits', () => {
    const { c, s } = setup();
    expect(playerWalkSpeed(s, c, 0)).toBe(112);
    const agility = sourceSkill('AL_INCAGI');
    s.buffs[agility.id] = { expiresAt: 5000, effects: {} };
    expect(playerWalkSpeed(s, c, 0)).toBe(75);
    s.buffs[sourceSkill('MO_STEELBODY').id] = { expiresAt: 5000, effects: {} };
    expect(playerWalkSpeed(s, c, 0)).toBe(200);
    delete s.buffs[sourceSkill('MO_STEELBODY').id];
    s.buffs[sourceSkill('CR_DEFENDER').id] = { expiresAt: 5000, effects: {} };
    s.learnedSkills[sourceSkill('CR_DEFENDER').id] = 5;
    expect(playerWalkSpeed(s, c, 0)).toBe(200);
    s.mounted = false; delete s.buffs[agility.id]; delete s.buffs[sourceSkill('CR_DEFENDER').id];
    expect(playerWalkSpeed(s, c, 0)).toBe(150);
  });
  it('does not start Brandish while unmounted, or with an incompatible weapon', () => {
    const { c, s, skill } = setup(); s.mounted = false;
    const unmounted = advanceState(s, c, 1000);
    expect(unmounted.battle?.cast).toBeUndefined();
    expect(unmounted.events.some(event => event.kind === 'cast' && event.skillId === skill.id)).toBe(false);
    expect(unmounted.sp).toBe(50);
    const mounted = setup();
    mounted.s.equipment.weapon = mounted.s.inventory.find(item => item.itemId === 1201)!.uid;
    expect(advanceState(mounted.s, mounted.c, 1000).battle?.cast).toBeUndefined();
  });
  it.each(['mount', 'weapon'] as const)('rechecks %s at cast completion before spending SP', invalid => {
    const { c, s, skill } = setup();
    const casting = advanceState(s, c, 1000);
    expect(casting.battle?.cast).toMatchObject({ skillId: skill.id, endsAt: 1695 });
    if (invalid === 'mount') casting.mounted = false;
    else casting.equipment.weapon = casting.inventory.find(item => item.itemId === 1201)!.uid;
    const finished = advanceState(casting, c, 1750);
    expect(finished.sp).toBe(50);
    expect(finished.events.filter(event => event.kind === 'damage' && event.skillId === skill.id)).toHaveLength(0);
  });
  it('uses target-anchored bands, not radial splash; pays once and retains visible weapon metadata', () => {
    const { c, s, enemy, skill } = setup();
    const extra = (id: string, x: number, y: number) => ({ ...structuredClone(enemy), id,
      position: cellPoint({ x, y }), approachFrom: cellPoint({ x, y }), homePosition: cellPoint({ x, y }) });
    s.battle!.enemies!.push(extra('band2', 8, 7), extra('band3', 9, 7), extra('band4', 10, 7),
      extra('behind', 5, 7), extra('outside', 8, 10), extra('edge1', 7, 9));
    const casting = advanceState(s, c, 1000);
    const finished = advanceState(casting, c, 1750);
    const hits = finished.events.filter(event => event.kind === 'damage' && event.skillId === skill.id);
    expect(hits.map(hit => hit.enemyId).sort()).toEqual([enemy.id, 'band2', 'band3', 'band4', 'edge1'].sort());
    expect(finished.sp).toBe(38);
    for (const hit of hits) expect(hit).toMatchObject({ hitCount: 1, actorAction: 'attack', actionStartedAt: 1695 });
    const value = (id: string) => hits.find(hit => hit.enemyId === id)!.amount!;
    expect(value(enemy.id)).toBe(value('edge1'));
    expect(value(enemy.id)).toBeGreaterThan(value('band2'));
    expect(value('band2')).toBeGreaterThan(value('band3'));
    expect(value('band3')).toBeGreaterThan(value('band4'));
  });
  it('pushes survivors three source cells away from caster and preserves boss/map/monster immunity', () => {
    const { c, s, enemy } = setup();
    const finish = (state = s) => advanceState(advanceState(state, c, 1000), c, 1750);
    expect(enemyPositionAt(finish().battle!.enemies![0], 1695)).toEqual(cellPoint({ x: 10, y: 7 }));
    for (const immunity of ['boss', 'monster', 'map'] as const) {
      const ctx = setup();
      if (immunity === 'boss') ctx.c.monsters[1002].boss = true;
      if (immunity === 'monster') ctx.c.monsters[1002].noKnockback = true;
      if (immunity === 'map') { ctx.s.areaId = ctx.c.areas[0].id; ctx.c.areas[0].noKnockback = true; }
      const next = advanceState(advanceState(ctx.s, ctx.c, 1000), ctx.c, 1750);
      expect(enemyPositionAt(next.battle!.enemies![0], 1695)).toEqual(enemy.position);
    }
  });
  it('uses mounted large spear correction against medium targets on basic attacks', () => {
    const ctx = setup(); ctx.s.rotation = [];
    ctx.enemy.position = ctx.enemy.approachFrom = { ...BATTLE_HERO };
    ctx.enemy.homePosition = { ...BATTLE_HERO };
    ctx.s.stats.dex = 99; ctx.s.stats.luk = 0;
    const unmounted = structuredClone(ctx.s); unmounted.mounted = false;
    const value = (mounted: boolean) => advanceState(mounted ? ctx.s : unmounted, ctx.c, 1000).events
      .find(event => event.kind === 'damage' && event.target === 'enemy')!.amount!;
    expect(value(true)).toBeGreaterThan(value(false));
  });
  it('does not push a living target when its element absorbs Brandish damage', () => {
    const { c, s, enemy, skill } = setup();
    c.elementModifiers = structuredClone(catalog.elementModifiers);
    Object.assign(c.monsters[1002], { element: 'ghost', elementLevel: 3 });
    const next = advanceState(advanceState(s, c, 1000), c, 1750);
    expect(next.events.find(event => event.kind === 'damage' && event.skillId === skill.id)?.amount).toBe(0);
    expect(enemyPositionAt(next.battle!.enemies![0], 1750)).toEqual(enemy.position);
  });
});

describe('literal mounted spear arithmetic', () => {
  const monster: Monster = { ...catalog.monsters[1002], def: 0, stats: { str: 0, agi: 0, vit: 0, int: 0, dex: 0, luk: 0 }, size: 'medium', race: 'formless' };
  const skill: Skill = { ...sourceSkill('KN_BRANDISHSPEAR'), implementation: 'supported' };
  it.each([[1, 561], [2, 524], [3, 449], [4, 299]] as const)('applies level10 area flag %i without duplicated hits', (brandishArea, expected) => {
    expect(classicPhysicalDamage({ attack: 100, magicAttack: [0, 0], brandishArea }, monster, skill, 10, () => 0)).toBe(expected);
  });
  it('adds five instead of four attack per Spear Mastery level only when mounted', () => {
    const stats = { attack: 100, magicAttack: [0, 0] as [number, number], weaponType: 'spear' as const,
      skillLevelsBySource: { KN_SPEARMASTERY: 10 } };
    expect(classicPhysicalDamage({ ...stats, mounted: true }, monster, undefined, 1, () => 0)).toBe(149);
    expect(classicPhysicalDamage({ ...stats, mounted: false }, monster, undefined, 1, () => 0)).toBe(139);
  });
});
