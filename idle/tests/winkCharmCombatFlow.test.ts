import { afterEach, describe, expect, it, vi } from 'vitest';
import rawCatalog from '../content/catalog.json';
import type { Catalog } from '../shared/types.js';
import { BATTLE_HERO } from '../shared/battleSpatial.js';
import { advanceState, createInitialState } from '../engine/index.js';
import { beginBattle } from '../engine/encounters.js';
import { tryMonsterStatusSkill } from '../engine/monsterStatusSkills.js';
import { expireWinkCharm, winkCharmEligible } from '../engine/winkCharm.js';
import * as stateTools from '../engine/state.js';

const source = rawCatalog as unknown as Catalog;
const skillId = 'dc_winkcharm';

function setup() {
  vi.spyOn(stateTools, 'random').mockReturnValue(.01);
  const c = structuredClone(source);
  Object.assign(c.skills[skillId], { implementation: 'supported', statusEffect: 'SC_DC_WINKCHARM',
    statusChance: [70], statusDurationMs: [10000] });
  delete c.skills[skillId].unsupportedReason;
  const s = createInitialState(c, 0);
  s.job = 'dancer'; s.baseLevel = 60; s.jobLevel = 50;
  s.status = 'hunting'; s.areaId = null;
  s.rotation = [skillId]; s.learnedSkills[skillId] = 1;
  s.autoPotion = { hpThreshold: 0, spThreshold: 0 };
  beginBattle(s, c, 1061, 0);
  const enemy = s.battle!.enemies![0];
  enemy.hp = enemy.maxHp = 100000;
  enemy.approachFrom = enemy.position = { x: BATTLE_HERO.x + .25, y: BATTLE_HERO.y };
  enemy.startedAt = enemy.arrivedAt = 0;
  enemy.enemyNextAttackAt = Number.MAX_SAFE_INTEGER;
  enemy.npcCombat = { firstAttackDone: true, readyAt: {}, attackTargetActorId: s.id };
  s.battle!.targetId = enemy.id;
  s.battle!.playerNextAttackAt = s.battle!.playerNextSkillAt = 1000;
  s.battle!.playerActionReadyAt = 0;
  s.sp = 1000;
  return { c, s, enemy };
}

afterEach(() => vi.restoreAllMocks());

describe('DC_WINKCHARM solo combat flow', () => {
  it('uses the exact monster-only race and level eligibility from Hercules', () => {
    const { c, s, enemy } = setup();
    const skill = c.skills[skillId];
    expect(winkCharmEligible(s, c, skill, 1, enemy, 0)).toBe(true);
    expect(winkCharmEligible({ ...s, baseLevel: 49 }, c, skill, 1, enemy, 0)).toBe(false);
    expect(winkCharmEligible(s, c, skill, 1, { ...enemy, monsterId: 1002 }, 0)).toBe(false);
    expect(winkCharmEligible(s, c, skill, 1, { ...enemy, monsterId: 1061,
      statuses: { SC_DC_WINKCHARM: { level: 1, expiresAt: 1000 } } }, 999)).toBe(false);
  });

  it('casts at a lower-level Nightmare, applies 10 seconds, costs SP once, and deals no damage', () => {
    const { c, s, enemy } = setup();
    const next = advanceState(s, c, 3500);
    const charmed = next.battle!.enemies!.find(entry => entry.id === enemy.id)!;
    const cast = next.events.find(event => event.kind === 'skill' && event.skillId === skillId)!;
    expect(cast).toBeDefined();
    expect(charmed.statuses?.SC_DC_WINKCHARM).toMatchObject({ startsAt: cast.at,
      expiresAt: cast.at! + 10000, level: 1, skillId, sourceActorId: s.id });
    expect(next.sp).toBeLessThan(s.sp);
    expect(next.events.some(event => event.kind === 'damage' && event.skillId === skillId)).toBe(false);
  });

  it('suppresses only monster special skills while charmed; its normal attack clock remains intact', () => {
    const { c, s, enemy } = setup();
    enemy.statuses = { SC_DC_WINKCHARM: { startsAt: 0, expiresAt: 1000, level: 1, skillId,
      sourceActorId: s.id } };
    const attackAt = enemy.enemyNextAttackAt;
    expect(tryMonsterStatusSkill(s, c, enemy, 500)).toBe(false);
    expect(enemy.npcCombat?.cast).toBeUndefined();
    expect(enemy.npcCombat?.readyAt[177]).toBeUndefined();
    expect(enemy.enemyNextAttackAt).toBe(attackAt);
    // Nightmare's Blind Attack row is a BERSERK skill and only becomes eligible in melee range.
    enemy.position = enemy.approachFrom = { x: BATTLE_HERO.x + 1 / 12, y: BATTLE_HERO.y };
    expect(tryMonsterStatusSkill(s, c, enemy, 1000)).toBe(true);
  });

  it('ends exactly once at source expiry', () => {
    const { s, enemy } = setup();
    enemy.statuses = { SC_DC_WINKCHARM: { startsAt: 0, expiresAt: 1000, level: 1, skillId,
      sourceActorId: s.id } };
    expect(expireWinkCharm(s, enemy, 999)).toBe(false);
    expect(expireWinkCharm(s, enemy, 1000)).toBe(true);
    expect(expireWinkCharm(s, enemy, 1000)).toBe(false);
    expect(s.events.filter(event => event.kind === 'status-end' && event.statusName === 'SC_DC_WINKCHARM')).toHaveLength(1);
  });
});
