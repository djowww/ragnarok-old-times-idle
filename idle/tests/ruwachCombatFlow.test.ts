import { afterEach, describe, expect, it, vi } from 'vitest';
import catalogJson from '../content/catalog.json';
import type { Catalog, GameState } from '../shared/types';
import { BATTLE_HERO } from '../shared/battleSpatial';
import { advanceState, createInitialState } from '../engine/index';
import { beginBattle } from '../engine/encounters';
import * as stateTools from '../engine/state';

const rawCatalog = catalogJson as unknown as Catalog;
const skillId = 'al_ruwach';
const ruachDamage = (s: GameState) => s.events.filter(event => event.kind === 'damage' && event.skillId === skillId);

function setup({ visibleNeighbor = false, concealed = true } = {}) {
  vi.spyOn(stateTools, 'random').mockReturnValue(.5);
  const c = structuredClone(rawCatalog);
  c.skills[skillId].implementation = 'supported';
  delete c.skills[skillId].unsupportedReason;
  const s = createInitialState(c, 0);
  s.job = 'priest';
  s.baseLevel = 30;
  s.status = 'challenge';
  s.areaId = c.areas[0].id;
  s.rotation = [skillId];
  s.learnedSkills[skillId] = 1;
  s.autoPotion = { hpThreshold: 0, spThreshold: 0 };
  s.stats.int = 60;
  s.hp = 10000;
  beginBattle(s, c, 1002, 0, 'mastering');
  const target = s.battle!.enemies![0];
  target.hp = target.maxHp = 100000;
  target.enemyNextAttackAt = Number.MAX_SAFE_INTEGER;
  target.approachFrom = target.position = { x: BATTLE_HERO.x + .1, y: BATTLE_HERO.y };
  target.startedAt = target.arrivedAt = 0;
  target.enemyNextAttackAt = Number.MAX_SAFE_INTEGER;
  if (concealed) target.statuses = { SC_HIDING: { expiresAt: 30000, startsAt: 0, level: 1 } };
  if (visibleNeighbor) {
    const clone = structuredClone(target);
    clone.id = 'visible-neighbor';
    clone.statuses = undefined;
    s.battle!.enemies!.push(clone);
  }
  s.battle!.targetId = target.id;
  s.battle!.playerNextAttackAt = Number.MAX_SAFE_INTEGER;
  s.battle!.playerNextSkillAt = 0;
  s.battle!.playerActionReadyAt = 0;
  return { c, s, target };
}

afterEach(() => vi.restoreAllMocks());

describe('Ruwach source combat flow', () => {
  it('activates the 10-second aura, reveals and hits only concealed enemies on its first pulse', () => {
    const { c, s, target } = setup({ visibleNeighbor: true });

    const pulse = advanceState(s, c, 250);

    expect(pulse.buffs[skillId]?.expiresAt).toBe(10000);
    expect(pulse.sp).toBe(s.sp - 10);
    expect(pulse.battle?.enemies?.find(enemy => enemy.id === target.id)?.statuses?.SC_HIDING).toBeUndefined();
    expect(ruachDamage(pulse)).toHaveLength(1);
    expect(ruachDamage(pulse)[0].enemyId).toBe(target.id);
    expect(ruachDamage(pulse)[0].at).toBe(20);
    expect(ruachDamage(pulse)[0].amount).toBeGreaterThan(0);
    expect(pulse.buffs[skillId]?.expiresAt).toBe(10000);
  });

  it('does not cast or spend SP when there is no concealed enemy in the aura area', () => {
    const { c, s } = setup({ concealed: false });
    const startingSp = s.sp;

    const next = advanceState(s, c, 250);

    expect(next.buffs[skillId]).toBeUndefined();
    expect(ruachDamage(next)).toHaveLength(0);
    expect(next.sp).toBe(startingSp);
  });

  it('arms before a concealed target reaches the aura and hits at the next source pulse', () => {
    const { c, s, target } = setup();
    target.approachFrom = { x: BATTLE_HERO.x + .5, y: BATTLE_HERO.y };
    target.position = { x: BATTLE_HERO.x + .1, y: BATTLE_HERO.y };
    target.startedAt = 0;
    target.arrivedAt = 2500;

    const next = advanceState(s, c, 2600);
    const activatedAt = next.events.find(event => event.kind === 'skill' && event.skillId === skillId &&
      event.targetActorId === s.id)?.at;

    expect(next.buffs[skillId]).toBeDefined();
    expect(activatedAt).toBeDefined();
    expect(activatedAt).toBeLessThan(2000);
    expect(ruachDamage(next)).toHaveLength(1);
    expect((ruachDamage(next)[0].at! - activatedAt!) % 20).toBe(0);
    expect(ruachDamage(next)[0].at).toBeGreaterThan(activatedAt!);
    expect(next.battle?.enemies?.find(enemy => enemy.id === target.id)?.statuses?.SC_HIDING).toBeUndefined();
  });

  it('does not pull a hidden field mob until the first reveal pulse damages it', () => {
    const { c, s, target } = setup();
    target.fieldSlot = 4;
    target.engaged = false;
    target.hostile = false;
    target.approachFrom = { x: BATTLE_HERO.x + .5, y: BATTLE_HERO.y };
    target.position = { x: BATTLE_HERO.x + .1, y: BATTLE_HERO.y };
    target.startedAt = 0;
    target.arrivedAt = 2500;

    const next = advanceState(s, c, 250);

    expect(next.buffs[skillId]).toBeDefined();
    expect(next.battle?.enemies?.[0].engaged).toBe(false);
    expect(ruachDamage(next)).toHaveLength(0);
  });

  it('reveals and damages every concealed enemy in the same radius pulse without recasting', () => {
    const { c, s, target } = setup();
    const second = structuredClone(target);
    second.id = 'second-concealed';
    second.statuses = { SC_CLOAKING: { expiresAt: 30000, startsAt: 0, level: 1 } };
    s.battle!.enemies!.push(second);
    const startingSp = s.sp;

    const next = advanceState(s, c, 250);

    expect(next.sp).toBe(startingSp - 10);
    expect(ruachDamage(next).map(event => event.enemyId).sort()).toEqual([target.id, second.id].sort());
    expect(next.battle?.enemies?.every(enemy =>
      !enemy.statuses?.SC_HIDING && !enemy.statuses?.SC_CLOAKING && !enemy.statuses?.SC_RUWACH)).toBe(true);
  });

  it('processes the source final 20 ms pulse at the aura expiry timestamp', () => {
    const { c, s, target } = setup();
    s.rotation = [];
    s.buffs[skillId] = { expiresAt: 10000, effects: {} };
    (s.combatEffects ??= {}).buffLevels = { [skillId]: 1 };
    target.approachFrom = { x: BATTLE_HERO.x + .5, y: BATTLE_HERO.y };
    target.position = { x: BATTLE_HERO.x + .1597, y: BATTLE_HERO.y };
    target.startedAt = 0;
    target.arrivedAt = 10200;

    const next = advanceState(s, c, 10000);

    expect(ruachDamage(next)).toHaveLength(1);
    expect(ruachDamage(next)[0].at).toBe(10000);
    expect(next.battle?.enemies?.[0].statuses?.SC_HIDING).toBeUndefined();
  });
});
