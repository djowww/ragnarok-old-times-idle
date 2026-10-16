import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Battle, Catalog } from '../shared/types';
import catalogJson from '../content/catalog.json';
import { BATTLE_HERO, enemyPositionAt } from '../shared/battleSpatial';
import { advanceState, applyCommand, createInitialState } from '../engine/index';
import { beginBattle } from '../engine/encounters';
import * as stateTools from '../engine/state';
import { fixture } from './engine-fixture';

function setup(source = 'HT_ANKLESNARE') {
  vi.spyOn(stateTools, 'random').mockReturnValue(0.25);
  const c = fixture(), catalog = catalogJson as unknown as Catalog;
  const imported = Object.values(catalog.skills).find(skill => skill.sourceName === source)!;
  const skill = c.skills[imported.id] = { ...structuredClone(imported), implementation: 'supported' };
  c.classes.novice.skills.push(skill.id);
  const reagent = skill.itemCostByLevel![0][0];
  c.items[reagent.itemId] = structuredClone(catalog.items[reagent.itemId]);
  Object.assign(c.monsters[1002], { hp: 100000, maxSp: 100, attack: [10, 10], attackRange: 1, baseExp: 0, jobExp: 0, boss: false });
  const s = createInitialState(c, 0);
  s.status = 'challenge'; s.rotation = [skill.id]; s.learnedSkills[skill.id] = 5;
  s.autoPotion = { hpThreshold: 0, spThreshold: 0 };
  s.stats.int = 99; s.sp = 1000; s.hp = 10000;
  stateTools.addItem(s, c, reagent.itemId, 20);
  beginBattle(s, c, 1002, 0, 'mastering');
  const enemy = s.battle!.enemies![0];
  Object.assign(enemy, { approachFrom: { x: 0.95, y: BATTLE_HERO.y }, position: { ...BATTLE_HERO }, arrivedAt: 10000, enemyNextAttackAt: 999999, homePosition: { ...BATTLE_HERO } });
  s.battle!.playerNextAttackAt = 1000;
  return { c, s, skill, enemy, reagent };
}
function seedTrap(ctx: ReturnType<typeof setup>, position = { ...BATTLE_HERO }) {
  ctx.s.rotation = [];
  ctx.s.battle!.playerNextAttackAt = ctx.s.battle!.playerNextSkillAt = 999999;
  const trap: NonNullable<Battle['traps']>[number] = { id: 'trap-1', skillId: ctx.skill.id, level: 5,
    position, placedAt: 0, nextTickAt: 1000, expiresAt: 30000 };
  ctx.s.battle!.traps = [trap];
  return trap;
}
afterEach(() => vi.restoreAllMocks());

describe('persistent hunter traps in authoritative combat', () => {
  it('keeps Hunter traps outside every active Venom Dust unit and its neighboring cells', () => {
    const ctx = setup();
    const first = advanceState(ctx.s, ctx.c, 1000).battle!.traps![0];
    const venom = Object.values(catalogJson.skills).find(skill => skill.sourceName === 'AS_VENOMDUST')!;
    ctx.c.skills[venom.id] = structuredClone(venom) as Catalog['skills'][string];
    ctx.s.battle!.skillUnits = [{ id: 'dust-partial', skillId: venom.id, level: 5, position: first.position,
      cells: [first.position], placedAt: 0, nextTickAt: 100, expiresAt: 50000 }];
    const trap = advanceState(ctx.s, ctx.c, 1000).battle!.traps![0];
    if (trap) {
      const a = { x: Math.floor(first.position.x * 12), y: Math.floor(first.position.y * 12) };
      const b = { x: Math.floor(trap.position.x * 12), y: Math.floor(trap.position.y * 12) };
      expect(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))).toBeGreaterThan(1);
    }
  });
  it('places a free reachable ground unit, without immediately attaching a status or buff', () => {
    const { c, s, skill, reagent } = setup();
    const next = advanceState(s, c, 1000);
    expect(next.battle?.traps).toHaveLength(1);
    const trap = next.battle!.traps![0];
    expect(trap).toMatchObject({ skillId: skill.id, placedAt: 1000, nextTickAt: 2000, expiresAt: 51000 });
    expect(trap.position).not.toEqual(next.battle!.enemies![0].position);
    expect(next.battle!.enemies![0].statuses?.SC_ANKLESNARE).toBeUndefined();
    expect(next.buffs[skill.id]).toBeUndefined();
    expect(next.inventory.find(item => item.itemId === reagent.itemId)?.quantity).toBe(19);
    expect(next.events.some(event => event.kind === 'trap-placed')).toBe(true);
  });
  it('triggers on source timer when an approaching enemy reaches it, once without extra SP or reagent', () => {
    const ctx = setup();
    const cast = advanceState(ctx.s, ctx.c, 1000);
    cast.rotation = []; cast.battle!.playerNextAttackAt = cast.battle!.playerNextSkillAt = 999999;
    const next = advanceState(cast, ctx.c, 6000);
    const trigger = next.events.find(event => event.kind === 'trap-trigger')!;
    expect(trigger).toBeDefined(); expect(trigger.at % 1000).toBe(0);
    expect(trigger.at).toBeGreaterThan(1000); expect(trigger.at).toBeLessThan(10000);
    expect(trigger.actorAction).toBe('none');
    expect(next.events.filter(event => event.kind === 'trap-trigger')).toHaveLength(1);
    expect(next.battle!.enemies![0].statuses?.SC_ANKLESNARE?.expiresAt).toBeGreaterThan(6000);
    expect(next.inventory.find(item => item.itemId === ctx.reagent.itemId)?.quantity).toBe(19);
    expect(next.sp).toBe(cast.sp);
  });
  it('does not spend resources or repeatedly place an armed copy on the same automatic rotation', () => {
    const ctx = setup(); ctx.enemy.approachFrom = ctx.enemy.position = { x: 0.95, y: 0.95 }; ctx.enemy.arrivedAt = 0;
    ctx.enemy.statuses = { SC_STUN: { expiresAt: 100000, level: 1 } };
    const next = advanceState(ctx.s, ctx.c, 5000);
    expect(next.battle?.traps).toHaveLength(1);
    expect(next.events.filter(event => event.kind === 'trap-placed')).toHaveLength(1);
    expect(next.inventory.find(item => item.itemId === ctx.reagent.itemId)?.quantity).toBe(19);
  });
  it('does not place under the caster or a living neutral enemy', () => {
    const ctx = setup();
    const blockers = [];
    for (let x = 2; x <= 9; x++) for (let y = 4; y <= 11; y++) blockers.push({ ...structuredClone(ctx.enemy),
      id: `block-${x}-${y}`, startedAt: 0, arrivedAt: 0, approachFrom: { x: (x + 0.5) / 12, y: (y + 0.5) / 12 },
      position: { x: (x + 0.5) / 12, y: (y + 0.5) / 12 }, hostile: false });
    ctx.s.battle!.enemies = [ctx.enemy, ...blockers];
    const next = advanceState(ctx.s, ctx.c, 1000);
    expect(next.battle?.traps ?? []).toHaveLength(0);
    expect(next.inventory.find(item => item.itemId === ctx.reagent.itemId)?.quantity).toBe(20);
  });
  it('Ankle Snare stops walking while allowing a nearby enemy to attack and binds only one victim', () => {
    const ctx = setup(); seedTrap(ctx);
    Object.assign(ctx.enemy, { position: { ...BATTLE_HERO }, approachFrom: { ...BATTLE_HERO }, arrivedAt: 0, enemyNextAttackAt: 1000 });
    ctx.s.battle!.enemies!.push({ ...structuredClone(ctx.enemy), id: 'second', enemyNextAttackAt: 999999 });
    const next = advanceState(ctx.s, ctx.c, 1500);
    expect(next.battle!.enemies![0].statuses?.SC_ANKLESNARE).toBeDefined();
    expect(next.battle!.enemies![1].statuses?.SC_ANKLESNARE).toBeUndefined();
    expect(next.events.some(event => event.kind === 'damage' && event.target === 'player')).toBe(true);
    expect(next.battle!.traps![0]).toMatchObject({ capturedEnemyId: ctx.enemy.id, triggeredAt: 1000, expiresAt: 20900 });
  });
  it('Sandman applies resisted splash to all nearby enemies, skips bosses and expires the used unit', () => {
    const ctx = setup('HT_SANDMAN'); seedTrap(ctx);
    Object.assign(ctx.enemy, { position: { ...BATTLE_HERO }, approachFrom: { ...BATTLE_HERO }, arrivedAt: 0 });
    ctx.c.monsters[9999] = { ...structuredClone(ctx.c.monsters[1002]), id: 9999, boss: true };
    ctx.s.battle!.enemies!.push({ ...structuredClone(ctx.enemy), id: 'second', position: { x: BATTLE_HERO.x + 1 / 12, y: BATTLE_HERO.y } },
      { ...structuredClone(ctx.enemy), id: 'boss', monsterId: 9999 });
    const next = advanceState(ctx.s, ctx.c, 2500);
    expect(next.battle!.enemies!.filter(enemy => enemy.statuses?.SC_SLEEP)).toHaveLength(2);
    expect(next.battle!.enemies!.find(enemy => enemy.id === 'boss')?.statuses?.SC_SLEEP).toBeUndefined();
    expect(next.battle!.traps).toHaveLength(0);
  });
  it('consumes a Flasher activation even if all targets resist', () => {
    const ctx = setup('HT_FLASHER'); seedTrap(ctx);
    ctx.c.monsters[1002].boss = true;
    Object.assign(ctx.enemy, { position: { ...BATTLE_HERO }, approachFrom: { ...BATTLE_HERO }, arrivedAt: 0 });
    const next = advanceState(ctx.s, ctx.c, 2500);
    expect(next.events.filter(event => event.kind === 'trap-trigger')).toHaveLength(1);
    expect(next.battle!.enemies![0].statuses?.SC_BLIND).toBeUndefined();
    expect(next.battle!.traps).toHaveLength(0);
  });
  it('Skid pushes opposite the incoming direction and still consumes on a boss', () => {
    const ctx = setup('HT_SKIDTRAP'); seedTrap(ctx, { x: 0.75, y: BATTLE_HERO.y });
    const next = advanceState(ctx.s, ctx.c, 5000);
    expect(next.events.filter(event => event.kind === 'trap-trigger')).toHaveLength(1);
    expect(enemyPositionAt(next.battle!.enemies![0], 5000).x).toBeGreaterThan(0.75);
  });
  it('Skid retains facing for a stationary snared target instead of defaulting south', () => {
    const ctx = setup('HT_SKIDTRAP'); seedTrap(ctx);
    Object.assign(ctx.enemy, { position: { ...BATTLE_HERO }, approachFrom: { x: BATTLE_HERO.x, y: BATTLE_HERO.y - .1 },
      arrivedAt: 0, facing: { x: -1, y: 0 }, statuses: { SC_ANKLESNARE: { expiresAt: 9000, level: 5 } } });
    const next = advanceState(ctx.s, ctx.c, 1000), point = enemyPositionAt(next.battle!.enemies![0], 1000);
    expect(point.x).toBeCloseTo(BATTLE_HERO.x + 10 / 12);
    expect(point.y).toBeCloseTo(BATTLE_HERO.y);
  });
  it('returns exactly one unused Flasher reagent as visible floor loot', () => {
    const ctx = setup('HT_FLASHER'); const trap = seedTrap(ctx); trap.expiresAt = 750;
    const before = ctx.s.inventory.find(item => item.itemId === ctx.reagent.itemId)!.quantity;
    const next = advanceState(ctx.s, ctx.c, 1000);
    expect(next.inventory.find(item => item.itemId === ctx.reagent.itemId)!.quantity).toBe(before + 1);
    expect(next.events.find(event => event.kind === 'loot' && event.itemId === 1065)).toMatchObject({ at: 750, quantity: 1, enemyPosition: trap.position });
  });
  it('consumes Skid on a boss without moving it and Flasher costs two trap items on placement', () => {
    const boss = setup('HT_SKIDTRAP'); seedTrap(boss); boss.c.monsters[1002].boss = true;
    Object.assign(boss.enemy, { approachFrom: { ...BATTLE_HERO }, position: { ...BATTLE_HERO }, arrivedAt: 0 });
    const resisted = advanceState(boss.s, boss.c, 1000);
    expect(resisted.events.some(event => event.kind === 'trap-trigger')).toBe(true);
    expect(enemyPositionAt(resisted.battle!.enemies![0], 1000)).toEqual(BATTLE_HERO);
    const flasher = setup('HT_FLASHER'), cast = advanceState(flasher.s, flasher.c, 1000);
    expect(cast.inventory.find(item => item.itemId === 1065)?.quantity).toBe(18);
  });
  it('Sleep rejects petrifying Stone and Blind does not refresh an existing timer', () => {
    const sleep = setup('HT_SANDMAN'); seedTrap(sleep);
    Object.assign(sleep.enemy, { position: { ...BATTLE_HERO }, approachFrom: { ...BATTLE_HERO }, arrivedAt: 0,
      statuses: { SC_STONE: { startsAt: 0, petrifiesAt: 5000, expiresAt: 10000, level: 1 } } });
    expect(advanceState(sleep.s, sleep.c, 1000).battle!.enemies![0].statuses?.SC_SLEEP).toBeUndefined();
    const blind = setup('HT_FLASHER'); seedTrap(blind);
    Object.assign(blind.enemy, { position: { ...BATTLE_HERO }, approachFrom: { ...BATTLE_HERO }, arrivedAt: 0,
      statuses: { SC_BLIND: { expiresAt: 1200, level: 1 } } });
    expect(advanceState(blind.s, blind.c, 1000).battle!.enemies![0].statuses?.SC_BLIND?.expiresAt).toBe(1200);
  });
  it('expires unused traps, clears them on return to town and shifts their clocks once on pause resume', () => {
    const ctx = setup(); const trap = seedTrap(ctx); trap.expiresAt = 750;
    const expired = advanceState(ctx.s, ctx.c, 1000);
    expect(expired.battle!.traps).toHaveLength(0);
    const town = applyCommand(ctx.s, ctx.c, { type: 'stop' }, 0);
    expect(town.battle?.traps ?? []).toHaveLength(0);
    ctx.s.status = 'paused'; ctx.s.pausedStatus = 'challenge'; ctx.s.pausedAt = ctx.s.lastSimulatedAt = 1000;
    trap.placedAt = 0; trap.nextTickAt = 2000; trap.expiresAt = 30000;
    const resumed = applyCommand(ctx.s, ctx.c, { type: 'setHuntFocus', areaId: ctx.c.areas[0].id, focus: 'any' }, 100000);
    expect(resumed.battle!.traps![0]).toMatchObject({ placedAt: 99000, nextTickAt: 101000, expiresAt: 129000 });
  });
  it('Shockwave Trap drains the pinned share of a monster SP once when triggered', () => {
    const ctx = setup('HT_SHOCKWAVE');
    expect((ctx.enemy as typeof ctx.enemy & { sp?: number }).sp).toBe(100);

    const placed = advanceState(ctx.s, ctx.c, 1000);
    const trap = placed.battle!.traps![0];
    expect(trap?.skillId).toBe(ctx.skill.id);
    expect(trap?.expiresAt).toBe(41000);
    expect(placed.inventory.find(item => item.itemId === ctx.reagent.itemId)?.quantity).toBe(18);

    placed.rotation = [];
    placed.battle!.playerNextAttackAt = placed.battle!.playerNextSkillAt = 999999;
    Object.assign(placed.battle!.enemies![0], {
      position: { ...trap.position }, approachFrom: { ...trap.position }, arrivedAt: 1000,
    });
    const triggered = advanceState(placed, ctx.c, 2000);
    expect(triggered.events.some(event => event.kind === 'trap-trigger' && event.skillId === ctx.skill.id)).toBe(true);
    expect(triggered.events.find(event => event.kind === 'sp-drain')).toMatchObject({
      amount: 80, resource: 'sp', target: 'enemy', skillId: ctx.skill.id,
    });
    expect((triggered.battle!.enemies![0] as typeof ctx.enemy & { sp?: number }).sp).toBe(20);
    expect(advanceState(triggered, ctx.c, 4000).battle!.enemies![0].sp).toBe(20);
  });

});


describe('Hercules monster SP and solo trap coverage', () => {
  it('imports source monster SP and enables Shockwave with Hercules duration', () => {
    const catalog = catalogJson as unknown as Catalog;
    const shockwave = Object.values(catalog.skills).find(skill => skill.sourceName === 'HT_SHOCKWAVE');
    expect(Object.values(catalog.monsters).every(monster => Number.isFinite(monster.maxSp ?? 0))).toBe(true);
    expect(Object.values(catalog.monsters).some(monster => (monster.maxSp ?? 0) > 0)).toBe(true);
    expect(shockwave).toMatchObject({
      implementation: 'supported',
      groundDurationMs: [200000, 160000, 120000, 80000, 40000],
    });
  });

  it('does not spend a Shockwave trap when the selected monster has no SP', () => {
    const ctx = setup('HT_SHOCKWAVE');
    ctx.enemy.sp = 0;
    const next = advanceState(ctx.s, ctx.c, 1000);
    expect(next.battle?.traps ?? []).toHaveLength(0);
    expect(next.inventory.find(item => item.itemId === ctx.reagent.itemId)?.quantity).toBe(20);
  });
});
