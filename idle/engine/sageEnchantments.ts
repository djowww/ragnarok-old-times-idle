import type { Catalog, GameState, Skill } from '../shared/types.js';
import { classicCastTime } from './classic.js';
import { classSkills, derivedStats, inventoryLoad, learnedFreeCastLevel } from './stats.js';
import { canPaySkillResources, runSkillResourcePhases } from './skillResources.js';
import { breakEquippedWeapon, isWeaponBreakImmune } from './equipmentCondition.js';
import { event, random } from './state.js';
import { cancelClassicBuff } from './classicBuffs.js';
import { elementalEnchantReplacements } from './enchantPoison.js';
import { activePlayerStatus } from './playerStatuses.js';
import { battleHeroAt } from '../shared/battleSpatial.js';

const SAGE_ENCHANTS = {
  SA_FLAMELAUNCHER: { element: 'fire', reagentId: 990 },
  SA_FROSTWEAPON: { element: 'water', reagentId: 991 },
  SA_LIGHTNINGLOADER: { element: 'wind', reagentId: 992 },
  SA_SEISMICWEAPON: { element: 'earth', reagentId: 993 },
} as const;
const ELEMENT_LABELS = { fire: 'Fogo', water: 'Água', wind: 'Vento', earth: 'Terra' } as const;
const SAGE_ENCHANT_SOURCES = Object.keys(SAGE_ENCHANTS) as Array<keyof typeof SAGE_ENCHANTS>;
const BLOCKING_ENCHANTS = [...SAGE_ENCHANT_SOURCES, 'AS_ENCHANTPOISON'] as const;

export function sageEnchantChance(level: number): number {
  if (!Number.isSafeInteger(level) || level < 1 || level > 5) return 0;
  return Math.min(100, 60 + level * 10);
}

function activeSource(s: GameState, c: Catalog, source: string, at: number) {
  return Object.entries(s.buffs).some(([id, buff]) => c.skills[id]?.sourceName === source && buff.expiresAt > at);
}

function weaponEntry(s: GameState, c: Catalog) {
  const entry = s.inventory.find(candidate => candidate.uid === s.equipment.weapon && candidate.quantity > 0);
  return entry && !entry.broken && c.items[entry.itemId]?.type === 'equipment' && c.items[entry.itemId]?.slot === 'weapon'
    ? entry : undefined;
}

function compatible(s: GameState, c: Catalog, source: keyof typeof SAGE_ENCHANTS, at: number) {
  return !BLOCKING_ENCHANTS.some(other => other !== source && activeSource(s, c, other, at));
}

export function sageEnchantCanStart(s: GameState, c: Catalog, skill: Skill, level: number, at: number): boolean {
  const source = skill.sourceName as keyof typeof SAGE_ENCHANTS;
  const load = inventoryLoad(s, c);
  return Object.hasOwn(SAGE_ENCHANTS, source) && c.skills[skill.id]?.implementation === 'supported' &&
    skill.manualUse === 'activate' && Number.isSafeInteger(level) && level > 0 && level <= 5 && level <= skill.maxLevel &&
    s.learnedSkills[skill.id] === level && classSkills(c, s.job).includes(skill.id) &&
    ['town', 'hunting', 'challenge'].includes(s.status) && !s.supportCast && !s.battle?.cast && s.hp > 0 &&
    load.weight * 10 < load.maxWeight * 9 &&
    !activePlayerStatus(s, 'SC_SILENCE', at) &&
    !!weaponEntry(s, c) && compatible(s, c, source, at) && canPaySkillResources(s, c, skill, level, at);
}

export function sageEnchantCastTimeMs(s: GameState, c: Catalog, skill: Skill, level: number, at: number): number {
  const base = skill.castTimeMs?.[level - 1] ?? 3000;
  const stats = derivedStats(s, c);
  const dexCast = skill.ignoresDex ? base : classicCastTime(base, stats.attributes?.dex ?? s.stats.dex);
  return Math.floor(dexCast * (1 - Math.min(100, stats.effects.castReductionPct ?? 0) / 100));
}

export function startSageEnchantCast(s: GameState, c: Catalog, skill: Skill, level: number, at: number): boolean {
  if (!sageEnchantCanStart(s, c, skill, level, at)) return false;
  const castMs = sageEnchantCastTimeMs(s, c, skill, level, at);
  const actionId = `sage-enchant-${s.id}-${at}-${s.nextEventId}`;
  const battle = s.battle;
  const motion = derivedStats(s, c).attackMotionMs;
  const sourceDelay = skill.afterCastDelayMs?.[level - 1] ?? 0;
  const delay = sourceDelay < 0 ? -sourceDelay + motion : sourceDelay;
  const afterCastDelay = Math.max(0, Math.floor(delay *
    (1 - Math.min(100, derivedStats(s, c).effects.afterCastReductionPct ?? 0) / 100)));
  const actionReadyAt = at + castMs + Math.max(motion, afterCastDelay);
  const freeCast = learnedFreeCastLevel(s, c) > 0;
  s.supportCast = { skillId: skill.id, level, startedAt: at, endsAt: at + castMs, actionId,
    ...(battle && { battleClockOwnership: {
      actionReadyAt: battle.playerActionReadyAt,
      nextSkillAt: battle.playerNextSkillAt,
      nextAttackAt: battle.playerNextAttackAt,
      ownedActionReadyAt: actionReadyAt,
      ownedNextSkillAt: actionReadyAt,
      battleIdentity: { startedAt: battle.startedAt, attemptId: battle.attemptId,
        challengeId: battle.challengeId, areaId: s.areaId },
    } }) };
  if (battle) {
    battle.playerActionReadyAt = actionReadyAt;
    battle.playerNextSkillAt = actionReadyAt;
  }
  if (!freeCast && s.status === 'hunting' && s.fieldHero?.areaId === s.areaId) {
    const point = battleHeroAt(s, at);
    Object.assign(s.fieldHero, { from: point, position: point, startedAt: at, arrivedAt: at, phase: 'fighting' });
  }
  event(s, at, 'cast', skill.name, undefined, 'player', { skillId: skill.id, skillLevel: level,
    sourceActorId: s.id, targetActorId: s.id, actionId, actorAction: 'none', castMs });
  return true;
}

export function interruptSageEnchantCast(s: GameState, c: Catalog, at: number, reason = 'Conjuração interrompida.'): boolean {
  const cast = s.supportCast;
  if (!cast || cast.startedAt > at || cast.endsAt <= at) return false;
  return clearSageEnchantCast(s, c, at, cast, reason);
}

/** Clear an own cast when its containing battle is ending before resolution. */
export function cancelSageEnchantCast(s: GameState, c: Catalog, at: number, reason: string): boolean {
  const cast = s.supportCast;
  if (!cast) return false;
  return clearSageEnchantCast(s, c, at, cast, reason);
}

function clearSageEnchantCast(s: GameState, c: Catalog, at: number,
  cast: NonNullable<GameState['supportCast']>, reason: string): boolean {
  delete s.supportCast;
  const identity = cast.battleClockOwnership?.battleIdentity;
  const battleMatches = !!identity && !!s.battle && identity.startedAt === s.battle.startedAt &&
    identity.attemptId === s.battle.attemptId && identity.challengeId === s.battle.challengeId && identity.areaId === s.areaId;
  if (battleMatches && s.battle && cast.battleClockOwnership) {
    if (cast.battleClockOwnership.ownedActionReadyAt !== undefined &&
        s.battle.playerActionReadyAt === cast.battleClockOwnership.ownedActionReadyAt) {
      if (cast.battleClockOwnership.actionReadyAt === undefined) delete s.battle.playerActionReadyAt;
      else s.battle.playerActionReadyAt = cast.battleClockOwnership.actionReadyAt;
    }
    if (cast.battleClockOwnership.ownedNextSkillAt !== undefined &&
        s.battle.playerNextSkillAt === cast.battleClockOwnership.ownedNextSkillAt) {
      if (cast.battleClockOwnership.nextSkillAt === undefined) delete s.battle.playerNextSkillAt;
      else s.battle.playerNextSkillAt = cast.battleClockOwnership.nextSkillAt;
    }
    s.battle.supportNeedsOffense = true;
  }
  event(s, at, 'cast-interrupted', reason, undefined, 'player', { skillId: cast.skillId,
    skillLevel: cast.level, sourceActorId: s.id, targetActorId: s.id, actionId: cast.actionId, actorAction: 'none' });
  return true;
}

/** Resolve a persisted own cast once its authoritative deadline has elapsed. */
export function resolveSageEnchantCast(s: GameState, c: Catalog, at: number): boolean {
  const cast = s.supportCast;
  if (!cast || cast.endsAt > at) return false;
  delete s.supportCast;
  const skill = c.skills[cast.skillId];
  const source = skill?.sourceName as keyof typeof SAGE_ENCHANTS;
  const spec = SAGE_ENCHANTS[source];
  const fail = (message: string) => {
    event(s, at, 'cast-failed', message, undefined, 'player', { skillId: cast.skillId, skillLevel: cast.level,
      sourceActorId: s.id, targetActorId: s.id, actionId: cast.actionId, actorAction: 'none' });
    return false;
  };
  if (!skill || !spec || skill.implementation !== 'supported' || s.hp <= 0)
    return fail('Não foi possível concluir o encantamento.');
  const load = inventoryLoad(s, c);
  if (load.weight * 10 >= load.maxWeight * 9)
    return fail('Alivie o peso para ficar abaixo de 90% antes de concluir o encantamento.');
  const payment = runSkillResourcePhases(s, c, skill, cast.level, at, () => {
    if (!weaponEntry(s, c)) return fail('A arma não está disponível para o encantamento.');
    if (!compatible(s, c, source, at)) return fail('Outra propriedade impede este encantamento.');

    const succeeds = random(s) * 100 < sageEnchantChance(cast.level);
    if (!succeeds) {
      const weapon = weaponEntry(s, c);
      const weaponItem = weapon && c.items[weapon.itemId];
      const broke = !!weapon && !!weaponItem && !isWeaponBreakImmune(weaponItem) &&
        random(s) * 10000 < 10000 && breakEquippedWeapon(s, c, weapon.uid);
      event(s, at, 'cast-failed', broke ? `Falha no encantamento: ${c.items[weapon!.itemId].name} quebrou.` :
        'Falha no encantamento. A arma resistiu à quebra.', undefined, 'player', { skillId: skill.id,
        skillLevel: cast.level, sourceActorId: s.id, targetActorId: s.id, actionId: cast.actionId, actorAction: 'none' });
      return true;
    }

    for (const other of elementalEnchantReplacements(source)) cancelClassicBuff(s, c, other);
    const duration = skill.statusDurationMs?.[cast.level - 1] ?? (cast.level === 5 ? 1_800_000 : 1_200_000);
    s.buffs[skill.id] = { expiresAt: at + duration, effects: {} };
    (s.combatEffects ??= {}).buffLevels ??= {};
    s.combatEffects.buffLevels[skill.id] = cast.level;
    event(s, at, 'skill', skill.name, undefined, 'player', { skillId: skill.id, skillLevel: cast.level,
      statusName: skill.statusEffect, sourceActorId: s.id, targetActorId: s.id, actionId: cast.actionId,
      actorAction: 'none', castMs: 0 });
    event(s, at, 'status-start', `Arma encantada com ${ELEMENT_LABELS[spec.element]}.`, undefined, 'player', { skillId: skill.id,
      skillLevel: cast.level, statusName: skill.statusEffect, sourceActorId: s.id, targetActorId: s.id, actionId: cast.actionId });
    return true;
  });
  if (!payment.paid) return fail('Recursos insuficientes ao concluir o encantamento.');
  return payment.result;
}
