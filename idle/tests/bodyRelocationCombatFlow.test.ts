import { afterEach, describe, expect, it, vi } from 'vitest';
import rawCatalog from '../content/catalog.json';
import type { Catalog, Skill } from '../shared/types';
import { advanceState, createInitialState } from '../engine';
import { beginBattle } from '../engine/encounters';
import { sphereCostForSkill } from '../engine/classicBuffs';
import { derivedStats } from '../engine/stats';
import { BATTLE_HERO } from '../shared/battleSpatial';
import { skillTargetInRange } from '../shared/combatRange';
import * as stateTools from '../engine/state';
import { fixture } from './engine-fixture';

const sourceCatalog = rawCatalog as unknown as Catalog;
const sourceSkill = (source: string) => Object.values(sourceCatalog.skills).find(skill => skill.sourceName === source)!;

function setup(distanceCells = 12, spheres = 1) {
  vi.spyOn(stateTools, 'random').mockReturnValue(0);
  const c = fixture();
  const relocation: Skill = { ...structuredClone(sourceSkill('MO_BODYRELOCATION')), implementation: 'supported' };
  c.skills[relocation.id] = relocation;
  const explosion = structuredClone(sourceSkill('MO_EXPLOSIONSPIRITS'));
  c.skills[explosion.id] = { ...explosion, implementation: 'supported' };
  const extremityFist = structuredClone(sourceSkill('MO_EXTREMITYFIST'));
  c.skills[extremityFist.id] = { ...extremityFist, implementation: 'supported' };
  c.classes.monk = { ...structuredClone(c.classes.novice), id: 'monk', family: 'monk',
    skills: [relocation.id, explosion.id, extremityFist.id] };
  Object.assign(c.monsters[1002], { hp: 100000, attack: [0, 0], attackDelay: 100000, baseExp: 0, jobExp: 0,
    aggressive: false, drops: [] });

  const s = createInitialState(c, 0);
  s.job = 'monk';
  s.status = 'hunting';
  s.areaId = 'prontera';
  s.sp = derivedStats(s, c).maxSp;
  s.autoPotion = { hpThreshold: 0, spThreshold: 0 };
  s.learnedSkills = { [relocation.id]: 1, [extremityFist.id]: 5 };
  s.rotation = [relocation.id];
  s.combatEffects = { spiritSpheres: spheres };
  beginBattle(s, c, 1002, 0);
  const target = s.battle!.enemies![0];
  const point = { x: BATTLE_HERO.x + distanceCells / 12, y: BATTLE_HERO.y };
  Object.assign(target, { hp: 100000, position: point, approachFrom: { ...point }, startedAt: 0, arrivedAt: 0,
    hostile: false, engaged: false, enemyNextAttackAt: 100000 });
  s.battle!.targetId = target.id;
  s.battle!.playerNextSkillAt = 1000;
  s.battle!.playerNextAttackAt = 100000;
  Object.assign(s.fieldHero!, { from: { ...BATTLE_HERO }, position: { ...BATTLE_HERO }, startedAt: 0,
    arrivedAt: 0, phase: 'chasing', targetId: target.id });
  return { c, s, target, relocation, extremityFist };
}

afterEach(() => vi.restoreAllMocks());

describe('MO_BODYRELOCATION solo hunt integration', () => {
  it('uses one source spirit sphere and snaps beside a selected field mob at the 18-cell limit', () => {
    const { c, s, target, relocation, extremityFist } = setup(18);
    const next = advanceState(s, c, 1000);

    expect(next.events.some(event => event.kind === 'skill' && event.skillId === relocation.id)).toBe(true);
    expect(next.sp).toBe(s.sp - 14);
    expect(next.combatEffects?.spiritSpheres).toBe(0);
    expect(next.fieldHero!.arrivedAt).toBe(1000);
    expect(next.fieldHero!.phase).toBe('fighting');
    expect(next.fieldHero!.targetId).toBe(target.id);
    expect(Math.max(Math.abs(next.fieldHero!.position.x - target.position.x),
      Math.abs(next.fieldHero!.position.y - target.position.y)) * 12).toBeCloseTo(1, 5);
    expect(next.battle!.enemies!.find(enemy => enemy.id === target.id)?.hp).toBe(target.hp);
    expect(next.skillReadyAt[extremityFist.id]).toBe(3000);
  });

  it('does not spend SP or spheres when the target is beyond the source 18-cell range', () => {
    const { c, s, target, relocation } = setup(20, 1);
    expect(skillTargetInRange(s, c, relocation, 1, target, 0)).toBe(false);
    s.fieldHero!.moveBlockedUntil = 5000;
    const next = advanceState(s, c, 1000);

    expect(next.events.some(event => event.kind === 'skill' && event.skillId === relocation.id)).toBe(false);
    expect(next.sp).toBe(s.sp);
    expect(next.combatEffects?.spiritSpheres).toBe(1);
    expect(next.fieldHero!.position).toEqual(BATTLE_HERO);
  });

  it('leaves a sphere-free Snap available under Explosion Spirits', () => {
    const { c, s, relocation } = setup(12, 0);
    const explosion = Object.values(c.skills).find(skill => skill.sourceName === 'MO_EXPLOSIONSPIRITS')!;
    s.buffs[explosion.id] = { expiresAt: 10000, effects: {} };
    s.combatEffects!.buffLevels = { [explosion.id]: 5 };

    expect(sphereCostForSkill(s, c, relocation, 1, 1000)).toBe(0);
    const next = advanceState(s, c, 1000);
    expect(next.events.some(event => event.kind === 'skill' && event.skillId === relocation.id)).toBe(true);
    expect(next.sp).toBe(s.sp - 14);
    expect(next.combatEffects?.spiritSpheres).toBe(0);
  });

  it('does not use Snap without a sphere when Explosion Spirits is inactive', () => {
    const { c, s, relocation } = setup(12, 0);
    const next = advanceState(s, c, 1000);

    expect(next.events.some(event => event.kind === 'skill' && event.skillId === relocation.id)).toBe(false);
    expect(next.sp).toBe(s.sp);
    expect(next.combatEffects?.spiritSpheres).toBe(0);
    expect(next.fieldHero!.position).not.toEqual(BATTLE_HERO);
  });

  it('does not Snap inside basic attack range', () => {
    const { c, s, target, relocation } = setup(1);
    const next = advanceState(s, c, 1000);

    expect(next.events.some(event => event.kind === 'skill' && event.skillId === relocation.id)).toBe(false);
    expect(next.sp).toBe(s.sp);
    expect(next.combatEffects?.spiritSpheres).toBe(1);
    expect(next.fieldHero!.position).not.toEqual(target.position);
  });

  it('does not Snap outside active field hunting', () => {
    const { c, s, relocation } = setup(12, 1);
    s.status = 'challenge';
    s.battle!.challengeId = 'test-challenge';
    const next = advanceState(s, c, 1000);

    expect(next.events.some(event => event.kind === 'skill' && event.skillId === relocation.id)).toBe(false);
    expect(next.sp).toBe(s.sp);
    expect(next.combatEffects?.spiritSpheres).toBe(1);
  });
});
