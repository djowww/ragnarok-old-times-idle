import { afterEach, describe, expect, it, vi } from 'vitest';
import catalogJson from '../content/catalog.json';
import type { BattleEnemy, Catalog } from '../shared/types';
import { advanceState, createInitialState } from '../engine';
import { beginBattle } from '../engine/encounters';
import { effectiveMonsterStatus } from '../engine/classicStatuses';
import * as stateTools from '../engine/state';
import { battleHeroAt } from '../shared/battleSpatial';

const rawCatalog = catalogJson as unknown as Catalog;
const skillId = 'lk_jointbeat';
const sourceSkill = rawCatalog.skills[skillId];

function setup() {
  const c = structuredClone(rawCatalog);
  c.skills[skillId].implementation = 'supported';
  delete c.skills[skillId].unsupportedReason;
  c.monsters[1002].boss = false;
  c.monsters[1002].stats = { str: 0, agi: 0, vit: 0, int: 0, dex: 0, luk: 0 };
  const s = createInitialState(c, 0);
  s.job = 'lord_knight';
  s.baseLevel = 60;
  s.jobLevel = 1;
  s.status = 'challenge';
  s.areaId = c.areas[0].id;
  s.rotation = [skillId];
  s.learnedSkills[skillId] = 10;
  for (const requirement of sourceSkill.prerequisites ?? []) s.learnedSkills[requirement.skillId] = requirement.level;
  s.stats.str = 90;
  s.stats.dex = 90;
  s.hp = 50000;
  s.sp = 300;
  s.autoPotion = { hpThreshold: 0, spThreshold: 0 };
  stateTools.addItem(s, c, 1401, 1);
  s.equipment.weapon = s.inventory.find(item => item.itemId === 1401)!.uid;
  beginBattle(s, c, 1002, 0, 'mastering');
  const enemy = s.battle!.enemies![0];
  enemy.hp = enemy.maxHp = 100000;
  enemy.approachFrom = enemy.position = { x: .58, y: .65 };
  enemy.startedAt = enemy.arrivedAt = 0;
  enemy.enemyNextAttackAt = Number.MAX_SAFE_INTEGER;
  s.battle!.targetId = enemy.id;
  s.battle!.playerNextAttackAt = Number.MAX_SAFE_INTEGER;
  s.battle!.playerNextSkillAt = 0;
  s.battle!.playerActionReadyAt = 0;
  return { c, s, enemy };
}

afterEach(() => vi.restoreAllMocks());

describe('LK_JOINTBEAT source combat flow', () => {
  it('uses a spear attack pose and applies the selected body part after a successful hit', () => {
    const { c, s, enemy } = setup();
    vi.spyOn(stateTools, 'random').mockReturnValue(.5); // shoulder, hit, status succeeds at level 10

    const next = advanceState(s, c, 250);

    expect(next.events.find(event => event.kind === 'skill' && event.skillId === skillId)).toMatchObject({
      actorAction: 'attack', targetActorId: enemy.id,
    });
    expect(next.events.find(event => event.kind === 'damage' && event.skillId === skillId)?.amount).toBeGreaterThan(0);
    expect(next.battle?.enemies?.[0].statuses?.SC_JOINTBEAT).toMatchObject({
      parts: ['shoulder'], expiresAt: 30000, level: 10,
    });
  });

  it('consumes the chosen part before a miss but does not apply a status', () => {
    const { c, s, enemy } = setup();
    c.monsters[1002].stats.agi = 1000;
    vi.spyOn(stateTools, 'random').mockReturnValueOnce(0).mockReturnValue(.99);

    const next = advanceState(s, c, 250);

    expect(next.events.some(event => event.kind === 'miss' && event.skillId === skillId)).toBe(true);
    expect(next.battle?.enemies?.find(actor => actor.id === enemy.id)?.statuses?.SC_JOINTBEAT).toBeUndefined();
  });

  it('accumulates body-part flags on the same target and refreshes their duration', () => {
    const { c, s, enemy } = setup();
    enemy.statuses = { SC_JOINTBEAT: { startsAt: -1000, expiresAt: 10000, level: 10, parts: ['shoulder'] } };
    vi.spyOn(stateTools, 'random').mockReturnValueOnce(.7).mockReturnValue(.2); // waist, hit, status success
    const next = advanceState(s, c, 250);

    expect(next.battle?.enemies?.find(actor => actor.id === enemy.id)?.statuses?.SC_JOINTBEAT).toMatchObject({
      parts: ['shoulder', 'waist'], startsAt: 0, expiresAt: 30000,
    });
  });

  it('applies Hercules ATK, DEF, ASPD and movement modifiers from active parts', () => {
    const { c } = setup();
    const status = {
      SC_JOINTBEAT: { startsAt: 0, expiresAt: 30000, level: 10, parts: ['waist', 'wrist', 'knee', 'ankle'] },
    } as unknown as BattleEnemy['statuses'];
    const active = effectiveMonsterStatus(c.monsters[1002], status, 1000);
    const expired = effectiveMonsterStatus(c.monsters[1002], status, 30000);

    expect(active.atkPercent).toBe(75);
    expect(active.defPercent).toBe(75);
    expect(active.attackDelayPct).toBe(35);
    expect(active.moveSlowPct).toBe(80);
    expect(expired.atkPercent).toBe(100);
    expect(expired.defPercent).toBe(100);
  });

  it('uses joint-break ASPD flags when scheduling the monster next attack', () => {
    const { c, s, enemy } = setup();
    enemy.position = { ...battleHeroAt(s, 0) };
    enemy.approachFrom = { ...enemy.position };
    enemy.arrivedAt = 0;
    enemy.enemyNextAttackAt = 250;
    enemy.statuses = { SC_JOINTBEAT: {
      startsAt: 0, expiresAt: 30000, level: 10, parts: ['wrist', 'knee'],
    } };
    s.battle!.playerNextAttackAt = Number.MAX_SAFE_INTEGER;
    s.battle!.playerNextSkillAt = Number.MAX_SAFE_INTEGER;
    s.battle!.playerActionReadyAt = Number.MAX_SAFE_INTEGER;
    vi.spyOn(stateTools, 'random').mockReturnValue(.5);

    const next = advanceState(s, c, 250);

    expect(next.battle?.enemies?.find(actor => actor.id === enemy.id)?.enemyNextAttackAt)
      .toBe(250 + Math.floor(c.monsters[1002].attackDelay * 1.35));
  });

  it('ticks neck-break bleeding for 200 to 799 HP at each ten-second source interval', () => {
    const { c, s, enemy } = setup();
    vi.spyOn(stateTools, 'random').mockReturnValueOnce(.84).mockReturnValue(.5); // neck; all source rolls pass
    const inflicted = advanceState(s, c, 250);
    const bleeding = inflicted.battle?.enemies?.find(actor => actor.id === enemy.id)?.statuses?.SC_BLOODING;
    expect(bleeding).toMatchObject({ startsAt: 0, expiresAt: 30000, nextTickAt: 10000 });

    inflicted.battle!.playerNextAttackAt = Number.MAX_SAFE_INTEGER;
    inflicted.battle!.playerNextSkillAt = Number.MAX_SAFE_INTEGER;
    inflicted.battle!.playerActionReadyAt = Number.MAX_SAFE_INTEGER;
    const tick = advanceState(inflicted, c, 10000);

    expect(tick.events.filter(event => event.kind === 'damage' && event.text === 'Sangramento'))
      .toHaveLength(1);
    const damage = tick.events.find(event => event.kind === 'damage' && event.text === 'Sangramento')!.amount!;
    expect(damage).toBeGreaterThanOrEqual(200);
    expect(damage).toBeLessThanOrEqual(799);
  });
});
