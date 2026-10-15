import {calculateSlimPitcherRecovery,slimPotionItem} from './slimPitcherRules.js';
import {discardAloeveraUnderAutoBerserk} from './consumables.js';
/** Pinned Hercules410b9738 self-use of Meltdown and Potion Pitcher. */
import type { Catalog, GameState, Skill } from '../shared/types.js';
import { skillUseLevel, configurableSkillUseLevel } from '../shared/skillUseLevels.js';
import { battleHeroAt } from '../shared/battleSpatial.js';
import { recordAreaActivity } from '../shared/hunt.js';
import { classSkills, derivedStats, inventoryLoad } from './stats.js';
import { activePlayerStatus } from './playerStatuses.js';
import { classicBuffActive } from './classicBuffs.js';
import { canPaySkillResources, runSkillResourcePhases } from './skillResources.js';
import { startOwnCast } from './ownCast.js';
import { resolveOwnSkillAction } from './skillActionClock.js';
import { event, random } from './state.js';
import { calculatePotionPitcherRecovery } from './potionPitcherRules.js';
import { meltdownBuffDurationMs } from './meltdownRules.js';

const learnedSource = (s: GameState, c: Catalog, source: string) => {
  const skill = Object.values(c.skills).find(candidate => candidate.sourceName === source);
  return skill ? s.learnedSkills[skill.id] ?? 0 : 0;
};
function eligibleLevel(s: GameState, c: Catalog, skill: Skill, level: number) {
  return configurableSkillUseLevel(skill) && skill.implementation === 'supported' &&
    skill.manualUse === 'activate' && Number.isSafeInteger(level) && level >= 1 && level <= skill.maxLevel &&
    Number.isSafeInteger(s.learnedSkills[skill.id]) && level <= s.learnedSkills[skill.id] &&
    classSkills(c, s.job).includes(skill.id);
}
function availableActor(s: GameState, c: Catalog, at: number) {
  const load = inventoryLoad(s, c);
  return s.hp > 0 && ['town', 'hunting', 'challenge'].includes(s.status) &&
    load.weight * 10 < load.maxWeight * 9 && !activePlayerStatus(s, 'SC_SILENCE', at) &&
    !['MO_STEELBODY', 'LK_BERSERK', 'TF_HIDING', 'AS_CLOAKING', 'KN_AUTOCOUNTER', 'NV_TRICKDEAD', 'ST_CHASEWALK']
      .some(source => classicBuffActive(s, c, source, at));
}
export function soloAlchemyCanStart(s: GameState, c: Catalog, skill: Skill, level: number, at: number): boolean {
  return eligibleLevel(s, c, skill, level) && availableActor(s, c, at) && !s.supportCast && !s.battle?.cast &&
    (s.playerCanActAt ?? 0) <= at && (s.skillReadyAt[skill.id] ?? 0) <= at &&
    canPaySkillResources(s, c, skill, level, at);
}

/** Current item export uses documented deterministic potion midpoints. No item script is evaluated. */
export function potionPitcherRecovery(s: GameState, c: Catalog, level: number) {
  const item = c.items[500 + level], d = derivedStats(s, c);
  return calculatePotionPitcherRecovery({ mode: 'fixed', usedPitcherLevel: level,
    learnedPitcherLevel: learnedSource(s, c, 'AM_POTIONPITCHER'),
    learningPotionLevel: learnedSource(s, c, 'AM_LEARNINGPOTION'),
    baseHP: item?.healHP ?? 0, baseSP: item?.healSP ?? 0, maxHP: d.maxHp, maxSP: d.maxSp,
    targetVIT: d.attributes?.vit ?? s.stats.vit, targetINT: d.attributes?.int ?? s.stats.int,
    targetHPRecoveryLevel: learnedSource(s, c, 'SM_RECOVERY'), targetSPRecoveryLevel: learnedSource(s, c, 'MG_SRECOVERY'),
    baseLevel: s.baseLevel, soulLinkAlchemist: false,
    // These modifiers/statuses have no producers in the current solo engine; retain explicit zero inputs.
    itemHealRatePct: 0, casterSkillHealBonusPct: 0, targetSkillHeal2BonusPct: 0,
    criticalWoundPct: 0, deathHurt: false, waterInsigniaLevel: 0, noRecover: false });
}
export function slimPitcherRecovery(s:GameState,c:Catalog,level:number){
 const d=derivedStats(s,c),item=c.items[slimPotionItem(level)];
 return calculateSlimPitcherRecovery({baseHP:item?.healHP??0,learnedSlimLevel:learnedSource(s,c,'CR_SLIMPITCHER'),
  learnedPitcherLevel:learnedSource(s,c,'AM_POTIONPITCHER'),learningPotionLevel:learnedSource(s,c,'AM_LEARNINGPOTION'),
  targetVIT:d.attributes?.vit??s.stats.vit,targetHPRecoveryLevel:learnedSource(s,c,'SM_RECOVERY'),
  // These source modifiers have no producers in the current solo equipment/status catalog.
  casterSkillHealBonusPct:0,targetSkillHeal2BonusPct:0,criticalWoundPct:0,deathHurt:false,waterInsigniaLevel:0,noRecover:false});
}
const healingRecovery=(s:GameState,c:Catalog,skill:Skill,level:number)=>skill.sourceName==='CR_SLIMPITCHER'?slimPitcherRecovery(s,c,level):potionPitcherRecovery(s,c,level);
/** Idle automation policy is separate from the native manual self-use transaction. */
export function soloAlchemyAfkUseful(s: GameState, c: Catalog, skill: Skill, level: number, at: number): boolean {
  if (!soloAlchemyCanStart(s, c, skill, level, at)) return false;
  if (skill.sourceName === 'WS_MELTDOWN') return !classicBuffActive(s, c, 'WS_MELTDOWN', at) &&
    !!s.battle && (s.battle.enemies ?? [s.battle]).some(enemy => enemy.hp > 0 && !c.monsters[enemy.monsterId]?.boss);
  const d = derivedStats(s, c), recovery = healingRecovery(s, c, skill, level);
  const cost = Math.floor((skill.spCost[level - 1] ?? 0) * (1 - Math.min(100, d.effects.spCostReductionPct ?? 0) / 100));
  return recovery.hp > 0 && s.autoPotion.hpThreshold > 0 && s.hp < d.maxHp &&
    s.hp * 100 <= d.maxHp * Math.min(70, s.autoPotion.hpThreshold) ||
    recovery.sp > cost && s.autoPotion.spThreshold > 0 && s.sp < d.maxSp &&
      s.sp * 100 <= d.maxSp * s.autoPotion.spThreshold;
}
export function startSoloAlchemyCast(s: GameState, c: Catalog, skill: Skill, level: number, at: number): boolean {
  if (!soloAlchemyCanStart(s, c, skill, level, at)) return false;
  startOwnCast(s, c, skill, level, at);
  if (s.supportCast!.endsAt <= at) resolveSoloAlchemyCast(s, c, at);
  return true;
}
export function resolveSoloAlchemyCast(s: GameState, c: Catalog, at: number): boolean {
  const cast = s.supportCast, skill = cast && c.skills[cast.skillId];
  if (!cast || !skill || !configurableSkillUseLevel(skill) || cast.endsAt > at) return false;
  delete s.supportCast;
  return resolveOwnSkillAction(s, c, cast, at, () => {
    const fail = (text: string) => { event(s, at, 'cast-failed', text, undefined, 'player',
      { skillId: cast.skillId, skillLevel: cast.level, sourceActorId: s.id, targetActorId: s.id,
        actionId: cast.actionId, actorAction: 'none' }); return false; };
    if (!eligibleLevel(s, c, skill, cast.level) || !availableActor(s, c, at)) return fail('A habilidade foi interrompida.');
    const action = { skillId: skill.id, skillLevel: cast.level, sourceActorId: s.id, targetActorId: s.id,
      actionId: cast.actionId, actorAction: 'skill' as const, actionStartedAt: at,
      actionMotionMs: derivedStats(s, c).attackMotionMs, actionSourcePosition: battleHeroAt(s, at), castMs: 0 };
    const payment = runSkillResourcePhases(s, c, skill, cast.level, at, () => {
      if (skill.sourceName === 'WS_MELTDOWN') {
        const duration = meltdownBuffDurationMs(cast.level)!;
        random(s); // Guaranteed SC_MELTDOWN still executes the native status_start roll.
        s.buffs[skill.id] = { startsAt: at, expiresAt: at + duration, effects: {} };
        ((s.combatEffects ??= {}).buffLevels ??= {})[skill.id] = cast.level;
        event(s, at, 'skill', skill.name, undefined, 'player', { ...action, statusName: 'SC_MELTDOWN' });
        event(s, at, 'status-start', skill.name, undefined, 'player',
          { ...action, actorAction: 'none', statusName: 'SC_MELTDOWN' });
      } else {
        discardAloeveraUnderAutoBerserk(s,c,at);
        const d = derivedStats(s, c), beforeHP = s.hp, beforeSP = s.sp;
        const recovery = healingRecovery(s, c, skill, cast.level);
        const potionItemId=skill.sourceName==='CR_SLIMPITCHER'?slimPotionItem(cast.level):500+cast.level;
        s.hp = Math.min(d.maxHp, s.hp + recovery.hp); s.sp = Math.min(d.maxSp, s.sp + recovery.sp);
        event(s, at, 'skill', skill.name, undefined, 'player', { ...action, itemId: potionItemId });
        if (recovery.hp > 0) event(s, at, 'heal', 'Recuperação de HP', s.hp - beforeHP, 'player',
          { ...action, actorAction: 'none', resource: 'hp', itemId: potionItemId });
        if (recovery.sp > 0) event(s, at, 'heal', 'Recuperação de SP', s.sp - beforeSP, 'player',
          { ...action, actorAction: 'none', resource: 'sp', itemId: potionItemId });
        s.totals.potions++;
        if (s.status === 'hunting' && s.areaId) recordAreaActivity(s, s.areaId, at, { potions: 1 });
      }
      s.skillReadyAt[skill.id] = at + Math.max(0, skill.cooldownMs);
      if (s.battle) s.battle.supportNeedsOffense = true;
      return true;
    });
    return payment.paid ? payment.result : fail('SP ou poção insuficiente ao concluir a habilidade.');
  });
}
