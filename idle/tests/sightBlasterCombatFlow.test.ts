import { afterEach, describe, expect, it, vi } from 'vitest';
import catalogJson from '../content/catalog.json';
import type { Catalog, GameState } from '../shared/types';
import { BATTLE_HERO, battleDistance } from '../shared/battleSpatial';
import { advanceState, createInitialState } from '../engine/index';
import { beginBattle } from '../engine/encounters';
import { derivedStats } from '../engine/stats';
import * as stateTools from '../engine/state';

const rawCatalog = catalogJson as unknown as Catalog;
const skillId = 'sight_blaster';
const liveDamage = (state: GameState) => state.events.filter(event => event.kind === 'damage' && event.skillId === skillId);
const knockbacks = (state: GameState) => state.events.filter(event => event.kind === 'knockback' && event.skillId === skillId);

function setup({ copies = 1, arrivalAt = 8500 } = {}) {
  vi.spyOn(stateTools, 'random').mockReturnValue(.5);
  const c = structuredClone(rawCatalog);
  c.skills[skillId].implementation = 'supported';
  delete c.skills[skillId].unsupportedReason;
  const s = createInitialState(c, 0);
  s.job = 'wizard';
  s.baseLevel = 50;
  s.jobLevel = 50;
  s.status = 'challenge';
  s.areaId = c.areas[0].id;
  s.rotation = [skillId];
  s.learnedSkills[skillId] = 1;
  s.autoPotion = { hpThreshold: 0, spThreshold: 0 };
  s.stats.dex = 1;
  s.stats.int = 80;
  const initialSp = derivedStats(s, c).maxSp;
  s.sp = initialSp;
  s.hp = 10000;
  beginBattle(s, c, 1002, 0, 'mastering');
  const target = s.battle!.enemies![0];
  target.hp = target.maxHp = 100000;
  target.enemyNextAttackAt = Number.MAX_SAFE_INTEGER;
  target.approachFrom = { x: BATTLE_HERO.x + 2.2, y: BATTLE_HERO.y };
  target.position = { x: BATTLE_HERO.x + .04, y: BATTLE_HERO.y };
  target.startedAt = 0;
  target.arrivedAt = arrivalAt;
  for (let index = 1; index < copies; index++) {
    const clone = structuredClone(target);
    clone.id = `extra-${index}`;
    clone.enemyNextAttackAt = Number.MAX_SAFE_INTEGER;
    s.battle!.enemies!.push(clone);
  }
  s.battle!.targetId = target.id;
  s.battle!.playerNextAttackAt = 1000;
  s.battle!.playerNextSkillAt = 1000;
  s.battle!.playerActionReadyAt = 0;
  return { c, s, target, skill: c.skills[skillId], initialSp };
}
function armSightBlaster(s: GameState) {
  s.buffs[skillId] = { expiresAt: 120000, effects: {} };
  s.combatEffects = { ...(s.combatEffects ?? {}), buffLevels: { ...(s.combatEffects?.buffLevels ?? {}), [skillId]: 1 } };
  s.battle!.playerNextAttackAt = s.battle!.playerNextSkillAt = Number.MAX_SAFE_INTEGER;
}

afterEach(() => vi.restoreAllMocks());

describe('Impacto Explosivo source combat flow', () => {
  it('does not spend SP or start a cast against a distant target with no approach', () => {
    const ctx = setup();
    ctx.target.approachFrom = ctx.target.position = { x: BATTLE_HERO.x + 2.5, y: BATTLE_HERO.y };
    ctx.target.arrivedAt = 0;

    const next = advanceState(ctx.s, ctx.c, 2000);

    expect(next.battle?.cast?.skillId).not.toBe(skillId);
    expect(next.events.some(event => event.kind === 'cast' && event.skillId === skillId)).toBe(false);
    expect(next.buffs[skillId]).toBeUndefined();
    expect(next.sp).toBe(ctx.initialSp);
  });

  it('starts the source cast only when contact falls inside its cast window and pays 40 SP once', () => {
    const { c, s, initialSp } = setup({ copies: 2, arrivalAt: 8500 });

    const approaching = advanceState(s, c, 7000);
    expect(approaching.events.some(event => event.kind === 'cast' && event.skillId === skillId)).toBe(true);
    expect(approaching.battle?.cast?.skillId).toBe(skillId);
    expect(approaching.battle!.cast!.endsAt - approaching.battle!.cast!.startedAt).toBeGreaterThan(0);

    const castEndsAt = approaching.battle!.cast!.endsAt;
    const exploded = advanceState(approaching, c, Math.ceil(castEndsAt / 250) * 250);
    expect(liveDamage(exploded)).toHaveLength(2);
    expect(liveDamage(exploded).every(event => event.amount! > 0)).toBe(true);
    expect(knockbacks(exploded)).toHaveLength(2);
    for (const event of knockbacks(exploded)) {
      expect(battleDistance(event.actionSourcePosition!, event.enemyPosition!)).toBe(3);
    }
    expect(exploded.buffs[skillId]).toBeUndefined();
    expect(exploded.sp).toBe(initialSp - 40);

    const afterPulse = advanceState(exploded, c, exploded.lastSimulatedAt + 2000);
    expect(liveDamage(afterPulse)).toHaveLength(2);
    expect(knockbacks(afterPulse)).toHaveLength(2);
  });

  it('triggers one multi-target pulse at the moving enemy contact deadline', () => {
    const { c, s } = setup({ copies: 2, arrivalAt: 8500 });
    armSightBlaster(s);

    const beforeContact = advanceState(s, c, 8000);
    expect(beforeContact.buffs[skillId]).toBeDefined();
    expect(liveDamage(beforeContact)).toHaveLength(0);

    const exploded = advanceState(beforeContact, c, 8500);
    expect(liveDamage(exploded)).toHaveLength(2);
    expect(liveDamage(exploded).every(event => event.amount! > 0)).toBe(true);
    expect(knockbacks(exploded)).toHaveLength(2);
    for (const event of knockbacks(exploded))
      expect(battleDistance(event.actionSourcePosition!, event.enemyPosition!)).toBe(3);
    expect(exploded.buffs[skillId]).toBeUndefined();

    const afterPulse = advanceState(exploded, c, 7000);
    expect(liveDamage(afterPulse)).toHaveLength(2);
    expect(knockbacks(afterPulse)).toHaveLength(2);
  });

  it.each([
    ['boss', (catalog: Catalog) => { catalog.monsters[1002].boss = true; }],
    ['monster noKnockback', (catalog: Catalog) => { catalog.monsters[1002].noKnockback = true; }],
    ['map noKnockback', (catalog: Catalog) => { catalog.areas[0].noKnockback = true; }],
  ] as const)('deals the hit but respects %s knockback immunity', (_label, configure) => {
    const { c, s } = setup({ arrivalAt: 8500 });
    configure(c);
    armSightBlaster(s);
    const exploded = advanceState(s, c, 8500);

    expect(liveDamage(exploded)).toHaveLength(1);
    expect(knockbacks(exploded)).toHaveLength(0);
  });

  it('still knocks back a movement-immobilized target, as Hercules unit_push does', () => {
    const { c, s, target } = setup({ arrivalAt: 0 });
    target.statuses = { SC_ANKLESNARE: { expiresAt: 10000, level: 1 } };
    target.approachFrom = target.position = { x: BATTLE_HERO.x + .04, y: BATTLE_HERO.y };
    target.startedAt = target.arrivedAt = 0;
    armSightBlaster(s);

    const exploded = advanceState(s, c, 8500);

    expect(liveDamage(exploded)).toHaveLength(1);
    expect(knockbacks(exploded)).toHaveLength(1);
    expect(battleDistance(knockbacks(exploded)[0].actionSourcePosition!, knockbacks(exploded)[0].enemyPosition!)).toBe(3);
  });

  it('lets the armed source status expire at 120 seconds without a nearby enemy', () => {
    const { c, s, target } = setup({ arrivalAt: 0 });
    target.approachFrom = target.position = { x: BATTLE_HERO.x + 2.5, y: BATTLE_HERO.y };
    target.startedAt = target.arrivedAt = 0;
    c.monsters[1002].canMove = false;
    armSightBlaster(s);
    s.rotation = [];

    const before = advanceState(s, c, 119999);
    expect(before.buffs[skillId]).toBeDefined();
    expect(liveDamage(before)).toHaveLength(0);
    const expired = advanceState(before, c, 120000);
    expect(expired.buffs[skillId]).toBeUndefined();
    expect(liveDamage(expired)).toHaveLength(0);
  });

});
