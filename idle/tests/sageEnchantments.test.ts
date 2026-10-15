import { describe, expect, it } from 'vitest';
import catalogJson from '../content/catalog.json';
import type { Catalog } from '../shared/types';
import { addItem, random } from '../engine/state';
import { advanceState, applyCommand, createInitialState } from '../engine';
import { beginBattle } from '../engine/encounters';
import { breakEquippedWeapon } from '../engine/equipmentCondition';
import { runSkillResourcePhases } from '../engine/skillResources';
import { BATTLE_HERO } from '../shared/battleSpatial';
import { sageEnchantChance, sageEnchantCanStart, sageEnchantCastTimeMs, startSageEnchantCast, resolveSageEnchantCast, interruptSageEnchantCast } from '../engine/sageEnchantments';
import { currentPlayerCast } from '../engine/playerCast';
import { activeFreeCastLevel, inventoryLoad } from '../engine/stats';
import { soloPostureAt } from '../web/assets/combatPresentation';
import { castCancelAdditionalSp } from '../engine/castControlRules';

const catalog = catalogJson as unknown as Catalog;
const sources = ['SA_FLAMELAUNCHER', 'SA_FROSTWEAPON', 'SA_LIGHTNINGLOADER', 'SA_SEISMICWEAPON'];
const skillIds = Object.fromEntries(sources.map(source => [source, Object.values(catalog.skills).find(skill => skill.sourceName === source)!.id]));
const reagentIds = [990, 991, 992, 993];

function sageState() {
  const state = createInitialState(catalog, 0);
  state.job = 'sage'; state.baseLevel = 50; state.jobLevel = 50; state.status = 'town';
  state.stats.dex = 30; state.sp = 300;
  state.learnedSkills = Object.fromEntries(sources.map(source => [skillIds[source], 5]));
  for (const id of reagentIds) addItem(state, catalog, id, 1);
  return state;
}

function scheduleLethalDelayedBolt(state: ReturnType<typeof sageState>, enemy: NonNullable<NonNullable<ReturnType<typeof sageState>['battle']>['enemies']>[number], endsAt = 500) {
  const bolt = Object.values(catalog.skills).find(skill => skill.sourceName === 'MG_FIREBOLT')!;
  enemy.hp = 1;
  state.battle!.delayedSkills = [{ skillId: bolt.id, level: 1, targetId: enemy.id,
    position: { ...enemy.position }, endsAt, effect: 'doublecast' }];
  state.battle!.playerNextAttackAt = Number.MAX_SAFE_INTEGER;
  state.battle!.playerNextSkillAt = Number.MAX_SAFE_INTEGER;
  state.battle!.playerActionReadyAt = Number.MAX_SAFE_INTEGER;
  enemy.hostile = false;
  enemy.enemyNextAttackAt = Number.MAX_SAFE_INTEGER;
}

describe('Sage elemental enchantment source rules', () => {
  it('keeps the historical Flame Launcher key through save, advance, and re-enchant', () => {
    const state = sageState(), id = 'flame_enchant';
    const skill = catalog.skills[id];
    expect(skill?.sourceName).toBe('SA_FLAMELAUNCHER');
    expect(catalog.skills.sa_flamelauncher).toBeUndefined();
    state.learnedSkills = { [id]: 5 };
    state.rotation = [id];
    state.skillReadyAt[id] = 1234;
    state.skillPoints = 7;
    state.buffs[id] = { expiresAt: 1000, effects: {} };
    state.combatEffects = { buffLevels: { [id]: 5 } };
    state.events.push({ id: state.nextEventId++, at: 0, kind: 'skill', text: skill!.name, target: 'player',
      skillId: id, skillLevel: 5, sourceActorId: state.id, targetActorId: state.id, actorAction: 'none' });
    const saved = advanceState(JSON.parse(JSON.stringify(state)), catalog, 250);
    expect(saved.learnedSkills[id]).toBe(5);
    expect(saved.rotation).toEqual([id]);
    expect(saved.skillReadyAt[id]).toBe(1234);
    expect(saved.events.some(entry => entry.skillId === id)).toBe(true);
    expect(sageEnchantCanStart(saved, catalog, skill!, 5, 250)).toBe(true);
    const points = saved.skillPoints;
    expect(startSageEnchantCast(saved, catalog, skill!, 5, 250)).toBe(true);
    expect(resolveSageEnchantCast(saved, catalog, saved.supportCast!.endsAt)).toBe(true);
    expect(saved.skillPoints).toBe(points);
    expect(saved.learnedSkills).toEqual({ [id]: 5 });
    expect(saved.buffs[id]).toBeDefined();
    expect(saved.combatEffects?.buffLevels?.[id]).toBe(5);
  });

  it('spends SP before the handler and consumes the reagent after it, preserving broken gear metadata', () => {
    const state = sageState(), skill = catalog.skills[skillIds.SA_FLAMELAUNCHER];
    const weapon = state.inventory.find(entry => entry.uid === state.equipment.weapon)!;
    Object.assign(weapon, { favorite: true, refine: 3, cards: [4001], rarity: 'rare' as const, identified: true });
    let during: { sp: number; reagent: number | undefined } | undefined;
    const result = runSkillResourcePhases(state, catalog, skill, 5, 0, () => {
      during = { sp: state.sp, reagent: state.inventory.find(entry => entry.itemId === 990)?.quantity };
      breakEquippedWeapon(state, catalog, weapon.uid);
      return false;
    });
    expect(result).toEqual({ paid: true, result: false });
    expect(during).toEqual({ sp: 260, reagent: 1 });
    expect(state.inventory.find(entry => entry.itemId === 990)).toBeUndefined();
    expect(state.inventory.find(entry => entry.uid === weapon.uid)).toMatchObject({
      uid: weapon.uid, favorite: true, refine: 3, cards: [4001], rarity: 'rare', identified: true, broken: true,
    });
  });

  it('uses source rates and durations for all four property spells', () => {
    for (let level = 1; level <= 5; level++)
      expect(sageEnchantChance(level)).toBe([70, 80, 90, 100, 100][level - 1]);
  });

  it.each([
    ['SA_FLAMELAUNCHER', 'Fogo'], ['SA_FROSTWEAPON', 'Água'],
    ['SA_LIGHTNINGLOADER', 'Vento'], ['SA_SEISMICWEAPON', 'Terra'],
  ] as const)('uses the Portuguese status label for %s', (source, label) => {
    const state = sageState(), skill = catalog.skills[skillIds[source]];
    expect(startSageEnchantCast(state, catalog, skill, 5, 0)).toBe(true);
    expect(resolveSageEnchantCast(state, catalog, state.supportCast!.endsAt)).toBe(true);
    expect(state.events.find(entry => entry.kind === 'status-start')?.text).toBe(`Arma encantada com ${label}.`);
  });

  it('starts a real DEX-reduced three-second self cast in town without paying twice', () => {
    const state = sageState();
    const skillId = skillIds.SA_FLAMELAUNCHER;
    const skill = catalog.skills[skillId];
    expect(sageEnchantCanStart(state, catalog, skill, 5, 0)).toBe(true);
    expect(startSageEnchantCast(state, catalog, skill, 5, 0)).toBe(true);
    expect(state.supportCast).toMatchObject({ skillId, level: 5, startedAt: 0, endsAt: sageEnchantCastTimeMs(state, catalog, skill, 5, 0) });
    expect(state.sp).toBe(300);
    expect(state.inventory.find(entry => entry.itemId === 990)?.quantity).toBe(1);
  });

  it('allows Sage endows in the saved AFK rotation', () => {
    const state = sageState(), skill = catalog.skills[skillIds.SA_FLAMELAUNCHER];
    const configured = applyCommand(state, catalog, { type: 'setRotation', skillIds: [skill.id] }, 0);
    expect(configured.rotation).toEqual([skill.id]);
  });

  it('blocks manual and AFK cast starts while silenced', () => {
    const state = sageState(), skill = catalog.skills[skillIds.SA_FLAMELAUNCHER];
    state.playerStatuses = { SC_SILENCE: { startsAt: 0, expiresAt: 10_000, level: 1, sourceActorId: 'enemy' } };
    expect(sageEnchantCanStart(state, catalog, skill, 5, 0)).toBe(false);
    expect(() => applyCommand(state, catalog, { type: 'useSkill', skillId: skill.id }, 0)).toThrow();
    state.status = 'challenge'; state.rotation = [skill.id];
    beginBattle(state, catalog, 1002, 0, 'mastering');
    const enemy = state.battle!.enemies![0];
    enemy.hostile = false; enemy.position = { ...BATTLE_HERO }; enemy.approachFrom = { ...BATTLE_HERO };
    enemy.arrivedAt = 0; enemy.enemyNextAttackAt = 100_000;
    expect(advanceState(state, catalog, 1000).supportCast).toBeUndefined();
  });

  it('can start a self enchant during a challenge fight', () => {
    const state = sageState(), skill = catalog.skills[skillIds.SA_FLAMELAUNCHER];
    state.status = 'challenge';
    beginBattle(state, catalog, 1002, 0, 'mastering');
    expect(applyCommand(state, catalog, { type: 'useSkill', skillId: skill.id }, 0).supportCast).toBeDefined();
  });

  it('keeps a self cast through a nonfatal poison tick and shifts it once after reconnect', () => {
    const state = sageState(), skill = catalog.skills[skillIds.SA_FLAMELAUNCHER];
    expect(startSageEnchantCast(state, catalog, skill, 5, 0)).toBe(true);
    state.hp -= 1;
    state.playerStatuses = { SC_POISON: { startsAt: 0, expiresAt: 10_000, nextTickAt: 250,
      remainingTicks: 1, tickDamage: 1, level: 1, sourceActorId: 'enemy' } };
    const ticked = advanceState(JSON.parse(JSON.stringify(state)), catalog, 250);
    expect(ticked.supportCast).toBeDefined();
    const paused = { ...ticked, status: 'paused' as const, pausedStatus: 'town' as const, pausedAt: 250 };
    const resumed = applyCommand(JSON.parse(JSON.stringify(paused)), catalog,
      { type: 'setPotions', hpThreshold: 40, spThreshold: 20 }, 10_000);
    expect(resumed.supportCast?.startedAt).toBe(9_750);
    expect(resumed.supportCast?.endsAt).toBe(9_750 + sageEnchantCastTimeMs(state, catalog, skill, 5, 0));
  });

  it('clears the cast if periodic poison defeats the player', () => {
    const state = sageState(), skill = catalog.skills[skillIds.SA_FLAMELAUNCHER];
    expect(startSageEnchantCast(state, catalog, skill, 5, 0)).toBe(true);
    state.hp = 1;
    state.playerStatuses = { SC_DPOISON: { startsAt: 0, expiresAt: 10_000, nextTickAt: 250,
      remainingTicks: 2, tickDamage: 999, level: 1, sourceActorId: 'enemy' } };
    const defeated = advanceState(state, catalog, 250);
    expect(defeated.hp).toBe(0);
    expect(defeated.supportCast).toBeUndefined();
  });

  it.each([
    ['stop', { type: 'stop' }],
    ['rest', { type: 'rest' }],
    ['startHunt', { type: 'startHunt', areaId: 'prontera_south' }],
    ['challenge', { type: 'challenge', challengeId: 'mastering' }],
  ] as const)('interrupts a pending self cast when %s changes activity', (_name, command) => {
    const state = sageState(), skill = catalog.skills[skillIds.SA_FLAMELAUNCHER];
    expect(startSageEnchantCast(state, catalog, skill, 5, 0)).toBe(true);
    const next = applyCommand(state, catalog, command, 100);
    expect(next.supportCast).toBeUndefined();
    expect(next.sp).toBe(state.sp);
    expect(next.inventory.find(entry => entry.itemId === 990)?.quantity).toBe(1);
  });

  it.each([
    ['changeClass', (state: ReturnType<typeof sageState>) => {
      state.job = 'novice'; state.jobLevel = 10; state.learnedSkills = {};
      return { type: 'changeClass', classId: 'swordsman' } as const;
    }],
    ['rebirth', (state: ReturnType<typeof sageState>) => {
      state.baseLevel = 99; state.jobLevel = 50; state.zeny = 50_000;
      return { type: 'rebirth' } as const;
    }],
  ] as const)('clears the pending cast before %s resets the character', (_name, configure) => {
    const state = sageState(), skill = catalog.skills[skillIds.SA_FLAMELAUNCHER];
    expect(startSageEnchantCast(state, catalog, skill, 5, 0)).toBe(true);
    const command = configure(state);
    const next = applyCommand(state, catalog, command, 100);
    expect(next.supportCast).toBeUndefined();
  });

  it('rejects missing weapon, reagent, class level, and an incompatible active property', () => {
    const state = sageState(), skill = catalog.skills[skillIds.SA_FLAMELAUNCHER];
    const weapon = state.inventory.find(entry => entry.uid === state.equipment.weapon)!;
    delete state.equipment.weapon;
    expect(sageEnchantCanStart(state, catalog, skill, 5, 0)).toBe(false);
    state.equipment.weapon = weapon.uid;
    state.job = 'wizard';
    expect(sageEnchantCanStart(state, catalog, skill, 5, 0)).toBe(false);
    state.job = 'sage';
    state.inventory = state.inventory.filter(entry => entry.itemId !== 990);
    expect(sageEnchantCanStart(state, catalog, skill, 5, 0)).toBe(false);
    state.inventory.push({ uid: 'red-blood', itemId: 990, quantity: 1, refine: 0, cards: [], favorite: false });
    const other = catalog.skills[skillIds.SA_FROSTWEAPON];
    state.buffs[other.id] = { expiresAt: 10000, effects: {} };
    expect(sageEnchantCanStart(state, catalog, skill, 5, 0)).toBe(false);
  });

  it('refreshes the same property; failure can break the currently equipped weapon without replacing its record', () => {
    const state = sageState(), skill = catalog.skills[skillIds.SA_FLAMELAUNCHER];
    const weapon = state.inventory.find(entry => entry.uid === state.equipment.weapon)!;
    state.learnedSkills[skill.id] = 1;
    Object.assign(weapon, { favorite: true, refine: 3, cards: [4001], rarity: 'rare' as const, identified: true });
    state.buffs[skill.id] = { expiresAt: 1000, effects: {} };
    expect(sageEnchantCanStart(state, catalog, skill, 1, 0)).toBe(true);
    state.rngState = 1198;
    expect(startSageEnchantCast(state, catalog, skill, 1, 0)).toBe(true);
    expect(resolveSageEnchantCast(state, catalog, state.supportCast!.endsAt)).toBe(true);
    expect(state.inventory.find(entry => entry.uid === weapon.uid)).toMatchObject({
      uid: weapon.uid, favorite: true, refine: 3, cards: [4001], rarity: 'rare', broken: true,
    });
    expect(state.equipment.weapon).toBeUndefined();
  });

  it('does not consume SP or reagent when interrupted before resolution', () => {
    const state = sageState(), skill = catalog.skills[skillIds.SA_FLAMELAUNCHER];
    startSageEnchantCast(state, catalog, skill, 5, 0);
    const beforeSp = state.sp;
    const beforeItems = state.inventory.find(entry => entry.itemId === 990)?.quantity;
    expect(interruptSageEnchantCast(state, catalog, 1000)).toBe(true);
    expect(state.supportCast).toBeUndefined();
    expect(state.sp).toBe(beforeSp);
    expect(state.inventory.find(entry => entry.itemId === 990)?.quantity).toBe(beforeItems);
  });

  it('revalidates all costs before either payment phase at cast end', () => {
    const state = sageState(), skill = catalog.skills[skillIds.SA_FLAMELAUNCHER];
    expect(startSageEnchantCast(state, catalog, skill, 5, 0)).toBe(true);
    state.sp = 39;
    const beforeItems = state.inventory.find(entry => entry.itemId === 990)?.quantity;
    expect(resolveSageEnchantCast(state, catalog, state.supportCast!.endsAt)).toBe(false);
    expect(state.sp).toBe(39);
    expect(state.inventory.find(entry => entry.itemId === 990)?.quantity).toBe(beforeItems);
  });

  it('uses the weapon equipped at cast end rather than the weapon held at cast start', () => {
    const state = sageState(), skill = catalog.skills[skillIds.SA_FLAMELAUNCHER];
    const original = state.inventory.find(entry => entry.uid === state.equipment.weapon)!;
    expect(startSageEnchantCast(state, catalog, skill, 5, 0)).toBe(true);
    addItem(state, catalog, 1550, 1);
    const replacement = state.inventory.find(entry => entry.itemId === 1550)!;
    state.equipment.weapon = replacement.uid;
    expect(resolveSageEnchantCast(state, catalog, state.supportCast!.endsAt)).toBe(true);
    expect(state.inventory.find(entry => entry.uid === replacement.uid)?.broken).toBeUndefined();
    expect(state.buffs[skill.id]).toBeDefined();
    expect(state.inventory.find(entry => entry.uid === original.uid)?.quantity).toBe(1);
    expect(state.sp).toBe(260);
    expect(state.inventory.find(entry => entry.itemId === 990)).toBeUndefined();
  });

  it('charges a completed cast that becomes property-incompatible while casting', () => {
    const state = sageState(), skill = catalog.skills[skillIds.SA_FLAMELAUNCHER];
    const other = catalog.skills[skillIds.SA_FROSTWEAPON];
    expect(startSageEnchantCast(state, catalog, skill, 5, 0)).toBe(true);
    state.buffs[other.id] = { expiresAt: 10000, effects: {} };
    expect(resolveSageEnchantCast(state, catalog, state.supportCast!.endsAt)).toBe(false);
    expect(state.sp).toBe(260);
    expect(state.inventory.find(entry => entry.itemId === 990)).toBeUndefined();
    expect(state.buffs[other.id]).toBeDefined();
    expect(state.buffs[skill.id]).toBeUndefined();
  });

  it('uses the source status roll once even when the enchantment rate is guaranteed', () => {
    const state = sageState(), skill = catalog.skills[skillIds.SA_FLAMELAUNCHER];
    const expected = structuredClone(state);
    random(expected);
    expect(startSageEnchantCast(state, catalog, skill, 5, 0)).toBe(true);
    expect(resolveSageEnchantCast(state, catalog, state.supportCast!.endsAt)).toBe(true);
    expect(state.rngState).toBe(expected.rngState);
  });

  it('charges the completed cast if its weapon is unequipped before the end', () => {
    const state = sageState(), skill = catalog.skills[skillIds.SA_FLAMELAUNCHER];
    expect(startSageEnchantCast(state, catalog, skill, 5, 0)).toBe(true);
    delete state.equipment.weapon;
    expect(resolveSageEnchantCast(state, catalog, state.supportCast!.endsAt)).toBe(false);
    expect(state.sp).toBe(260);
    expect(state.inventory.find(entry => entry.itemId === 990)).toBeUndefined();
  });

  it('removes replaced Aspersio runtime metadata on a successful endow', () => {
    const state = sageState(), skill = catalog.skills[skillIds.SA_FLAMELAUNCHER];
    const aspersio = Object.values(catalog.skills).find(candidate => candidate.sourceName === 'PR_ASPERSIO')!;
    state.buffs[aspersio.id] = { expiresAt: 10000, effects: {} };
    (state.combatEffects ??= {}).buffLevels = { [aspersio.id]: 4 };
    expect(startSageEnchantCast(state, catalog, skill, 5, 0)).toBe(true);
    expect(resolveSageEnchantCast(state, catalog, state.supportCast!.endsAt)).toBe(true);
    expect(state.buffs[aspersio.id]).toBeUndefined();
    expect(state.combatEffects?.buffLevels?.[aspersio.id]).toBeUndefined();
  });

  it('casts from the AFK rotation and resumes normal weapon attacks after resolution', () => {
    const state = sageState(), skill = catalog.skills[skillIds.SA_FLAMELAUNCHER];
    state.status = 'challenge';
    state.rotation = [skill.id];
    expect(sageEnchantCanStart(state, catalog, skill, 5, 0)).toBe(true);
    beginBattle(state, catalog, 1002, 0, 'mastering');
    const enemy = state.battle!.enemies![0];
    enemy.hostile = false;
    enemy.position = { ...BATTLE_HERO };
    enemy.approachFrom = { ...BATTLE_HERO };
    enemy.arrivedAt = 0;
    enemy.enemyNextAttackAt = 100_000;
    const started = advanceState(state, catalog, 1000);
    expect(started.supportCast).toMatchObject({ skillId: skill.id, level: 5 });
    const endsAt = started.supportCast!.endsAt;
    const resolved = advanceState(started, catalog, endsAt + 1000);
    expect(resolved.supportCast).toBeUndefined();
    expect(resolved.buffs[skill.id]).toBeDefined();
    expect(resolved.events.some(entry => entry.kind === 'damage' && entry.actorAction === 'attack')).toBe(true);
  });

  it('returns to an ordinary attack after a hostile hit interrupts an AFK enchant cast', () => {
    const state = sageState(), skill = catalog.skills[skillIds.SA_FLAMELAUNCHER];
    state.status = 'challenge';
    state.stats.agi = 1;
    state.rotation = [skill.id];
    state.rngState = 2;
    beginBattle(state, catalog, 1002, 0, 'mastering');
    const enemy = state.battle!.enemies![0];
    enemy.position = { ...BATTLE_HERO };
    enemy.approachFrom = { ...BATTLE_HERO };
    enemy.arrivedAt = 0;
    enemy.enemyNextAttackAt = 1700;

    const beforeHit = advanceState(state, catalog, 1200);
    expect(beforeHit.supportCast?.skillId).toBe(skill.id);
    const interrupted = advanceState(beforeHit, catalog, 2000);
    const interruption = interrupted.events.find(entry => entry.kind === 'cast-interrupted' && entry.skillId === skill.id);
    expect(interruption).toBeDefined();
    const interruptionIndex = interrupted.events.indexOf(interruption!);
    expect(interrupted.events.slice(interruptionIndex + 1).some(entry => entry.kind === 'damage' && entry.target === 'enemy' && entry.actorAction === 'attack')).toBe(true);
  });

  it('cancels an enchant without payment when a challenge times out before its cast ends', () => {
    const state = sageState(), skill = catalog.skills[skillIds.SA_FLAMELAUNCHER];
    state.status = 'challenge';
    beginBattle(state, catalog, 1002, 0, 'mastering');
    const battle = state.battle!;
    battle.deadlineAt = 1000;
    const enemy = battle.enemies![0]; enemy.hostile = false; enemy.enemyNextAttackAt = Number.MAX_SAFE_INTEGER;
    const started = applyCommand(state, catalog, { type: 'useSkill', skillId: skill.id }, 0);
    const sp = started.sp, reagent = started.inventory.find(entry => entry.itemId === 990)!.quantity;
    const timedOut = advanceState(started, catalog, 1500);
    expect(timedOut.status).toBe('town');
    expect(timedOut.supportCast).toBeUndefined();
    expect(timedOut.buffs[skill.id]).toBeUndefined();
    expect(timedOut.sp).toBe(sp);
    expect(timedOut.inventory.find(entry => entry.itemId === 990)?.quantity).toBe(reagent);
  });

  it('exposes a support cast through the shared player cast view and native posture rules', () => {
    const state = sageState(), skill = catalog.skills[skillIds.SA_FLAMELAUNCHER];
    expect(startSageEnchantCast(state, catalog, skill, 5, 0)).toBe(true);
    expect(currentPlayerCast(state, 1)).toMatchObject({ kind: 'support', skillId: skill.id,
      level: 5, startedAt: 0, endsAt: state.supportCast!.endsAt, actionId: state.supportCast!.actionId });
    expect(currentPlayerCast(state, state.supportCast!.endsAt)).toBeUndefined();
    expect(soloPostureAt(state, catalog, 1).castWalking).toBe(false);
  });

  it('freezes field movement during a manual hunt cast when Free Cast is not learned', () => {
    const state = sageState(), skill = catalog.skills[skillIds.SA_FLAMELAUNCHER];
    state.status = 'hunting'; state.areaId = catalog.areas[0].id;
    beginBattle(state, catalog, 1002, 0);
    const enemy = state.battle!.enemies!.find(entry => entry.fieldSlot !== undefined)!;
    enemy.hostile = false; enemy.position = { x: 0.8, y: 0.8 }; enemy.approachFrom = { ...enemy.position };
    enemy.arrivedAt = 0; enemy.enemyNextAttackAt = Number.MAX_SAFE_INTEGER;
    state.fieldHero!.from = { x: 0.2, y: 0.2 }; state.fieldHero!.position = { x: 0.8, y: 0.8 };
    state.fieldHero!.startedAt = 0; state.fieldHero!.arrivedAt = 10_000;
    const started = applyCommand(state, catalog, { type: 'useSkill', skillId: skill.id }, 0);
    const frozen = advanceState(started, catalog, 500);
    expect(frozen.fieldHero?.position).toEqual(frozen.fieldHero?.from);
    expect(currentPlayerCast(frozen, 500)?.kind).toBe('support');
  });

  it('advances a manual hunt cast through due player clocks and resumes attacks after resolution', () => {
    const state = sageState(), skill = catalog.skills[skillIds.SA_FLAMELAUNCHER];
    state.status = 'hunting'; state.areaId = catalog.areas[0].id;
    beginBattle(state, catalog, 1002, 0);
    const enemy = state.battle!.enemies!.find(entry => entry.fieldSlot !== undefined)!;
    enemy.hostile = false; enemy.position = { ...BATTLE_HERO }; enemy.approachFrom = { ...BATTLE_HERO };
    enemy.arrivedAt = 0; enemy.enemyNextAttackAt = Number.MAX_SAFE_INTEGER;
    state.battle!.playerNextAttackAt = 0; state.battle!.playerNextSkillAt = 0; state.battle!.playerActionReadyAt = 0;
    const started = applyCommand(state, catalog, { type: 'useSkill', skillId: skill.id }, 0);
    const endsAt = started.supportCast!.endsAt;
    const advanced = advanceState(started, catalog, endsAt + 3000);
    expect(advanced.supportCast).toBeUndefined();
    expect(advanced.events.some(entry => entry.kind === 'damage' && entry.actorAction === 'attack' && entry.at >= endsAt)).toBe(true);
  });

  it('lets Free Cast preserve movement and basic attacks during a manual endow', () => {
    const state = sageState(), skill = catalog.skills[skillIds.SA_FLAMELAUNCHER];
    const freeCast = Object.values(catalog.skills).find(entry => entry.sourceName === 'SA_FREECAST')!;
    state.learnedSkills[freeCast.id] = 1;
    state.status = 'challenge'; state.rotation = [skill.id];
    beginBattle(state, catalog, 1002, 0, 'mastering');
    const enemy = state.battle!.enemies![0];
    enemy.hostile = false; enemy.position = { ...BATTLE_HERO }; enemy.approachFrom = { ...BATTLE_HERO };
    enemy.arrivedAt = 0; enemy.enemyNextAttackAt = Number.MAX_SAFE_INTEGER;
    state.battle!.playerNextAttackAt = 1100;
    expect(activeFreeCastLevel(state, catalog, 1000)).toBe(0);
    const started = advanceState(state, catalog, 1000);
    expect(currentPlayerCast(started, 1000)?.kind).toBe('support');
    expect(activeFreeCastLevel(started, catalog, 1001)).toBe(1);
    expect(soloPostureAt(started, catalog, 1001).castWalking).toBe(true);
    const advanced = advanceState(started, catalog, 1500);
    const cast = started.supportCast!;
    expect(advanced.events.some(entry => entry.kind === 'damage' && entry.actorAction === 'attack' &&
      entry.at >= cast.startedAt && entry.at < cast.endsAt)).toBe(true);
  });

  it('keeps a hunting hero walking through a manual endow when Free Cast is learned', () => {
    const state = sageState(), skill = catalog.skills[skillIds.SA_FLAMELAUNCHER];
    const freeCast = Object.values(catalog.skills).find(entry => entry.sourceName === 'SA_FREECAST')!;
    state.learnedSkills[freeCast.id] = 1;
    state.status = 'hunting'; state.areaId = catalog.areas[0].id;
    beginBattle(state, catalog, 1002, 0);
    const enemy = state.battle!.enemies!.find(entry => entry.fieldSlot !== undefined)!;
    enemy.hostile = false; enemy.position = { x: 0.95, y: 0.95 }; enemy.approachFrom = { ...enemy.position };
    enemy.arrivedAt = 0; enemy.enemyNextAttackAt = Number.MAX_SAFE_INTEGER;
    const started = applyCommand(state, catalog, { type: 'useSkill', skillId: skill.id }, 0);
    const walking = advanceState(started, catalog, 500);
    expect(walking.supportCast).toBeDefined();
    expect(walking.fieldHero!.arrivedAt).toBeGreaterThan(500);
    expect(walking.fieldHero!.position).not.toEqual(walking.fieldHero!.from);
  });

  it('applies the source 90 percent weight gate to endow and Cast Cancel', () => {
    const state = sageState(), endow = catalog.skills[skillIds.SA_FLAMELAUNCHER];
    const cancel = Object.values(catalog.skills).find(entry => entry.sourceName === 'SA_CASTCANCEL')!;
    state.learnedSkills[cancel.id] = 5;
    const heavy = Object.values(catalog.items).filter(item => item.type !== 'equipment' && item.weight > 0)
      .sort((a, b) => b.weight - a.weight)[0];
    expect(heavy).toBeDefined();
    const load = inventoryLoad(state, catalog);
    addItem(state, catalog, heavy!.id, Math.ceil((load.maxWeight * .9 - load.weight) / heavy!.weight));
    expect(sageEnchantCanStart(state, catalog, endow, 5, 0)).toBe(false);
    const cast = { skillId: endow.id, level: 5, startedAt: 0, endsAt: 3000, actionId: 'own-weight-cast' };
    state.supportCast = cast;
    expect(() => applyCommand(state, catalog, { type: 'useSkill', skillId: cancel.id,
      expectedCastActionId: cast.actionId }, 1)).toThrow();
  });

  it.each([1, 2, 3, 4, 5])('cancels an active town endow at Cast Cancel level %i with source SP cost and no reagent use', level => {
    const state = sageState(), canceled = catalog.skills[skillIds.SA_FLAMELAUNCHER];
    const cancel = Object.values(catalog.skills).find(entry => entry.sourceName === 'SA_CASTCANCEL')!;
    state.learnedSkills[cancel.id] = level;
    const started = applyCommand(state, catalog, { type: 'useSkill', skillId: canceled.id }, 0);
    expect(started.supportCast).toBeDefined();
    const cast = started.supportCast!, sp = started.sp, reagent = started.inventory.find(entry => entry.itemId === 990)?.quantity;
    const result = applyCommand(started, catalog, { type: 'useSkill', skillId: cancel.id,
      expectedCastActionId: cast.actionId }, 1);
    expect(result.supportCast).toBeUndefined();
    expect(result.sp).toBe(sp - 2 - castCancelAdditionalSp(canceled.spCost[cast.level - 1], level));
    expect(result.inventory.find(entry => entry.itemId === 990)?.quantity).toBe(reagent);
    expect(result.events.some(entry => entry.kind === 'cast-interrupted' && entry.actionId === cast.actionId)).toBe(true);
  });

  it('rejects a stale Cast Cancel action id without spending SP or clearing the live town cast', () => {
    const state = sageState(), canceled = catalog.skills[skillIds.SA_FLAMELAUNCHER];
    const cancel = Object.values(catalog.skills).find(entry => entry.sourceName === 'SA_CASTCANCEL')!;
    state.learnedSkills[cancel.id] = 5;
    const started = applyCommand(state, catalog, { type: 'useSkill', skillId: canceled.id }, 0);
    const sp = started.sp, cast = started.supportCast!;
    expect(() => applyCommand(started, catalog, { type: 'useSkill', skillId: cancel.id,
      expectedCastActionId: 'stale-cast' }, 1)).toThrow();
    expect(started.supportCast?.actionId).toBe(cast.actionId);
    expect(started.sp).toBe(sp);
  });

  it.each([false, true])('cancels an enchant without payment when a delayed effect ends a challenge (previously rewarded: %s)', alreadyRewarded => {
    const state = sageState(), skill = catalog.skills[skillIds.SA_FLAMELAUNCHER];
    state.status = 'challenge';
    beginBattle(state, catalog, 1002, 0, 'mastering');
    const battle = state.battle!;
    const enemy = battle.enemies![0];
    scheduleLethalDelayedBolt(state, enemy);
    if (alreadyRewarded) state.rewardedAttempts.push(battle.attemptId!);
    const started = applyCommand(state, catalog, { type: 'useSkill', skillId: skill.id }, 0);
    const sp = started.sp, reagent = started.inventory.find(entry => entry.itemId === 990)!.quantity;
    const finished = advanceState(started, catalog, 750);
    expect(finished.status).toBe('town');
    expect(finished.battle).toBeNull();
    expect(finished.supportCast).toBeUndefined();
    expect(finished.buffs[skill.id]).toBeUndefined();
    expect(finished.sp).toBe(sp);
    expect(finished.inventory.find(entry => entry.itemId === 990)?.quantity).toBe(reagent);
  });

  it('keeps a pending enchant when a delayed effect ends only the current same-map wave', () => {
    const state = sageState(), skill = catalog.skills[skillIds.SA_FLAMELAUNCHER];
    const area = catalog.areas[0];
    state.status = 'hunting'; state.areaId = area.id;
    beginBattle(state, catalog, 1002, 0);
    const enemy = state.battle!.enemies!.find(entry => entry.fieldSlot !== undefined)!;
    scheduleLethalDelayedBolt(state, enemy);
    const started = applyCommand(state, catalog, { type: 'useSkill', skillId: skill.id }, 0);
    const next = advanceState(started, catalog, 1000);
    expect(next.battle).not.toBeNull();
    expect(next.supportCast?.skillId).toBe(skill.id);
    expect(next.sp).toBe(started.sp);
    expect(next.inventory.find(entry => entry.itemId === 990)?.quantity).toBe(1);
  });

  it('cancels before field transfer and starts the next area without inheriting old cast clocks', () => {
    const state = sageState(), skill = catalog.skills[skillIds.SA_FLAMELAUNCHER];
    const area = catalog.areas[0], nextArea = catalog.areas[1];
    state.status = 'hunting'; state.areaId = area.id;
    beginBattle(state, catalog, 1002, 0);
    const battle = state.battle!;
    const enemy = battle.enemies!.find(entry => entry.fieldSlot !== undefined)!;
    scheduleLethalDelayedBolt(state, enemy);
    battle.targetId = enemy.id;
    state.pendingAreaId = nextArea.id;
    const started = applyCommand(state, catalog, { type: 'useSkill', skillId: skill.id }, 0);
    const oldIdentity = started.supportCast!.battleClockOwnership?.battleIdentity;
    const transferred = advanceState(started, catalog, 750);
    expect(oldIdentity).toBeDefined();
    expect(transferred.areaId).toBe(nextArea.id);
    expect(transferred.supportCast).toBeUndefined();
    expect(transferred.battle).not.toBeNull();
    expect(transferred.battle?.startedAt).not.toBe(oldIdentity?.startedAt);
    expect(transferred.battle).toMatchObject({ playerActionReadyAt: transferred.battle!.startedAt,
      playerNextSkillAt: transferred.battle!.startedAt + 1000, playerNextAttackAt: transferred.battle!.startedAt + 1000 });
    expect(transferred.sp).toBe(started.sp);
    expect(transferred.inventory.find(entry => entry.itemId === 990)?.quantity).toBe(1);
  });

  it('shifts battle identity on pause and restores clocks only for that resumed battle', () => {
    const state = sageState(), skill = catalog.skills[skillIds.SA_FLAMELAUNCHER];
    state.status = 'challenge';
    beginBattle(state, catalog, 1002, 0, 'mastering');
    const battle = state.battle!;
    battle.playerActionReadyAt = 600; battle.playerNextSkillAt = 700; battle.playerNextAttackAt = 800;
    const started = applyCommand(state, catalog, { type: 'useSkill', skillId: skill.id }, 0);
    const paused = { ...started, status: 'paused' as const, pausedStatus: 'challenge' as const, pausedAt: 0 };
    const resumed = applyCommand(paused, catalog, { type: 'setPotions', hpThreshold: 0, spThreshold: 0 }, 10_000);
    const identity = resumed.supportCast!.battleClockOwnership?.battleIdentity;
    expect(identity?.startedAt).toBe(resumed.battle?.startedAt);
    expect(interruptSageEnchantCast(resumed, catalog, 10_100)).toBe(true);
    expect(resumed.battle).toMatchObject({ startedAt: 10_000, playerActionReadyAt: 10_600,
      playerNextSkillAt: 10_700, playerNextAttackAt: 10_800, supportNeedsOffense: true });
  });

  it.each(['different battle', 'legacy cast without identity'])('does not overwrite a new battle clock from a %s', kind => {
    const state = sageState(), skill = catalog.skills[skillIds.SA_FLAMELAUNCHER];
    state.status = 'challenge';
    beginBattle(state, catalog, 1002, 0, 'mastering');
    const started = applyCommand(state, catalog, { type: 'useSkill', skillId: skill.id }, 0);
    if (kind === 'legacy cast without identity') delete started.supportCast!.battleClockOwnership!.battleIdentity;
    else started.battle!.startedAt = 500;
    Object.assign(started.battle!, { playerActionReadyAt: 4100, playerNextSkillAt: 4200,
      playerNextAttackAt: 4300, supportNeedsOffense: false });
    expect(interruptSageEnchantCast(started, catalog, 100)).toBe(true);
    expect(started.battle).toMatchObject({ startedAt: kind === 'different battle' ? 500 : 0,
      playerActionReadyAt: 4100, playerNextSkillAt: 4200, playerNextAttackAt: 4300, supportNeedsOffense: false });
  });
});
