import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Catalog } from '../shared/types';
import catalogJson from '../content/catalog.json';
import { BATTLE_HERO } from '../shared/battleSpatial';
import { advanceState, applyCommand, createInitialState } from '../engine/index';
import { beginBattle } from '../engine/encounters';
import { derivedStats } from '../engine/stats';
import * as stateTools from '../engine/state';
import { fixture } from './engine-fixture';

function setup(sources: string[]) {
  vi.spyOn(stateTools, 'random').mockReturnValue(0.5);
  const c = fixture(), catalog = catalogJson as unknown as Catalog;
  for (const source of sources) {
    const imported = Object.values(catalog.skills).find(skill => skill.sourceName === source)!;
    c.skills[imported.id] = { ...structuredClone(imported), implementation: 'supported' };
    c.classes.novice.skills.push(imported.id);
  }
  Object.assign(c.monsters[1002], { hp: 100000, attack: [100, 100], attackDelay: 500, attackRange: 5, baseExp: 0, jobExp: 0 });
  const s = createInitialState(c, 0);
  s.status = 'challenge'; s.rotation = []; s.learnedSkills = {};
  s.autoPotion = { hpThreshold: 0, spThreshold: 0 };
  s.stats.vit = 1; s.hp = 10000; s.stats.dex = 99;
  beginBattle(s, c, 1002, 0, 'mastering');
  const enemy = s.battle!.enemies![0];
  Object.assign(enemy, { position: { ...BATTLE_HERO }, approachFrom: { ...BATTLE_HERO }, arrivedAt: 0, enemyNextAttackAt: 1500 });
  s.battle!.playerNextAttackAt = 999999;
  const skill = (source: string) => Object.values(c.skills).find(candidate => candidate.sourceName === source)!;
  return { c, s, skill };
}
afterEach(() => vi.restoreAllMocks());
describe('source defensive skill integration', () => {
  it('clears defensive ground immediately on return to town', () => {
    const { c, s, skill } = setup(['AL_PNEUMA']);
    const pneuma = skill('AL_PNEUMA'); s.learnedSkills[pneuma.id] = 1; s.rotation = [pneuma.id];
    const cast = advanceState(s, c, 1000);
    expect(cast.combatEffects?.defensiveGrounds).toHaveLength(1);
    const town = applyCommand(cast, c, { type: 'stop' }, 1000);
    expect(town.combatEffects?.defensiveGrounds).toHaveLength(0);
    expect(town.buffs[pneuma.id]).toBeUndefined();
  });
  it('allows nonoverlapping new Pneuma without moving the old group', () => {
    const { c, s, skill } = setup(['AL_PNEUMA']);
    const pneuma = skill('AL_PNEUMA'); s.learnedSkills[pneuma.id] = 1; s.rotation = [pneuma.id];
    const cast = advanceState(s, c, 1000), original = structuredClone(cast.combatEffects!.defensiveGrounds![0]);
    cast.status = 'hunting'; cast.areaId = c.areas[0].id;
    cast.fieldHero = { areaId: cast.areaId, from: { x: 0.9, y: 0.65 }, position: { x: 0.9, y: 0.65 }, startedAt: 1000, arrivedAt: 1000, routeIndex: 0 };
    cast.battle!.supportNeedsOffense = false;
    cast.battle!.enemies![0].enemyNextAttackAt = 999999; // Isolate ground placement from incoming damage.
    const readyAt = cast.playerCanActAt!;
    expect(readyAt).toBeGreaterThan(1250);
    expect(advanceState(cast, c, 1250).combatEffects!.defensiveGrounds).toHaveLength(1);
    const again = advanceState(cast, c, Math.ceil(readyAt / 250) * 250);
    expect(again.combatEffects!.defensiveGrounds).toHaveLength(2);
    expect(again.combatEffects!.defensiveGrounds![0]).toEqual(original);
    expect(again.combatEffects!.defensiveGrounds![1].cells).not.toEqual(original.cells);
  });
  it('shifts fixed ground and Endure deadlines once when resuming an offline pause', () => {
    const { c, s } = setup(['AL_PNEUMA', 'SM_ENDURE']);
    s.status = 'paused'; s.pausedStatus = 'challenge'; s.pausedAt = 1000; s.lastSimulatedAt = 1000;
    const ground = { cells: [{ x: 5, y: 7 }], expiresAt: 11000, sceneKey: `challenge:${s.battle!.attemptId}` };
    s.combatEffects = { pneumaGround: structuredClone(ground), defensiveGrounds: [{ ...ground, kind: 'pneumaGround' }], endure: { level: 1, charges: 5, expiresAt: 10000 } };
    const next = applyCommand(s, c, { type: 'setHuntFocus', areaId: c.areas[0].id, focus: 'any' }, 100000);
    expect(next.combatEffects?.pneumaGround?.expiresAt).toBe(110000);
    expect(next.combatEffects?.defensiveGrounds?.[0].expiresAt).toBe(110000);
    expect(next.combatEffects?.endure).toMatchObject({ charges: 5, expiresAt: 109000 });
  });
  it('casts Pneuma on nine fixed source cells and blocks ranged damage', () => {
    const { c, s, skill } = setup(['AL_PNEUMA']);
    const pneuma = skill('AL_PNEUMA'); s.learnedSkills[pneuma.id] = 1; s.rotation = [pneuma.id];
    const next = advanceState(s, c, 2000);
    expect(next.combatEffects?.pneumaGround?.cells).toHaveLength(9);
    expect(next.combatEffects?.pneumaGround?.expiresAt).toBe(11000);
    expect(next.events.some(event => event.kind === 'dodge' && event.text === pneuma.name)).toBe(true);
    expect(next.events.filter(event => event.kind === 'damage' && event.target === 'player')).toHaveLength(0);
  });
  it('Pneuma does not protect a different map or melee attacks', () => {
    const { c, s } = setup(['AL_PNEUMA']);
    s.combatEffects = { pneumaGround: { cells: [{ x: 5, y: 7 }], expiresAt: 10000, sceneKey: 'another-map' } };
    const otherMap = advanceState(s, c, 2000);
    expect(otherMap.events.some(event => event.kind === 'damage' && event.target === 'player')).toBe(true);
    c.monsters[1002].attackRange = 1;
    s.combatEffects.pneumaGround!.sceneKey = `challenge:${s.battle!.attemptId ?? 'mastering'}`;
    const melee = advanceState(s, c, 2000);
    expect(melee.events.some(event => event.kind === 'damage' && event.target === 'player')).toBe(true);
  });
  it('does not spend SP placing Pneuma over a Safety Wall cell', () => {
    const { c, s, skill } = setup(['AL_PNEUMA']);
    const pneuma = skill('AL_PNEUMA'); s.learnedSkills[pneuma.id] = 1; s.rotation = [pneuma.id];
    s.combatEffects = { safetyWallHits: 10, safetyWallGround: { cells: [{ x: 5, y: 7 }], expiresAt: 10000, sceneKey: `challenge:${s.battle!.attemptId ?? 'mastering'}` } };
    const next = advanceState(s, c, 1000);
    expect(next.combatEffects?.pneumaGround).toBeUndefined();
    expect(next.sp).toBe(s.sp);
  });
  it('Defender reduces ranged weapon damage and applies its source ASPD delay', () => {
    const { c, s, skill } = setup(['CR_DEFENDER']);
    const defender = skill('CR_DEFENDER');
    const plain = advanceState(s, c, 2000);
    s.learnedSkills[defender.id] = 1;
    s.buffs[defender.id] = { expiresAt: 10000, effects: {} };
    const baseInterval = derivedStats({ ...s, buffs: {} }, c).attackIntervalMs;
    expect(derivedStats(s, c).attackIntervalMs).toBeGreaterThan(baseInterval);
    const reduced = advanceState(s, c, 2000);
    expect(reduced.events.find(event => event.kind === 'damage' && event.target === 'player')?.amount)
      .toBe(Math.trunc(plain.events.find(event => event.kind === 'damage' && event.target === 'player')!.amount! * 0.8));
  });
  it('Endure adds source MDEF and consumes a damaging hit with no flinch', () => {
    const { c, s, skill } = setup(['SM_ENDURE']);
    const endure = skill('SM_ENDURE'); s.learnedSkills[endure.id] = 3; s.rotation = [endure.id];
    const baseMdef = derivedStats(s, c).mdef;
    const next = advanceState(s, c, 2000);
    expect(next.combatEffects?.endure).toMatchObject({ level: 3, charges: 5, expiresAt: 17000 });
    expect(derivedStats(next, c).mdef).toBe(baseMdef + 3);
    expect(next.events.filter(event => event.kind === 'damage' && event.target === 'player').every(event => event.hitMotionMs === 0)).toBe(true);
  });
  it('Endure expires on the eighth damaging monster application', () => {
    const { c, s, skill } = setup(['SM_ENDURE']);
    const endure = skill('SM_ENDURE'); s.learnedSkills[endure.id] = 1;
    s.buffs[endure.id] = { expiresAt: 10000, effects: { mdef: 1 } };
    s.combatEffects = { endure: { level: 1, charges: 0, expiresAt: 10000 } };
    const next = advanceState(s, c, 2000);
    expect(next.combatEffects?.endure).toBeUndefined(); expect(next.buffs[endure.id]).toBeUndefined();
    const hits = next.events.filter(event => event.kind === 'damage' && event.target === 'player');
    expect(hits[0].hitMotionMs).toBe(0); expect(hits[1].hitMotionMs).toBeGreaterThan(0);
  });
});
