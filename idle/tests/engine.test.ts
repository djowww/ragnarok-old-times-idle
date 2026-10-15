import { describe, expect, it } from 'vitest';
import { advanceState, applyCommand, createInitialState, getSnapshot } from '../engine/index.js';
import { fixture } from './engine-fixture.js';
import catalogJson from '../content/catalog.json';
import type { Catalog, GameState } from '../shared/types.js';
import { BATTLE_HERO } from '../shared/battleSpatial.js';
import { effectiveMonsterStatus } from '../engine/classicStatuses.js';
function placeEnemiesInMeleeRange(s: GameState) {
  const startedAt = s.battle?.startedAt ?? s.lastSimulatedAt;
  for (const enemy of s.battle?.enemies ?? []) {
    enemy.position = { ...BATTLE_HERO };
    enemy.approachFrom = { ...BATTLE_HERO };
    enemy.homePosition = { ...BATTLE_HERO };
    enemy.startedAt = startedAt;
    enemy.arrivedAt = startedAt;
  }
}
describe('authoritative clock and combat', () => {
  it('starts with usable novice equipment and supplies without mutating snapshots', () => {
    const c = fixture(); const s = createInitialState(c, 1234);
    expect(s.zeny).toBe(200); expect(s.statPoints).toBe(20); expect(s.hp).toBeGreaterThan(0);
    expect(s.inventory.find(i => i.itemId === 501)?.quantity).toBe(20);
    expect(s.inventory.find(i => i.itemId === 505)?.quantity).toBe(5);
    expect(s.equipment.weapon).toBeTruthy(); expect(s.learnedSkills.firstaid).toBe(1);
    const snap = getSnapshot(s, c, 1234); snap.state.zeny = 0; expect(s.zeny).toBe(200);
  });
  it('produces identical battles, drops and progression in 600 segmented or offline ticks', () => {
    const c = fixture(); const s = applyCommand(createInitialState(c, 0), c, { type: 'startHunt', areaId: 'prontera' }, 0);
    let continuous = s; for (let t = 1000; t <= 600000; t += 1000) continuous = advanceState(continuous, c, t);
    const offline = advanceState(s, c, 600000);
    expect(offline).toEqual(continuous); expect(offline.totals.kills).toBeGreaterThan(0);
    expect(advanceState(offline, c, 600000)).toEqual(offline); expect(s.totals.kills).toBe(0);
  });
  it('preserves fractional ticks and caps offline time from last browser contact across restart', () => {
    const c = fixture(); const s = createInitialState(c, 250);
    const partial = advanceState(s, c, 1749); expect(partial.lastSimulatedAt).toBe(1500);
    const done = advanceState(partial, c, 2250); expect(done.totals.elapsedMs).toBe(2000);
    const capped = advanceState(s, c, 13 * 3600000 + 250);
    expect(capped.totals.elapsedMs).toBe(12 * 3600000); expect(capped.status).toBe('paused');
    expect(capped.lastSeenAt).toBe(250);
    const restart = JSON.parse(JSON.stringify(capped)); expect(advanceState(restart, c, 14 * 3600000)).toEqual(capped);
  });
  it('uses real potions and falls back to basic attacks without skill SP', () => {
    const c = fixture(); let s = createInitialState(c, 0); s.hp = 1; s.sp = 0;
    s = applyCommand(s, c, { type: 'startHunt', areaId: 'prontera' }, 0);
    const next = advanceState(s, c, 20000);
    expect(next.totals.potions).toBeGreaterThan(0); expect(next.totals.kills).toBeGreaterThan(0);
    expect(next.inventory.find(i => i.itemId === 501)!.quantity).toBeLessThan(20);
  });
  it('auto-casts Provoke while solo hunting and applies both monster combat modifiers', () => {
    const c = structuredClone(catalogJson) as unknown as Catalog;
    const provoke = Object.values(c.skills).find(skill => skill.sourceName === 'SM_PROVOKE')!;
    const area = c.areas[0];
    area.monsters = [1002];
    c.monsters[1002].boss = false;
    c.monsters[1002].hp = 100000;
    let s = createInitialState(c, 0);
    s.job = 'swordsman';
    s.baseLevel = 99;
    s.learnedSkills[provoke.id] = 1;
    s.rotation = [provoke.id];
    s = applyCommand(s, c, { type: 'startHunt', areaId: area.id }, 0);
    s = advanceState(s, c, 1000);
    placeEnemiesInMeleeRange(s);
    s = advanceState(s, c, 10000);

    const cast = s.events.find(event => event.kind === 'skill' && event.skillId === provoke.id);
    expect(cast).toBeDefined();
    const enemy = s.battle?.enemies?.find(candidate => candidate.id === cast?.enemyId)!;
    expect(enemy.statuses?.SC_PROVOKE?.level).toBe(1);
    expect(effectiveMonsterStatus(c.monsters[1002], enemy.statuses, s.lastSimulatedAt)).toMatchObject({
      atkPercent: 105,
      defPercent: 90,
    });
  });
  it('auto-casts Lex Aeterna and consumes it on the next hit against the marked monster', () => {
    const c = structuredClone(catalogJson) as unknown as Catalog;
    const lex = Object.values(c.skills).find(skill => skill.sourceName === 'PR_LEXAETERNA')!;
    const area = c.areas[0];
    area.monsters = [1002];
    c.monsters[1002].hp = 100000;
    let s = createInitialState(c, 0);
    s.job = 'priest';
    s.baseLevel = 99;
    s.stats.int = 99;
    s.learnedSkills[lex.id] = 1;
    s.rotation = [lex.id];
    s = applyCommand(s, c, { type: 'startHunt', areaId: area.id }, 0);
    s = advanceState(s, c, 1000);
    placeEnemiesInMeleeRange(s);
    let cast = s.events.find(event => event.kind === 'skill' && event.skillId === lex.id);
    for (let at = 1250; at <= 15000 && !cast; at += 250) {
      s = advanceState(s, c, at);
      cast = s.events.find(event => event.kind === 'skill' && event.skillId === lex.id);
    }
    expect(cast).toBeDefined();
    const target = s.battle?.enemies?.find(enemy => enemy.id === cast?.enemyId)!;
    expect(target.statuses?.SC_LEXAETERNA?.expiresAt).toBeGreaterThan(s.lastSimulatedAt);
    const normal = structuredClone(s);
    delete normal.battle!.enemies!.find(enemy => enemy.id === cast?.enemyId)!.statuses!.SC_LEXAETERNA;
    const nextActionAt = s.battle!.playerActionReadyAt!;
    const amplified = advanceState(s, c, nextActionAt);
    const baseline = advanceState(normal, c, nextActionAt);
    const amplifiedHit = amplified.events.find(event => event.kind === 'damage' && event.target === 'enemy' &&
      event.enemyId === cast?.enemyId && event.at > (cast?.at ?? Number.POSITIVE_INFINITY));
    const baselineHit = baseline.events.find(event => event.kind === 'damage' && event.target === 'enemy' &&
      event.enemyId === cast?.enemyId && event.at > (cast?.at ?? Number.POSITIVE_INFINITY));
    expect(amplifiedHit?.amount).toBeGreaterThan(0);
    expect(amplifiedHit?.amount).toBe((baselineHit?.amount ?? 0) * 2);
    expect(amplified.battle?.enemies?.find(enemy => enemy.id === cast?.enemyId)?.statuses?.SC_LEXAETERNA).toBeUndefined();
  });
  it('auto-casts Decrease Agility and lowers the targeted monster agility during a hunt', () => {
    const c = structuredClone(catalogJson) as unknown as Catalog;
    const decrease = Object.values(c.skills).find(skill => skill.sourceName === 'AL_DECAGI')!;
    const area = c.areas[0];
    area.monsters = [1002];
    c.monsters[1002].hp = 100000;
    c.monsters[1002].boss = false;
    c.monsters[1002].mdef = 0;
    c.monsters[1002].stats.luk = 0;
    const originalAgi = c.monsters[1002].stats.agi;
    let s = createInitialState(c, 0);
    s.job = 'priest';
    s.baseLevel = 99;
    s.stats.int = 99;
    s.learnedSkills[decrease.id] = 3;
    s.rotation = [decrease.id];
    s = applyCommand(s, c, { type: 'startHunt', areaId: area.id }, 0);
    s = advanceState(s, c, 1000);
    placeEnemiesInMeleeRange(s);
    let cast = s.events.find(event => event.kind === 'skill' && event.skillId === decrease.id);
    for (let at = 1250; at <= 15000 && !cast; at += 250) {
      s = advanceState(s, c, at);
      cast = s.events.find(event => event.kind === 'skill' && event.skillId === decrease.id);
    }
    expect(cast).toBeDefined();
    const enemy = s.battle?.enemies?.find(candidate => candidate.id === cast?.enemyId)!;
    expect(enemy.statuses?.SC_DEC_AGI?.level).toBe(3);
    expect(effectiveMonsterStatus(c.monsters[1002], enemy.statuses, s.lastSimulatedAt).monster.stats.agi)
      .toBe(Math.max(0, originalAgi - 5));
  });
  it('auto-casts Signum Crucis on nearby demons and does not repeat the permanent effect', () => {
    const c = structuredClone(catalogJson) as unknown as Catalog;
    const crucis = Object.values(c.skills).find(skill => skill.sourceName === 'AL_CRUCIS')!;
    const demonbane = Object.values(c.skills).find(skill => skill.sourceName === 'AL_DEMONBANE')!;
    const area = c.areas[0];
    area.monsters = [1002];
    c.monsters[1002] = {
      ...c.monsters[1002], race: 'demon', element: 'neutral', def: 100,
      boss: false, hp: 10_000_000, stats: { ...c.monsters[1002].stats, vit: 0, luk: 0, agi: 0 },
    };
    let s = createInitialState(c, 0);
    s.job = 'priest';
    s.baseLevel = 99;
    s.sp = 10_000;
    s.learnedSkills[crucis.id] = 10;
    s.learnedSkills[demonbane.id] = 3;
    s.rotation = [crucis.id];
    s = applyCommand(s, c, { type: 'startHunt', areaId: area.id }, 0);
    s = advanceState(s, c, 1000);
    placeEnemiesInMeleeRange(s);
    for (let at = 1250; at <= 10000; at += 250) s = advanceState(s, c, at);
    const casts = s.events.filter(event => event.kind === 'skill' && event.skillId === crucis.id);
    expect(casts).toHaveLength(1);
    const affected = s.battle?.enemies?.find(enemy => enemy.statuses?.SC_CRUCIS);
    expect(affected?.statuses?.SC_CRUCIS?.level).toBe(10);
    expect(affected?.statuses?.SC_CRUCIS?.expiresAt).toBe(Number.MAX_SAFE_INTEGER);
    expect(effectiveMonsterStatus(c.monsters[1002], affected?.statuses, s.lastSimulatedAt).monster.def).toBe(50);
  });
  it('auto-casts Aura Blade and exposes its level to physical damage calculations', () => {
    const c = structuredClone(catalogJson) as unknown as Catalog;
    const aura = Object.values(c.skills).find(skill => skill.sourceName === 'LK_AURABLADE')!;
    const area = c.areas[0];
    area.monsters = [1002];
    c.monsters[1002] = {
      ...c.monsters[1002], boss: false, hp: 10_000_000,
      stats: { ...c.monsters[1002].stats, vit: 0, luk: 0, agi: 0 },
    };
    let s = createInitialState(c, 0);
    s.job = 'lord_knight';
    s.stats.int = 99;
    s.sp = getSnapshot(s, c, 0).stats.maxSp;
    s.learnedSkills[aura.id] = 1;
    for (const source of ['SM_BASH', 'SM_MAGNUM', 'SM_TWOHAND']) {
      const prerequisite = Object.values(c.skills).find(skill => skill.sourceName === source)!;
      s.learnedSkills[prerequisite.id] = 5;
    }
    s.rotation = [aura.id];
    s = applyCommand(s, c, { type: 'startHunt', areaId: area.id }, 0);
    s = advanceState(s, c, 1000);
    placeEnemiesInMeleeRange(s);
    for (let at = 1250; at <= 5000; at += 250) s = advanceState(s, c, at);
    expect(s.buffs[aura.id]?.expiresAt).toBeGreaterThan(s.lastSimulatedAt);
    expect(s.events.some(event => event.kind === 'skill' && event.skillId === aura.id)).toBe(true);
  });
  it('only stuns with Bash after learning Fatal Blow and uses its five-second duration', () => {
    const c = structuredClone(catalogJson) as unknown as Catalog;
    const bash = Object.values(c.skills).find(skill => skill.sourceName === 'SM_BASH')!;
    const fatalBlow = Object.values(c.skills).find(skill => skill.sourceName === 'SM_FATALBLOW')!;
    const area = c.areas[0];
    area.monsters = [1002];
    c.monsters[1002] = {
      ...c.monsters[1002], boss: false, hp: 10_000_000,
      stats: { ...c.monsters[1002].stats, vit: 0, luk: 0, agi: 0 },
    };
    let s = createInitialState(c, 0);
    s.job = 'swordsman';
    s.baseLevel = 99;
    s.sp = 10000;
    s.learnedSkills[bash.id] = 10;
    s.rotation = [bash.id];
    s = applyCommand(s, c, { type: 'startHunt', areaId: area.id }, 0);
    s = advanceState(s, c, 1000);
    placeEnemiesInMeleeRange(s);

    const hasActiveStun = (state: GameState) => state.battle?.enemies?.some(enemy => (enemy.statuses?.SC_STUN?.expiresAt ?? 0) > state.lastSimulatedAt) ?? false;
    for (let at = 1250; at <= 8000; at += 250) s = advanceState(s, c, at);
    expect(hasActiveStun(s)).toBe(false);

    s.learnedSkills[fatalBlow.id] = 1;
    let stunnedAt: number | undefined;
    for (let at = 8250; at <= 14000 && stunnedAt === undefined; at += 250) {
      s = advanceState(s, c, at);
      if (hasActiveStun(s)) stunnedAt = at;
    }
    expect(stunnedAt).toBeDefined();
    const stun = s.battle?.enemies?.find(enemy => (enemy.statuses?.SC_STUN?.expiresAt ?? 0) > s.lastSimulatedAt)?.statuses?.SC_STUN;
    expect(stun?.expiresAt).toBeGreaterThanOrEqual((stunnedAt ?? 0) + 4750);
    expect(stun?.expiresAt).toBeLessThanOrEqual((stunnedAt ?? 0) + 5000);
  });
  it('defeat never awards a kill and recovers in town with bounded history', () => {
    const c = fixture(); c.monsters[1002].attack = [10000, 10000]; c.monsters[1002].hp = 100000; c.monsters[1002].stats.dex = 999;
    let s = applyCommand(createInitialState(c, 0), c, { type: 'startHunt', areaId: 'prontera' }, 0); s.inventory = s.inventory.filter(i => i.itemId !== 501);
    s = advanceState(s, c, 100000); expect(s.totals.deaths).toBe(1); expect(s.totals.kills).toBe(0); expect(s.status).toBe('town'); expect(s.hp).toBeGreaterThan(0); expect(s.events.length).toBeLessThanOrEqual(60);
  });
  it('supports DEX bow damage and INT magic / VIT health builds', () => {
    const c = fixture(); const s = createInitialState(c, 0); s.job = 'archer'; s.equipment.weapon = 'bow'; s.inventory.push({ uid: 'bow', itemId: 1701, quantity: 1, refine: 0, cards: [], favorite: false });
    const low = getSnapshot(s, c, 0).stats; s.stats.dex = 50; s.stats.int = 50; s.stats.vit = 50;
    const high = getSnapshot(s, c, 0).stats; expect(high.attack).toBeGreaterThan(low.attack + 40); expect(high.magicAttack[0]).toBeGreaterThan(low.magicAttack[1]); expect(high.maxHp).toBeGreaterThan(low.maxHp);
  });
  it('reads catalog elemental and weapon size adjustments as percentages', () => {
    const c = fixture(); c.monsters[1002].hp = 10000; c.monsters[1002].def = 0; c.monsters[1002].stats = { ...c.monsters[1002].stats, vit: 0, agi: 0 }; c.monsters[1002].element = 'Neutral';
    c.elementModifiers = { neutral: { Neutral: [100, 100, 100, 100] } }; c.sizeModifiers = { dagger: { medium: 75 } }; c.items[1201].effects.crit = 100;
    let s = applyCommand(createInitialState(c, 0), c, { type: 'startHunt', areaId: 'prontera' }, 0); s.stats.dex = 99; s.stats.luk = 99; s.rotation = [];
    s = advanceState(s, c, 1000); placeEnemiesInMeleeRange(s); s = advanceState(s, c, 2000);
    // Criticals use maximum weapon ATK and ignore defense; size correction applies to the weapon part only.
    expect(s.events.find(e => e.kind === 'damage' && e.target === 'enemy')?.amount).toBe(54);
  });
  it('uses attack skills only with their declared SP, zeny, reagent and weapon', () => {
    const c = fixture(); c.monsters[1002].hp = 10000;
    c.skills.costly = { id: 'costly', name: 'Costly', description: '', kind: 'physical', maxLevel: 1, spCost: [5], power: [200], cooldownMs: 3000, zenyCost: [20], itemCost: { itemId: 909, quantity: 1 }, requiredWeapon: ['dagger'] };
    let s = applyCommand(createInitialState(c, 0), c, { type: 'startHunt', areaId: 'prontera' }, 0); s.learnedSkills.costly = 1; s.rotation = ['costly']; s.autoPotion.spThreshold = 0;
    s = advanceState(s, c, 1000); placeEnemiesInMeleeRange(s);
    const absent = advanceState(s, c, 2000); expect(absent.zeny).toBe(200); expect(absent.sp).toBe(s.sp); expect(absent.events.some(e => e.text === 'Costly')).toBe(false);
    s.inventory.push({ uid: 'reagent', itemId: 909, quantity: 1, refine: 0, cards: [], favorite: false });
    const used = advanceState(s, c, 4000); expect(used.zeny).toBe(180); expect(used.sp).toBe(s.sp - 5); expect(used.inventory.some(e => e.uid === 'reagent')).toBe(false);
    expect(advanceState(used, c, 6000).zeny).toBe(180);
  });
  it('applies learned passive levels and expires active buffs without recasting early', () => {
    const c = fixture(); c.monsters[1002].hp = 10000;
    c.skills.passive = { id: 'passive', name: 'Passive', description: '', kind: 'passive', maxLevel: 5, spCost: [], power: [], cooldownMs: 0, effects: { str: 2 } };
    c.skills.buff = { id: 'buff', name: 'Buff', description: '', kind: 'buff', maxLevel: 5, spCost: [3,3], power: [0,0], cooldownMs: 10000, effects: { dex: 2 }, durationMs: 2000 };
    let s = applyCommand(createInitialState(c, 0), c, { type: 'startHunt', areaId: 'prontera' }, 0); s.learnedSkills = { passive: 3, buff: 2 }; s.rotation = ['buff'];
    const used = advanceState(s, c, 2000); expect(getSnapshot(used, c, 2000).stats.effects.str).toBe(6); expect(getSnapshot(used, c, 2000).stats.effects.dex).toBe(4); expect(used.sp).toBe(s.sp - 3);
    const expired = advanceState(used, c, 4000); expect(expired.buffs.buff).toBeUndefined(); expect(expired.sp).toBe(used.sp);
  });
  it('uses a distinct transcendental base EXP curve after rebirth', () => {
    const c = fixture(); c.exp.base = [0, ...Array(99).fill(1)]; c.exp.baseTrans = [0, ...Array(99).fill(200)]; c.monsters[1002].hp = 1;
    // Fixed synthetic Dagger cadence isolates the reborn EXP curve from weapon tables.
    c.classes.high_novice.weaponAspd = { dagger: 1000 };
    let s = createInitialState(c, 0); s.reborn = true; s.job = 'high_novice'; s = applyCommand(s, c, { type: 'startHunt', areaId: 'prontera' }, 0); s = advanceState(s, c, 5000);
    expect(s.totals.kills).toBe(2); expect(s.baseLevel).toBe(1); expect(s.baseExp).toBe(16);
  });
  it('clamps HP after a health buff expires', () => {
    const c = fixture(); c.monsters[1002].hp = 100000; let s = createInitialState(c, 0); s.hp = 1000; s.buffs.health = { expiresAt: 2000, effects: { hp: 1000 } };
    s = applyCommand(s, c, { type: 'startHunt', areaId: 'prontera' }, 0); s = advanceState(s, c, 2000);
    expect(s.hp).toBeLessThanOrEqual(getSnapshot(s, c, 2000).stats.maxHp);
  });
  it('discards capped time while paused even after browser contact is refreshed', () => {
    const c = fixture(); c.monsters[1002].drops = []; // Clock-only farm must not stop for carry capacity.
    let s = applyCommand(createInitialState(c, 0), c, { type: 'startHunt', areaId: 'prontera' }, 0);
    s = advanceState(s, c, 13 * 3600000); const before = structuredClone(s.totals); s.lastSeenAt = 14 * 3600000;
    s = advanceState(s, c, 14 * 3600000 + 10000); expect(s.totals).toEqual(before); expect(s.status).toBe('paused');
    const restarted = applyCommand(s, c, { type: 'startHunt', areaId: 'prontera' }, 14 * 3600000 + 10000);
    const next = advanceState(restarted, c, 14 * 3600000 + 12000); expect(next.totals.elapsedMs - before.elapsedMs).toBe(2000); expect(next.totals.kills - before.kills).toBeLessThanOrEqual(1);
  }, 60000); // Full twelve-hour simulation also runs on a one-CPU VPS worker.
  it('regenerates hunting SP on elapsed ticks even when creation time is not a whole second', () => {
    const c = fixture(); c.monsters[1002].hp = 100000; let s = createInitialState(c, 250); s.sp = 0; s.rotation = []; s.autoPotion.spThreshold = 0;
    s = applyCommand(s, c, { type: 'startHunt', areaId: 'prontera' }, 250); s = advanceState(s, c, 8250); expect(s.sp).toBe(1);
  });
  it('falls back to a basic attack when a skill requires a missing equipment slot', () => {
    const c = fixture(); c.monsters[1002].hp = 100000;
    c.skills.shield = { id: 'shield', name: 'Shield', description: '', kind: 'physical', maxLevel: 1, spCost: [3], power: [200], cooldownMs: 1000, requiredSlot: 'shield' };
    let s = createInitialState(c, 0); s.learnedSkills.shield = 1; s.rotation = ['shield']; s.autoPotion.spThreshold = 0;
    s = applyCommand(s, c, { type: 'startHunt', areaId: 'prontera' }, 0); s = advanceState(s, c, 2000);
    expect(s.sp).toBe(50); expect(s.events.some(e => e.text === 'Shield')).toBe(false); expect(s.events.some(e => e.target === 'enemy')).toBe(true);
  });
  it.each([[1,10], [50,12], [99,16]])('preserves attack interval remainder for AGI %i (%i attacks in twenty seconds)', (agi, count) => {
    const c = fixture(); c.monsters[1002].hp = 1000000; c.monsters[1002].attackDelay = 1000000; c.items[1201].effects.crit = 100;
    // This remainder test deliberately uses a 1 s base Dagger motion across AGI values.
    c.classes.novice.weaponAspd = { dagger: 1000 };
    let s = createInitialState(c, 0); s.baseLevel = 15; s.stats.agi = agi; s.rotation = [];
    s = applyCommand(s, c, { type: 'challenge', challengeId: 'mastering' }, 0); placeEnemiesInMeleeRange(s);
    const offline = advanceState(s, c, 20000); let segmented = s; for (let t = 1000; t <= 20000; t += 1000) segmented = advanceState(segmented, c, t);
    expect(offline).toEqual(segmented); expect(offline.events.filter(e => e.kind === 'damage' && e.target === 'enemy')).toHaveLength(count);
    expect(offline.battle!.playerNextAttackAt).toBeGreaterThan(20000);
  });
  it('uses a blue potion when HP is low and all red potions have run out', () => {
    const c = fixture(); let s = createInitialState(c, 0); s.hp = 1; s.sp = 0; s.rotation = []; s.inventory = s.inventory.filter(e => e.itemId !== 501);
    s = applyCommand(s, c, { type: 'startHunt', areaId: 'prontera' }, 0); s = advanceState(s, c, 1000);
    expect(s.sp).toBe(40); expect(s.totals.potions).toBe(1); expect(s.inventory.find(e => e.itemId === 505)!.quantity).toBe(4); expect(s.potionReadyAt).toBe(2250);
    const next = advanceState(s, c, 2000); expect(next.totals.potions).toBe(1);
  });
  it.each([0,-100])('deals zero damage against an elemental coefficient of %i without healing the target', coefficient => {
    const c = fixture(); c.monsters[1002].hp = 10000; c.monsters[1002].mdef = 70; c.monsters[1002].stats.int = 75; c.monsters[1002].element = 'Holy'; c.monsters[1002].elementLevel = 4;
    c.elementModifiers = { holy: { holy: [100,100,100,coefficient] } }; c.skills.firebolt.element = 'Holy';
    let s = createInitialState(c, 0); s.baseLevel = 15; s.learnedSkills.firebolt = 1; s.rotation = ['firebolt'];
    s = applyCommand(s,c,{type:'challenge',challengeId:'mastering'},0); placeEnemiesInMeleeRange(s); s = advanceState(s,c,1000);
    expect(s.events.find(e => e.kind === 'damage' && e.target === 'enemy')?.amount).toBe(0); expect(s.battle!.hp).toBe(10000);
  });
  it.each([1,40,99])('Holy Light against actual Holy4 Angeling never turns defense into damage at INT %i', int => {
    const c = structuredClone(catalogJson) as unknown as Catalog; c.monsters[1096].attack = [0, 0]; c.monsters[1096].attackDelay = 1000000;
    let s = createInitialState(c,0); s.job = 'priest'; s.baseLevel = 40; s.stats.int = int; s.sp = 100; s.learnedSkills.holy_light = 1; s.rotation = ['holy_light'];
    s = applyCommand(s,c,{type:'challenge',challengeId:'angeling'},0); placeEnemiesInMeleeRange(s); const beforeHp = s.battle!.hp; s = advanceState(s,c,3000);
    expect(s.events.find(e => e.kind === 'damage' && e.target === 'enemy')?.amount).toBe(0); expect(s.battle!.hp).toBe(beforeHp);
  });
});
