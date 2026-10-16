import {falconDamage,finishFalconDamage,autoFalconLevel,autoFalconProc} from './falconCombatRules.js';
import {detectingCanStart,detectingAfkUseful,useDetecting} from './falconDetect.js';
import {isFalconEquipped} from './falcon.js';
import { findingOreItem } from './findingOre.js';
import { itemElementResistance } from '../shared/consumables.js';
import { consumeItem, consumeItemBlockReason, discardAloeveraUnderAutoBerserk, clearConsumableStatusesOnDeath } from "./consumables.js";
import { applyMeltdownHit } from './meltdown.js';
import { configurableSkillUseLevel, skillUseLevel } from '../shared/skillUseLevels.js';
import { soloAlchemyAfkUseful, startSoloAlchemyCast } from './soloAlchemy.js';
import type {
  BattleEnemy,
  FalconStrike,
  Battle,
  Catalog,
  GameEvent,
  GameState,
  Monster,
  Skill,
  JointBeatPart,
} from "../shared/types.js";
import { consume, event, random } from "./state.js";
import { pickupItem } from './lootPickup.js';
import { overweightForCombat } from './itemCapacity.js';
import { returnForCarry } from './carryReturn.js';
import { copiedSpell, effectiveSkillLevel } from '../shared/copiedSkills.js';
import { captureNpcSpell } from './plagiarism.js';
import { castControlEligible,spellBreakerCastMs,findInterruptibleNpcCast,resolveSpellBreaker } from './castControl.js';
import {conversionSpec} from './elementalConversionRules.js';
import {elementalConversionEligible,elementalConversionTarget,resolveElementalConversion,expireElementalConversion} from './elementalConversion.js';
import {priestControlSources,priestControlEligible,priestControlTarget,resolvePriestSoloControl,monsterAttackTarget,reacquireReleasedMonster,rememberMonsterAttacker,releaseMonsterAttackTarget,expirePriestMonsterStatus} from './priestSoloControl.js';
import { pangVoiceTarget, resolvePangVoice, expirePangVoice } from './pangVoice.js';
import { winkCharmTarget, resolveWinkCharm, expireWinkCharm } from './winkCharm.js';
import { applyCloseConfine, clearCloseConfine, closeConfineActive, closeConfineEligible, expireCloseConfine, releaseCloseConfineTarget, RG_CLOSECONFINE_STATUS } from './rgCloseConfine.js';
import { classSkills, derivedStats, healFull, activeFreeCastLevel, learnedFreeCastLevel } from "./stats.js";
import { mindBreakerEligible, resolveMindBreaker } from './mindBreaker.js';
import { resolveTarotCardDraw, tarotCardSuccess, type TarotCardEffect } from './tarotCard.js';
import { fogWallDamage, fogWallHitChance, fogWallDefending } from './fogWall.js';
import { pickStoneAfkNeeded, PICK_STONE_ITEM_ID } from './pickStone.js';
import {
  BATTLE_HERO,
  BATTLE_CELLS_PER_UNIT,
  battleHeroAt,
  battleDistance,
  playerBattleDistance,
  enemyPositionAt,
  enemyDistanceAt,
  stopHeroMovement,
  stopEnemyMovement,
} from "../shared/battleSpatial.js";
import {
  offensiveSkill,
  basicAttackRange,
  skillTargetInRange,
  skillAttackRange,
} from "../shared/combatRange.js";
import { gainExp, grantReward, updateQuests } from "./progression.js";
import {
  chooseAreaMonster,
  encounterDelay,
  POST_WAVE_SEARCH_MS,
  recordAreaActivity,
} from "../shared/hunt.js";
import {
  classicCastTime,
  classicMagicDamage,
  classicUndeadTargetEligible,
  classicPhysicalDamage,
  classicSkillEffects,
  classicHeal,
  classicPotionHealing,
  classicDivineProtection,
  classicPlayerVitDefense,
  classicIncomingSkillReduction,
  classicWeaponElement,
  classicStripChance,
  classicStripDuration,
  classicStrippedMonster,
  classicBashStunChance,
  classicCrucisBaseChance,
} from "./classic.js";
import { recoverResources, tickTensionRelax, isFieldSitting, endFieldRest, resetResourceRecovery } from "./recovery.js";
import { clearTrickDead, trickDeadActive } from './trickDead.js';
import { autoCounterBlocks, sourceFacing } from './autoCounter.js';
import { bladeStopRules, bladeStopSkillAllowed, bladeStopTarget, bladeStopWaitActive, clearBladeStop, createBladeStopLink,
  startBladeStopWait, shouldBladeStop, tickBladeStop } from './bladeStop.js';
import { isPecoMounted } from './mountedPeco.js';
import { brandishCells, type BrandishFlag } from './brandishSpear.js';
import { chooseJointBeatPart, jointBeatDamagePercent, jointBeatStatusChancePercent, mergeJointBeatParts } from './jointBeatRules.js';
import { startSoloStance, tickSoloStances, finishBerserk, soloRecoveryBlocked } from './soloStanceRuntime.js';
import { deadlyPoisonRules, deadlyPoisonInitialDamage, deadlyPoisonTickRules } from './deadlyPoison.js';
import { STRIP_STATUSES, resolveFullStrip, rejectSwordHit, poisonReactCharges, poisonReactCounter, canApplySplasher, splasherRules } from './reactiveSolo.js';
import { cellPoint, groundCell, groundCovers, venomDustCells, captureSpiderWeb, spiderWebFire, groundDepartureAt,
  type SpiderWebStatus } from './groundSolo.js';
import { SLOW_GRACE_DURATION_MS, SLOW_GRACE_INTERVAL_MS, SLOW_GRACE_OUTSIDE_MS, SLOW_GRACE_SP_DRAIN_MS, resolveSlowGraceDrain, slowGraceCells, slowGraceCovers, slowGraceValues } from './slowGraceRules.js';
import { canPaySkillResources, paySkillResources } from "./skillResources.js";
import { resurrectionMonsterEligible, soulChangeMonsterEligible, soulChangeRecovery } from './resurrectionSoulChange.js';
import {
  applyClassicBuff,
  cancelClassicBuff,
  clearClassicGrounds,
  classicGroundSceneKey,
  canActWhileHidden,
  classicBuffActive,
  comboAllowed,
  playerHiddenFrom,
  tickClassicBuffs,
} from "./classicBuffs.js";
import { canSteal, attemptSteal, attemptGank } from "./steal.js";
import { isHunterTrapSkill, hunterTrapSpec, hunterTrapStatus, hunterTrapWithinRange } from "./hunterTraps.js";
import { enchantPoisonProc, enchantPoisonCastBlocked, elementalEnchantReplacements } from "./enchantPoison.js";
import { automaticSpellChoices, hindsightProc, doubleCastingRepeat, memorizeCastStart } from "./sageCasting.js";
import { energyCoatMagicDamage, magicRodAcceptsCast, magicRodRefund, magicRodWindow, monsterMagicAttack, monsterMagicDamage, monsterMagicElementRate } from "./monsterMagic.js";
import { createPneuma, pneumaBlocks, defenderDamage, defenderStats, createEndure, endureHit, defenseHitMotion } from "./classicDefenses.js";
import { autoGuardChance, autoGuardWalkDelayMs, sacrificeBaseDamage, sacrificeHpCost, shrinkRollAccepted } from './guardianSacrificeRules.js';
import { activeSacrifice, applyGuardianStatus, consumeSacrificeCharge, guardianShieldEquipped, guardianSkillEligible, guardianStatusActive } from './guardianSacrifice.js';
import { currentPlayerCast } from './playerCast.js';
import { gridRouteLength } from '../shared/fieldNavigation.js';
import { fieldHome, fieldWanderPoint } from "../shared/fieldPopulation.js";
import type { SimulationContext } from './fieldNavigation.js';
import {
  classicStatusResistance,
  classicCrucisAffects,
  classicStoneTiming,
  classicStatusBreaksOnDamage,
  classicStoneIsPetrified,
  effectiveMonsterStatus,
  isClassicResistedStatus,
  classicProvokeBaseChance,
  classicDecreaseAgilityBaseChance,
} from "./classicStatuses.js";

const val = (values: number[] | undefined, level: number, fallback = 0) =>
  values?.[level - 1] ?? values?.at(-1) ?? fallback;
import { nextSageFieldBoundary, playerDefenseElement, sageFieldElementRate, sageFieldIsActive,
  sageFieldModifiers, sageFieldSource, syncSageField, type SageFieldModifiers } from './sageFields.js';
import { sageFieldCanStart, startSageFieldCast } from './sageFieldCasting.js';
import { captureGroundPlacement, canPlaceSelfGround, pruneGroundPlacements, removeGroundPlacement, reserveGroundPlacementSlot } from './groundUnitOccupancy.js';
import { sourceGroundShape } from './groundUnitGeometry.js';
type ActionMetadata = Pick<GameEvent,
  "sourceActorId" | "actionId" | "actorAction" | "actionStartedAt" | "actionMotionMs" | "actionSourcePosition" | "areaId">;
const playerMotion = (s: GameState, c: Catalog) => derivedStats(s, c).attackMotionMs;
function playerAction(s: GameState, c: Catalog, at: number, actorAction: GameEvent["actorAction"], actionId?: string): ActionMetadata {
  return {
    sourceActorId: s.id,
    actionId: actionId ?? `action-${s.id}-${at}-${s.nextEventId}`,
    actorAction,
    actionStartedAt: at,
    actionMotionMs: actorAction === "none" ? 0 : playerMotion(s, c),
    actionSourcePosition: { ...battleHeroAt(s, at) },
    areaId: s.areaId ?? undefined,
  };
}
function afterCastDelay(s: GameState, c: Catalog, skill: Skill, level: number) {
  return sourceAfterCastDelay(s, c, skill, level);
}
const learnedBySource = (s: GameState, c: Catalog) =>
  Object.fromEntries(
    Object.entries(s.learnedSkills).map(([id, level]) => [
      c.skills[id]?.sourceName ?? id,
      level,
    ]),
  );
const activeBySource = (s: GameState, c: Catalog, at: number) =>
  Object.fromEntries(
    Object.entries(s.buffs)
      .filter(([, buff]) => buff.expiresAt > at)
      .map(([id]) => [
        c.skills[id]?.sourceName ?? id,
        s.combatEffects?.buffLevels?.[id] ?? s.learnedSkills[id] ?? 1,
      ]),
  );
const defenseSceneKey = classicGroundSceneKey;
const defenseCell = (s: GameState, at: number) => {
  const point = battleHeroAt(s, at);
  return { x: Math.floor(point.x * BATTLE_CELLS_PER_UNIT), y: Math.floor(point.y * BATTLE_CELLS_PER_UNIT) };
};
function activeDefenseGrounds(s: GameState, kind: "pneumaGround" | "safetyWallGround", at: number) {
  if (s.combatEffects?.defensiveGrounds) return s.combatEffects.defensiveGrounds
    .filter(ground => ground.kind === kind && ground.expiresAt > at && ground.sceneKey === defenseSceneKey(s) &&
      (kind !== "safetyWallGround" || (ground.hits ?? 0) > 0));
  const ground = s.combatEffects?.[kind];
  return ground && ground.expiresAt > at && ground.sceneKey === defenseSceneKey(s)
    ? [{ ...ground, kind, hits: kind === "safetyWallGround" ? s.combatEffects?.safetyWallHits : undefined }] : [];
}
function canPlaceDefenseGround(s: GameState, source: string, at: number) {
  const occupied = [...activeDefenseGrounds(s, "pneumaGround", at), ...activeDefenseGrounds(s, "safetyWallGround", at)]
    .flatMap(ground => ground.cells);
  const cell = defenseCell(s, at);
  return source === "AL_PNEUMA" ? !!createPneuma(cell, at, occupied)
    : !occupied.some(other => other.x === cell.x && other.y === cell.y);
}
function defensiveGroundCollection(s: GameState, at: number) {
  const combat = (s.combatEffects ??= {});
  return combat.defensiveGrounds ??= [...activeDefenseGrounds(s, "pneumaGround", at), ...activeDefenseGrounds(s, "safetyWallGround", at)];
}
function combatStatus(c: Catalog, enemy: BattleEnemy, at: number, field?: SageFieldModifiers) {
  const monster = classicStrippedMonster(
    c.monsters[enemy.monsterId],
    Object.entries(enemy.statuses ?? {})
      .filter(([, status]) => status.expiresAt > at)
      .map(([name]) => name),
  );
  const quagmire = enemy.statuses?.quagmire;
  if (quagmire && quagmire.expiresAt > at) {
    monster.stats.dex -= Math.min(
      Math.floor(monster.stats.dex * 0.5),
      10 * quagmire.level,
    );
    monster.stats.agi -= Math.min(
      Math.floor(monster.stats.agi * 0.5),
      10 * quagmire.level,
    );
  }
  if (field?.weaponAttack) monster.attack = monster.attack.map(value => value + field.weaponAttack) as [number, number];
  return effectiveMonsterStatus(monster, enemy.statuses, at, 5000, field?.flee ?? 0);
}
function monsterAttackInterval(monster: Monster, attackDelayPct = 0) {
  return Math.min(4000, Math.max(20, Math.floor(monster.attackDelay * (100 + attackDelayPct) / 100)));
}
function breakControlOnDamage(enemy: BattleEnemy, damage: number, at: number) {
  for (const name of Object.keys(enemy.statuses ?? {}))
    if (
      classicStatusBreaksOnDamage(name, damage, {
        stonePetrified: classicStoneIsPetrified(enemy.statuses?.SC_STONE, at),
      })
    )
      delete enemy.statuses![name];
}
function engageFieldEnemy(s: GameState, enemy: BattleEnemy, at: number, hostile = true) {
  if (enemy.fieldSlot === undefined) return;
  if (enemy.engaged) { if (hostile) enemy.hostile = true; return; }
  const from = enemyPositionAt(enemy, at);
  stopEnemyMovement(enemy, from, at);
  enemy.homePosition ??= fieldHome(enemy.fieldSlot);
  enemy.engaged = true;
  enemy.hostile = hostile;
  enemy.enemyNextAttackAt = at;
  delete enemy.approachPausedAt;
}
function provokeEnemy(s: GameState, c: Catalog, enemy: BattleEnemy, at: number) {
  engageFieldEnemy(s, enemy, at);
  if (enemy.hostile === false) {
    enemy.hostile = true;
    // Becoming engaged makes the first attack ready. Range controls contact;
    // source AttackDelay spaces subsequent attacks instead of delaying pursuit.
    enemy.enemyNextAttackAt = at;
  }
}

function fieldTarget(s: GameState, c: Catalog, candidates: BattleEnemy[], at: number): BattleEnemy | undefined {
  const focus = s.huntFocus?.[s.areaId ?? ""] ?? "any";
  const match = (enemy: BattleEnemy) => focus === "any" ||
    (focus.startsWith("monster:") && enemy.monsterId === Number(focus.slice(8))) ||
    (focus.startsWith("element:") && combatStatus(c, enemy, at).monster.element.toLowerCase() === focus.slice(8));
  return candidates.slice().sort((a, b) => Number(match(b)) - Number(match(a)) ||
    playerBattleDistance(battleHeroAt(s, at), enemyPositionAt(a, at)) - playerBattleDistance(battleHeroAt(s, at), enemyPositionAt(b, at)) ||
    a.id.localeCompare(b.id))[0];
}

function freezeFieldHero(s: GameState, at: number) {
  if (!s.fieldHero || s.fieldHero.areaId !== s.areaId) return;
  const point = battleHeroAt(s, at);
  stopHeroMovement(s.fieldHero, point, at);
}
function faceHeroTowards(s: GameState, point: { x: number; y: number }, at: number) {
  const hero = sourceCell(battleHeroAt(s, at)), target = sourceCell(point);
  s.playerFacing = sourceFacing(target.x - hero.x, target.y - hero.y, s.playerFacing);
}
function updateFieldHero(s: GameState, at: number) {
  if (!s.areaId || s.status === "town" || s.status === "challenge") return;
  if (s.fieldHero?.areaId !== s.areaId) s.fieldHero = {
    areaId: s.areaId, from: { ...BATTLE_HERO }, position: { ...BATTLE_HERO },
    startedAt: at, arrivedAt: at, routeIndex: 0, phase: "seeking",
  };
  if (s.status !== "hunting") {
    freezeFieldHero(s, at);
    delete s.fieldHero!.targetId;
    s.fieldHero!.phase = "waiting";
  }
}

function walkDuration(from: { x: number; y: number }, to: { x: number; y: number }, speedMs: number) {
  return Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) * BATTLE_CELLS_PER_UNIT * speedMs));
}

interface RoutedActor {
  from?: { x: number; y: number };
  approachFrom?: { x: number; y: number };
  position: { x: number; y: number };
  startedAt: number;
  arrivedAt: number;
  movementRoute?: { x: number; y: number }[];
  movementTargetKey?: string;
  movementTargetWithinRange?: boolean;
  movementSpeedMs?: number;
}

/** Persist one legal graph segment; unchanged targets keep the active route. */
function moveOnFieldRoute(actor: RoutedActor, context: SimulationContext | undefined, areaId: string,
  from: { x: number; y: number }, target: { x: number; y: number }, targetId: string,
  range: number, metric: 'player' | 'square', speedMs: number, at: number): { available: boolean; withinRange: boolean; moving: boolean } {
  const navigation = context?.navigation;
  if (!navigation) return { available: false, withinRange: false, moving: false };
  const gridTarget = navigation.toGridPoint(areaId, target);
  const key = `${targetId}:${Math.floor(gridTarget.x)},${Math.floor(gridTarget.y)}:${range}:${metric}`;
  if (actor.movementTargetKey === key && at < actor.arrivedAt) {
    if (actor.movementSpeedMs !== speedMs && actor.movementRoute?.length) {
      const gridRoute = actor.movementRoute.map(point => navigation.toGridPoint(areaId, point));
      const total = gridRouteLength(gridRoute);
      const progress = Math.max(0, Math.min(1, (at - actor.startedAt) / Math.max(1, actor.arrivedAt - actor.startedAt)));
      let distanceAlong = total * progress, segment = 0;
      while (segment < gridRoute.length - 1) {
        const a = gridRoute[segment], b = gridRoute[segment + 1], length = Math.hypot(b.x - a.x, b.y - a.y);
        if (distanceAlong <= length) break;
        distanceAlong -= length;
        segment++;
      }
      const suffix = [navigation.toGridPoint(areaId, from), ...gridRoute.slice(segment + 1)];
      const remaining = gridRouteLength(suffix);
      const routePoints = [from, ...gridRoute.slice(segment + 1).map(point => navigation.toBattlePoint(areaId, point))];
      actor.from = { ...from }; actor.approachFrom = { ...from };
      actor.startedAt = at;
      actor.arrivedAt = at + Math.max(1, Math.ceil(remaining * speedMs));
      actor.movementRoute = routePoints;
      actor.movementSpeedMs = speedMs;
    }
    return { available: true, withinRange: actor.movementTargetWithinRange ?? false, moving: true };
  }
  const approach = navigation.routeToRange(areaId, from, target, range, metric);
  actor.movementTargetKey = key;
  if (!approach) {
    actor.from = { ...from }; actor.approachFrom = { ...from }; actor.position = { ...from };
    actor.startedAt = at; actor.arrivedAt = at + Math.max(250, speedMs);
    actor.movementTargetWithinRange = false;
    delete actor.movementRoute;
    delete actor.movementSpeedMs;
    return { available: true, withinRange: false, moving: true };
  }
  actor.movementTargetWithinRange = approach.withinRange;
  const route = approach.route;
  const destination = route.points.at(-1) ?? from;
  actor.from = { ...route.points[0] ?? from };
  actor.approachFrom = { ...route.points[0] ?? from };
  actor.position = { ...destination };
  actor.startedAt = at;
  actor.arrivedAt = at + Math.max(1, Math.ceil(route.distanceCells * speedMs));
  actor.movementRoute = route.points.map(point => ({ ...point }));
  actor.movementSpeedMs = speedMs;
  return { available: true, withinRange: approach.withinRange, moving: route.distanceCells > 1e-9 };
}

function stopRoutedMovement(actor: RoutedActor, at: number, point: { x: number; y: number }): void {
  actor.from = { ...point }; actor.approachFrom = { ...point }; actor.position = { ...point };
  actor.startedAt = actor.arrivedAt = at;
  delete actor.movementRoute;
  delete actor.movementTargetKey;
  delete actor.movementTargetWithinRange;
  delete actor.movementSpeedMs;
}

function sourceCell(point: { x: number; y: number }) {
  return { x: Math.floor(point.x * BATTLE_CELLS_PER_UNIT), y: Math.floor(point.y * BATTLE_CELLS_PER_UNIT) };
}
function enemyWalkBlocked(c: Catalog, enemy: BattleEnemy, at: number) {
  return combatStatus(c, enemy, at).immobilized || (enemy.statuses?.SC_ANKLESNARE?.expiresAt ?? 0) > at ||
    (enemy.statuses?.[RG_CLOSECONFINE_STATUS]?.expiresAt ?? 0) > at ||
    (enemy.statuses?.SC_BLADESTOP?.expiresAt ?? 0) > at ||
    !!enemy.statuses?.SC_SPIDERWEB?.webHeld && enemy.statuses.SC_SPIDERWEB.expiresAt > at;
}

function shrinkRecoil(s: GameState, c: Catalog, enemy: BattleEnemy, at: number, context?: SimulationContext) {
  const monster = c.monsters[enemy.monsterId], area = c.areas.find(entry => entry.id === s.areaId);
  if (monster.boss || monster.noKnockback || area?.noKnockback || monster.canMove === false || enemyWalkBlocked(c, enemy, at)) return;
  const point = enemyPositionAt(enemy, at), cell = sourceCell(point), hero = sourceCell(battleHeroAt(s, at));
  const away = sourceFacing(cell.x - hero.x, cell.y - hero.y);
  const pushed = context?.navigation && s.areaId
    ? context.navigation.displace(s.areaId, point, away.x * 2, away.y * 2)
    : { x: point.x + away.x * 2 / BATTLE_CELLS_PER_UNIT, y: point.y + away.y * 2 / BATTLE_CELLS_PER_UNIT };
  stopEnemyMovement(enemy, pushed, at);
  delete enemy.approachPausedAt;
  if (s.battle) s.battle.fieldDecisionAt = at;
  event(s, at, 'knockback', 'Shrink', undefined, 'enemy', { enemyId: enemy.id, monsterId: monster.id,
    sourceActorId: s.id, targetActorId: enemy.id, enemyPosition: { ...pushed }, actionSourcePosition: { ...point },
    areaId: s.areaId ?? undefined, actorAction: 'none' });
}

function canPlaceSlowGrace(s: GameState, c: Catalog, at: number) {
  if ((s.battle?.skillUnits ?? []).some(unit => unit.expiresAt > at && c.skills[unit.skillId]?.sourceName === 'DC_DONTFORGETME')) return false;
  const cells = slowGraceCells(battleHeroAt(s, at));
  return enemies(s).some(enemy => enemy.hp > 0 && enemy.startedAt <= at && slowGraceCovers(cells, enemyPositionAt(enemy, at)));
}
function canPlaceSoloGround(s: GameState, c: Catalog, source: string, target: BattleEnemy, at: number) {
  const groups = (s.battle?.skillUnits ?? []).filter(unit => unit.expiresAt > at && c.skills[unit.skillId]?.sourceName === source);
  if (source === 'AS_VENOMDUST') return !groups.length; // AFK avoids spending duplicate fields.
  if (source !== 'PF_SPIDERWEB' || groups.length >= 3) return false;
  if (['SC_HIDING', 'SC_CLOAKING', 'SC_CAMOUFLAGE', 'SC_CLOAKINGEXCEED', 'SC_NEWMOON']
    .some(name => (target.statuses?.[name]?.expiresAt ?? 0) > at)) return false;
  return !target.statuses?.SC_SPIDERWEB?.webHeld || target.statuses.SC_SPIDERWEB.expiresAt <= at;
}
function removeSoloUnit(s: GameState, unit: NonNullable<Battle['skillUnits']>[number], at: number) {
  removeGroundPlacement(s, unit.groundPlacementId);
  const victim = enemies(s).find(enemy => enemy.id === unit.capturedEnemyId);
  if (victim?.statuses?.SC_SPIDERWEB?.groundId === unit.id) delete victim.statuses.SC_SPIDERWEB;
  if (s.battle) { s.battle.skillUnits = s.battle.skillUnits?.filter(entry => entry !== unit); s.battle.fieldDecisionAt = at; }
}
function nextSlowGraceDeparture(s: GameState, unit: NonNullable<Battle['skillUnits']>[number], at: number) {
  let next = Infinity;
  for (const id of Object.keys(unit.targetTickAt ?? {})) {
    const enemy = enemies(s).find(actor => actor.id === id);
    if (!enemy || enemy.hp <= 0) return at;
    if (enemy.approachPausedAt !== undefined || !enemy.approachFrom || enemy.arrivedAt <= at || at < enemy.startedAt) continue;
    const point = enemyPositionAt(enemy, at);
    if (!slowGraceCovers(unit.cells, point)) return at;
    const departure = groundDepartureAt(enemy.approachFrom, enemy.position, enemy.startedAt, enemy.arrivedAt, point, at);
    if (departure !== undefined) next = Math.min(next, departure);
  }
  return next < Infinity ? next : undefined;
}
function tickSlowGraceUnit(s: GameState, c: Catalog, unit: NonNullable<Battle['skillUnits']>[number], at: number) {
  if (unit.expiresAt <= at) { removeSoloUnit(s, unit, at); return; }
  unit.nextSpDrainAt ??= unit.placedAt + SLOW_GRACE_SP_DRAIN_MS;
  const drain = resolveSlowGraceDrain(unit.nextSpDrainAt, unit.expiresAt, at, s.sp);
  if (drain.due) {
    if (drain.end) {
      event(s, at, 'status-end', 'Slow Grace terminou por falta de SP.', undefined, 'player',
        { skillId: unit.skillId, skillLevel: unit.level, sourceActorId: s.id, targetActorId: s.id, actorAction: 'none' });
      removeSoloUnit(s, unit, at);
      return;
    }
    s.sp -= drain.cost;
    unit.nextSpDrainAt = drain.nextAt;
  }
  const pulse = unit.nextTickAt <= at;
  const members = unit.targetTickAt ??= {};
  const live = new Set(enemies(s).map(enemy => enemy.id));
  for (const id of Object.keys(members)) if (!live.has(id)) delete members[id];
  for (const enemy of enemies(s)) {
    const current = enemy.statuses?.SC_DONTFORGETME;
    if (enemy.hp <= 0) { delete members[enemy.id]; continue; }
    const inside = enemy.startedAt <= at && slowGraceCovers(unit.cells, enemyPositionAt(enemy, at));
    if (inside && pulse) {
      const ownedStatus = current?.groundId === unit.id && current.expiresAt > at ? current : undefined;
      const values = unit.slowValues ?? { attackDelayPct: 0, moveSlowPct: 0 };
      (enemy.statuses ??= {}).SC_DONTFORGETME = {
        ...(ownedStatus ?? {}), startsAt: ownedStatus?.startsAt ?? at,
        expiresAt: at + SLOW_GRACE_OUTSIDE_MS, level: unit.level, skillId: unit.skillId,
        sourceActorId: s.id, sourceActionId: unit.sourceActionId, groundId: unit.id,
        attackDelayPct: values.attackDelayPct, moveSlowPct: values.moveSlowPct,
      };
      members[enemy.id] = at;
      if (!ownedStatus) event(s, at, 'status', 'Slow Grace', undefined, 'enemy', { skillId: unit.skillId,
        skillLevel: unit.level, statusName: 'SC_DONTFORGETME', sourceActorId: s.id,
        targetActorId: enemy.id, enemyId: enemy.id, monsterId: enemy.monsterId,
        actionId: unit.sourceActionId, actorAction: 'none' });
    } else if (!inside && members[enemy.id] !== undefined) {
      if (current && current.groundId === unit.id && current.expiresAt > at) current.expiresAt = at + SLOW_GRACE_OUTSIDE_MS;
      delete members[enemy.id];
    }
  }
  if (pulse) unit.nextTickAt = at + SLOW_GRACE_INTERVAL_MS;
}
function tickSoloUnit(s: GameState, c: Catalog, unit: NonNullable<Battle['skillUnits']>[number], at: number) {
  const skill = c.skills[unit.skillId];
  if (skill?.sourceName === 'DC_DONTFORGETME') { tickSlowGraceUnit(s, c, unit, at); return; }
  if (unit.expiresAt <= at) { removeSoloUnit(s, unit, at); return; }
  if (skill?.sourceName === 'AS_VENOMDUST') {
    const ticks = unit.targetTickAt ??= {};
    const alive = new Set(enemies(s).map(enemy => enemy.id));
    for (const id of Object.keys(ticks)) if (!alive.has(id)) delete ticks[id];
    for (const enemy of enemies(s)) {
      if (enemy.hp <= 0 || enemy.startedAt > at || !groundCovers(unit.cells, enemyPositionAt(enemy, at), 1) ||
        (ticks[enemy.id] ?? 0) > at) continue;
      ticks[enemy.id] = at + 1000;
      if ((enemy.statuses?.SC_POISON?.expiresAt ?? 0) > at) continue;
      const monster = combatStatus(c, enemy, at).monster, d = derivedStats(s, c);
      const result = classicStatusResistance(monster, 'SC_POISON', 100, 10000 + 5000 * unit.level,
        { level: s.baseLevel, luk: d.attributes?.luk ?? s.stats.luk });
      if (result.durationMs <= 0 || random(s) * 100 >= result.chancePct) continue;
      (enemy.statuses ??= {}).SC_POISON = { level: unit.level, startsAt: at, expiresAt: at + result.durationMs, nextTickAt: at + 1000 };
      provokeEnemy(s, c, enemy, at);
      event(s, at, 'status', 'Envenenado', undefined, 'enemy', { skillId: skill.id, skillLevel: unit.level,
        enemyId: enemy.id, targetActorId: enemy.id, actorAction: 'none' });
    }
    unit.nextTickAt = at + 100;
  } else if (skill?.sourceName === 'PF_SPIDERWEB') {
    const victim = enemies(s).find(enemy => enemy.id === unit.capturedEnemyId);
    if (victim && !groundCovers(unit.cells, enemyPositionAt(victim, at), 0)) {
      if (victim.statuses?.SC_SPIDERWEB?.groundId === unit.id) delete victim.statuses.SC_SPIDERWEB;
      delete unit.capturedEnemyId;
      unit.expiresAt = Math.min(unit.expiresAt, at + 1000);
    }
    unit.nextTickAt = unit.expiresAt;
  } else removeSoloUnit(s, unit, at);
}
function rememberEnemyFacing(enemy: BattleEnemy, towards?: { x: number; y: number }, at?: number) {
  const from = towards ? enemyPositionAt(enemy, at ?? enemy.arrivedAt) : enemy.approachFrom;
  const to = towards ?? enemy.position;
  if (from) {
    const dx = to.x - from.x, dy = to.y - from.y;
    if (Math.hypot(dx, dy) > 1e-9 && (towards || !enemy.facing ||
      ((at ?? enemy.startedAt) < enemy.arrivedAt && enemy.approachPausedAt === undefined))) {
      const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * Math.PI / 4;
      enemy.facing = { x: Math.round(Math.cos(angle)), y: Math.round(Math.sin(angle)) };
    }
  }
  return enemy.facing ?? { x: 0, y: -1 };
}

/** Idle automation chooses a reachable free cell in front of the approaching target.
 * Hercules NOFOOTSET/NOREITERATION cover the surrounding 3x3 cells, including
 * the caster and neutral monsters. One armed copy per rotation skill avoids
 * spending the whole supply while waiting for an enemy to step into it.
 */
function hunterTrapPosition(s: GameState, c: Catalog, skill: Skill, level: number, target: BattleEnemy,
  at: number, fixed?: { x: number; y: number }) {
  const b = s.battle;
  if (!b || b.traps?.some(trap => trap.skillId === skill.id && trap.expiresAt > at && trap.triggeredAt === undefined)) return;
  if (skill.sourceName === 'HT_SHOCKWAVE' && (target.sp ?? c.monsters[target.monsterId]?.maxSp ?? 0) <= 0) return;
  const heroPoint = battleHeroAt(s, at), hero = sourceCell(heroPoint), enemy = sourceCell(enemyPositionAt(target, at));
  const occupied = [hero, ...enemies(s).filter(actor => actor.hp > 0 && actor.startedAt <= at)
    .map(actor => sourceCell(enemyPositionAt(actor, at)))];
  const units = [...(b.traps ?? []).filter(trap => trap.expiresAt > at).map(trap => sourceCell(trap.position)),
    ...(b.skillUnits ?? []).filter(unit => unit.expiresAt > at && c.skills[unit.skillId]?.sourceName === 'AS_VENOMDUST')
      .flatMap(unit => unit.cells.map(sourceCell)),
    ...(b.groundEffects ?? []).filter(ground => ground.expiresAt > at &&
      (c.skills[ground.skillId]?.sourceName?.startsWith("HT_") || c.skills[ground.skillId]?.sourceName === "AS_VENOMDUST"))
      .map(ground => sourceCell(ground.position))];
  const range = skillAttackRange(s, c, skill, level);
  const valid = (point: { x: number; y: number }) => playerBattleDistance(heroPoint, point) <= range &&
    !occupied.some(cell => hunterTrapWithinRange(sourceCell(point), cell, 1)) &&
    !units.some(cell => hunterTrapWithinRange(sourceCell(point), cell, 1));
  if (fixed) return valid(fixed) ? { ...fixed } : undefined;
  const candidates: { x: number; y: number }[] = [];
  for (let x = hero.x - range; x <= hero.x + range; x++)
    for (let y = hero.y - range; y <= hero.y + range; y++) {
      const point = { x: (x + 0.5) / BATTLE_CELLS_PER_UNIT, y: (y + 0.5) / BATTLE_CELLS_PER_UNIT };
      if (valid(point)) candidates.push(point);
    }
  candidates.sort((a, z) => {
    const score = (point: { x: number; y: number }) => {
      const cell = sourceCell(point);
      return Math.hypot(cell.x - enemy.x, cell.y - enemy.y);
    };
    return score(a) - score(z) || a.y - z.y || a.x - z.x;
  });
  return candidates[0];
}

function expireHunterTrap(s: GameState, c: Catalog, trap: NonNullable<Battle["traps"]>[number], at: number) {
  const victim = enemies(s).find(enemy => enemy.id === trap.capturedEnemyId);
  if (victim?.statuses?.SC_ANKLESNARE) {
    delete victim.statuses.SC_ANKLESNARE;
    if (victim.approachPausedAt !== undefined && !enemyWalkBlocked(c, victim, at)) {
      const pausedMs = Math.max(0, at - victim.approachPausedAt);
      victim.startedAt += pausedMs; victim.arrivedAt += pausedMs;
      delete victim.approachPausedAt;
    }
  }
  if (trap.triggeredAt === undefined) {
    const reagent = c.skills[trap.skillId]?.itemCostByLevel?.[trap.level - 1]?.find(cost => cost.itemId === 1065);
    if (reagent && c.items[reagent.itemId]) {
      // Hercules drops one unused trap on the floor (also for Flasher's cost2).
      // Idle ground-loot collection uses the same inventory/visible-loot path.
      pickupItem(s, c, reagent.itemId, 1, at, { source: 'trap', areaId: s.areaId ?? undefined, position: { ...trap.position } }, false);
      event(s, at, "loot", c.items[reagent.itemId].name, undefined, undefined,
        { itemId: reagent.itemId, quantity: 1, enemyPosition: { ...trap.position }, areaId: s.areaId ?? undefined });
    }
  }
  if (s.battle) s.battle.traps = s.battle.traps?.filter(unit => unit !== trap);
}

/** Source skill_unit_onplace_timer, not a second player action or resource payment. */
function tickHunterTrap(s: GameState, c: Catalog, trap: NonNullable<Battle["traps"]>[number], at: number, context?: SimulationContext) {
  if (trap.expiresAt <= at) { expireHunterTrap(s, c, trap, at); return; }
  if (trap.triggeredAt !== undefined) return;
  const skill = c.skills[trap.skillId], source = skill?.sourceName;
  if (!source || !isHunterTrapSkill(source)) { expireHunterTrap(s, c, trap, at); return; }
  const spec = hunterTrapSpec(source, trap.level, skill.groundDurationMs?.[trap.level - 1]), cell = sourceCell(trap.position);
  trap.nextTickAt = at + spec.intervalMs;
  const live = enemies(s).filter(enemy => enemy.hp > 0 && enemy.startedAt <= at &&
    (enemy.statuses?.SC_HOVERING?.expiresAt ?? 0) <= at);
  const target = live.find(enemy => hunterTrapWithinRange(cell, sourceCell(enemyPositionAt(enemy, at)), spec.triggerRadius));
  if (!target) return;
  trap.triggeredAt = at; trap.expiresAt = at + spec.usedLifetimeMs;
  event(s, at, "trap-trigger", skill.name, undefined, "enemy", { skillId: skill.id, skillLevel: trap.level,
    enemyId: target.id, monsterId: target.monsterId, enemyPosition: { ...trap.position },
    ...playerAction(s, c, at, "none"), targetActorId: target.id });
  if (source === 'HT_SHOCKWAVE') {
    const affected = live.filter(enemy => hunterTrapWithinRange(cell, sourceCell(enemyPositionAt(enemy, at)), spec.splashRadius));
    for (const enemy of affected) {
      const monster = c.monsters[enemy.monsterId];
      const maxSp = Math.max(0, Math.trunc(monster?.maxSp ?? 0));
      const currentSp = Math.min(maxSp, Math.max(0, Math.trunc(enemy.sp ?? maxSp)));
      const drained = Math.floor(currentSp * spec.spDrainPct / 100);
      enemy.sp = currentSp - drained;
      if (drained > 0) event(s, at, 'sp-drain', `${skill.name} drenou ${drained} SP de ${monster.name}.`, drained, 'enemy', {
        resource: 'sp', skillId: skill.id, skillLevel: trap.level, enemyId: enemy.id, monsterId: enemy.monsterId,
        enemyPosition: enemyPositionAt(enemy, at), targetActorId: enemy.id });
    }
    return;
  }
  if (source === "HT_SKIDTRAP") {
    const monster = c.monsters[target.monsterId];
    if (monster.boss || monster.noKnockback) return;
    const point = enemyPositionAt(target, at), facing = rememberEnemyFacing(target, undefined, at);
    const pushed = context?.navigation && s.areaId
      ? context.navigation.displace(s.areaId, point, -facing.x * spec.knockbackTiles, -facing.y * spec.knockbackTiles)
      : { x: point.x - facing.x * spec.knockbackTiles / BATTLE_CELLS_PER_UNIT,
        y: point.y - facing.y * spec.knockbackTiles / BATTLE_CELLS_PER_UNIT };
    stopEnemyMovement(target, pushed, at);
    delete target.approachPausedAt;
    if (s.battle) s.battle.fieldDecisionAt = at;
    return;
  }
  const attrs = derivedStats(s, c).attributes ?? s.stats;
  const affected = source === "HT_ANKLESNARE" ? [target] : live.filter(enemy =>
    hunterTrapWithinRange(cell, sourceCell(enemyPositionAt(enemy, at)), spec.splashRadius));
  for (const enemy of affected) {
    const status = hunterTrapStatus(combatStatus(c, enemy, at).monster, source, trap.level,
      { level: s.baseLevel, luk: attrs.luk });
    if (!status || status.durationMs <= 0 || random(s) * 100 >= status.chancePct) continue;
    const current = enemy.statuses?.[status.status];
    if (status.status === "SC_SLEEP" && ["SC_STONE", "SC_FREEZE", "SC_STUN", "SC_SLEEP"]
      .some(name => (enemy.statuses?.[name]?.expiresAt ?? 0) > at)) continue;
    if (status.status === "SC_BLIND" && current && current.expiresAt > at) continue;
    if (source === "HT_ANKLESNARE" && current && current.expiresAt > at && current.level > trap.level) {
      trap.capturedEnemyId = enemy.id; trap.expiresAt = current.expiresAt;
      continue;
    }
    (enemy.statuses ??= {})[status.status] = { expiresAt: at + status.durationMs, startsAt: at,
      level: trap.level, ...(source === "HT_ANKLESNARE" && { trapId: trap.id }) };
    if (status.blocksWalk && at < enemy.arrivedAt) enemy.approachPausedAt ??= at;
    if (source === "HT_ANKLESNARE") {
      trap.capturedEnemyId = enemy.id; trap.expiresAt = at + status.durationMs;
    }
  }
  if (source === "HT_ANKLESNARE" && !trap.capturedEnemyId) trap.expiresAt = at + 3000;
  if (s.battle && !s.battle.challengeId) s.battle.fieldDecisionAt = at;
}

function stopAtRange(from: { x: number; y: number }, target: { x: number; y: number }, range: number) {
  const distance = Math.hypot(target.x - from.x, target.y - from.y) * BATTLE_CELLS_PER_UNIT;
  const fraction = distance > 0 ? Math.max(0, distance - Math.max(0, range)) / distance : 0;
  return { x: from.x + (target.x - from.x) * fraction, y: from.y + (target.y - from.y) * fraction };
}

/** status_calc_speed: default PC cell time 150 ms; supported haste uses the source maximum. */
export function playerWalkSpeed(s: GameState, c: Catalog, at: number) {
  if (classicBuffActive(s, c, 'MO_STEELBODY', at)) return 200;
  const freeCastLevel = activeFreeCastLevel(s, c, at);
  const baseSpeedRate = freeCastLevel > 0 ? 175 - 5 * freeCastLevel : 100;
  let haste = 0;
  if (classicBuffActive(s, c, "AL_INCAGI", at)) haste = 25;
  if (classicBuffActive(s, c, 'LK_BERSERK', at)) haste = Math.max(haste, 25);
  for (const [id, buff] of Object.entries(s.buffs)) {
    if (buff.expiresAt <= at) continue;
    if (c.skills[id]?.sourceName === "SN_WINDWALK") haste = Math.max(haste, 2 * (s.combatEffects?.buffLevels?.[id] ?? s.learnedSkills[id] ?? 1));
    if (c.skills[id]?.sourceName === "WS_CARTBOOST") haste = Math.max(haste, 20);
  }
  if (c.classes[s.job]?.family === "thief" && s.job.includes("assassin")) haste = Math.max(haste, learnedBySource(s, c).TF_MISS ?? 0);
  const chasewalk = activeBySource(s, c, at).ST_CHASEWALK ?? 0;
  const tunnel = classicBuffActive(s, c, 'TF_HIDING', at) ? learnedBySource(s, c).RG_TUNNELDRIVE ?? 0 : 0;
  // Hiding's Tunnel Drive penalty adds to speed_rate after haste (status.c:5448/5531).
  return defenderStats(activeBySource(s, c, at).CR_DEFENDER ?? 0,
    Math.floor(150 * Math.max(40, baseSpeedRate - haste - (isPecoMounted(s, c) ? 25 : 0) + (tunnel > 0 ? 120 - 6 * tunnel : 0) + (chasewalk ? 35 - 5 * chasewalk : 0)) / 100), 0).cellSpeedMs;
}

function blockFieldHero(s: GameState, at: number, until: number) {
  if (!s.fieldHero || s.fieldHero.areaId !== s.areaId || s.battle?.challengeId) return;
  freezeFieldHero(s, at);
  s.fieldHero.phase = "fighting";
  s.fieldHero.moveBlockedUntil = Math.max(s.fieldHero.moveBlockedUntil ?? at, until);
}

/** Every segment is planned at its own deadline, never at the end of a replay window. */
function updateFieldActors(s: GameState, c: Catalog, at: number, context?: SimulationContext) {
  if (s.fieldHero && at < s.fieldHero.arrivedAt && at >= s.fieldHero.startedAt)
    faceHeroTowards(s, s.fieldHero.position, at);
  updateFieldHero(s, at);
  updateFieldPopulation(s, c, at, context);
  const b = s.battle;
  if (s.status !== "hunting" || !b || b.challengeId || !s.fieldHero) return;
  const hero = s.fieldHero;
  const live = enemies(s).filter(enemy => enemy.hp > 0);
  const playerCast = currentPlayerCast(s, at);
  const castFreeLevel = playerCast ? activeFreeCastLevel(s, c, at) : 0;
  const activeCast = b.cast && b.cast.startedAt <= at && at < b.cast.endsAt ? b.cast : undefined;
  let target = live.find(enemy => enemy.id === (activeCast?.targetId ?? b.targetId));
  if (!target && activeCast) {
    freezeFieldHero(s, at);
    hero.phase = 'fighting';
    syncBattle(s);
    return;
  }
  if (!target) {
    target = fieldTarget(s, c, live, at);
    b.targetId = target?.id;
  }
  hero.targetId = activeCast?.targetId ?? target?.id;
  const heroPoint = battleHeroAt(s, at);
  for (const enemy of live) {
    rememberEnemyFacing(enemy, undefined, at);
    const monster = c.monsters[enemy.monsterId];
    const point = enemyPositionAt(enemy, at);
    const distance = battleDistance(point, heroPoint);
    if (!enemy.engaged && monster.aggressive && distance <= (monster.viewRange ?? 10) && !playerHiddenFrom(s, c, monster, at))
      engageFieldEnemy(s, enemy, at);
    if (!enemy.engaged || !enemy.hostile) continue;
    if (monsterAttackTarget(s,enemy)!==s.id) continue;
    if (distance > (monster.chaseRange ?? 12) || playerHiddenFrom(s, c, monster, at)) {
      stopEnemyMovement(enemy, point, at);
      // A targeted spell already committed before concealment may still finish
      // (skill.c:6567/status.c:1030). Stop chasing without invalidating its owner.
      if (enemy.npcCombat?.cast && classicBuffActive(s, c, 'ST_CHASEWALK', at) &&
          !classicBuffActive(s, c, 'TF_HIDING', at)) continue;
      enemy.engaged = false; enemy.hostile = false;
      delete enemy.approachPausedAt;
      continue;
    }
    const immobilized = enemyWalkBlocked(c, enemy, at);
    const range = monster.attackRange ?? 1;
    if (immobilized || monster.canMove === false || distance <= range) {
      stopRoutedMovement(enemy, at, point);
      delete enemy.approachPausedAt;
      continue;
    }
    const status = combatStatus(c, enemy, at);
    const slow = Math.max((enemy.statuses?.quagmire?.expiresAt ?? 0) > at ? 50 : 0,
      (enemy.statuses?.SC_DEC_AGI?.expiresAt ?? 0) > at ? 25 : 0, status.moveSlowPct);
    const speed = Math.floor((monster.moveSpeedMs ?? 400) * (100 + slow) / 100);
    const routed = moveOnFieldRoute(enemy, context, s.areaId!, point, heroPoint, `hero:${s.id}`, range, 'square', speed, at);
    if (!routed.available) {
      const position = stopAtRange(point, heroPoint, range * 0.9);
      Object.assign(enemy, { approachFrom: point, position, startedAt: at,
        arrivedAt: at + walkDuration(point, position, speed) });
    }
    rememberEnemyFacing(enemy, undefined, at);
    delete enemy.approachPausedAt;
  }
  if (trickDeadActive(s, c, at)) {
    freezeFieldHero(s, at);
    hero.phase = 'waiting';
    hero.targetId = b.targetId ?? hero.targetId;
    syncBattle(s);
    return;
  }
  if (closeConfineActive(s, at)) {
    freezeFieldHero(s, at);
    hero.phase = 'fighting';
    hero.targetId = b.targetId ?? hero.targetId;
    syncBattle(s);
    return;
  }
  if (!target) {
    freezeFieldHero(s, at); hero.phase = "waiting";
    syncBattle(s); return;
  }
  if ((playerCast && !castFreeLevel) || at < (hero.moveBlockedUntil ?? 0) || classicBuffActive(s, c, 'KN_AUTOCOUNTER', at)) {
    freezeFieldHero(s, at); hero.phase = "fighting"; syncBattle(s); return;
  }
  const offensive = !activeCast && at >= (b.playerNextSkillAt ?? 0) ? chooseSkill(s, c, at, target, true, true, context) : undefined;
  const movementTarget = offensive?.sourceName === 'BA_PANGVOICE' ? pangVoiceTarget(s, c, at) ?? target
    : offensive?.sourceName === 'DC_WINKCHARM' ? winkCharmTarget(s, c, at) ?? target : target;
  const inRange = offensive ? skillTargetInRange(s, c, offensive, skillUseLevel(s, c, offensive.id), movementTarget, at)
    : playerBattleDistance(heroPoint, enemyPositionAt(movementTarget, at)) <= basicAttackRange(s, c);
  if (inRange) {
    freezeFieldHero(s, at); hero.phase = "fighting";
  } else if (classicBuffActive(s, c, "TF_HIDING", at) && !(learnedBySource(s, c).RG_TUNNELDRIVE > 0)) {
    freezeFieldHero(s, at); hero.phase = "waiting";
  } else {
    const range = offensive ? skillAttackRange(s, c, offensive, skillUseLevel(s, c, offensive.id)) : basicAttackRange(s, c);
    const enemyPoint = enemyPositionAt(movementTarget, at);
    const routed = moveOnFieldRoute(hero, context, s.areaId!, heroPoint, enemyPoint, `enemy:${movementTarget.id}`,
      range, 'player', playerWalkSpeed(s, c, at), at);
    if (routed.available) {
      if (routed.moving && hero.movementRoute?.length) faceHeroTowards(s, hero.position, at);
      if (routed.withinRange && !routed.moving) { freezeFieldHero(s, at); hero.phase = 'fighting'; }
      else hero.phase = routed.moving && hero.movementRoute?.length ? 'chasing' : 'waiting';
    } else {
      const position = stopAtRange(heroPoint, enemyPoint, range * 0.9);
      Object.assign(hero, { from: heroPoint, position, startedAt: at,
        arrivedAt: at + walkDuration(heroPoint, position, playerWalkSpeed(s, c, at)), phase: "chasing" });
      faceHeroTowards(s, position, at);
    }
  }
  syncBattle(s);
}

/** A bounded persisted map population, reused directly by grouped combat. */
function updateFieldPopulation(s: GameState, c: Catalog, at: number, context?: SimulationContext) {
  const area = c.areas.find((entry) => entry.id === s.areaId);
  if (!area || s.status === "town" || s.status === "challenge") return;
  if (s.fieldPopulation?.areaId !== area.id) s.fieldPopulation = {
    areaId: area.id, generation: (s.fieldPopulation?.generation ?? 0) + 1,
    enemies: [], respawns: [],
  };
  const population = s.fieldPopulation!;
  const count = ["sewer", "cave", "sea", "castle"].includes(area.scene) ? 3 : 4;
  if (s.battle && !s.battle.challengeId) enemies(s);
  // Keep an encounter already in progress. Refresh obsolete ambient actors only
  // after it finishes, preserving generation and pending respawn deadlines.
  if (!s.battle || !s.battle.enemies?.length)
    population.enemies = population.enemies.filter(enemy => area.monsters.includes(enemy.monsterId));
  // Adopt a saved encounter from before map populations existed without changing ids.
  if (s.battle && !s.battle.challengeId && !population.enemies.length && !population.respawns.length)
    for (const [slot, enemy] of (s.battle.enemies ?? []).slice(0, count).entries()) {
      enemy.fieldSlot = slot;
      enemy.engaged = true;
      population.enemies.push(enemy);
    }
  // Saved JSON contains independent object copies: combat is authoritative by id.
  if (s.battle && !s.battle.challengeId) {
    const combat = new Map(s.battle.enemies?.map(enemy => [enemy.id, enemy]));
    population.enemies = population.enemies.map(enemy => combat.get(enemy.id) ?? enemy);
  }
  for (let slot = 0; slot < count; slot++) {
    if (population.enemies.some(enemy => enemy.fieldSlot === slot)) continue;
    const respawn = population.respawns.find(entry => entry.slot === slot);
    if (respawn && respawn.at > at) continue;
    const monsterId = chooseAreaMonster(s, c, area, random(s));
    const monster = c.monsters[monsterId];
    if (!monster) continue;
    const home = context?.navigation ? context.navigation.home(area.id, slot) : fieldHome(slot);
    population.enemies.push({
      id: `field-${area.id}-${++population.generation}-${slot}`,
      fieldSlot: slot, engaged: false, monsterId, hp: monster.hp, maxHp: monster.hp, sp: monster.maxSp ?? 0,
      startedAt: at, arrivedAt: at, enemyNextAttackAt: at,
      spawnDirection: slot * 2, position: home, approachFrom: home, homePosition: home, hostile: false,
    });
    population.respawns = population.respawns.filter(entry => entry.slot !== slot);
  }
  for (const enemy of population.enemies) {
    enemy.sp ??= c.monsters[enemy.monsterId]?.maxSp ?? 0;
    if (enemy.engaged && (!s.battle || s.status !== "hunting")) {
      const point = enemyPositionAt(enemy, at);
      stopEnemyMovement(enemy, point, at);
      enemy.engaged = false;
      enemy.hostile = false;
      delete enemy.approachPausedAt;
    }
    for (const [name, status] of Object.entries(enemy.statuses ?? {})) {
      // Only a live field encounter (or its explicit pause) owns bomb deadlines.
      // Leaving it cancels the bomb; recovery must not replay an old explosion.
      const ownsBomb = !s.battle?.challengeId && !!s.battle?.enemies?.some(entry => entry.id === enemy.id) &&
        (s.status === 'hunting' || s.status === 'paused' && s.pausedStatus === 'hunting');
      if (name === 'SC_SPLASHER' ? !ownsBomb : status.expiresAt <= at) delete enemy.statuses![name];
    }
    const confused = (enemy.statuses?.SC_CONFUSION?.expiresAt ?? 0) > at;
    if (!confused) delete enemy.confusionWalkAt;
    if (confused && enemy.engaged && c.monsters[enemy.monsterId].canMove !== false &&
        !enemyWalkBlocked(c, enemy, at) && at >= enemy.arrivedAt && at >= (enemy.confusionWalkAt ?? at)) {
      const from = enemyPositionAt(enemy, at);
      // Hercules map:get_random_cell_in_range uses AREA_SIZE / 2 (7 cells).
      let dx = Math.floor(random(s) * 14) - 7, dy = Math.floor(random(s) * 14) - 7;
      if (dx === 0 && dy === 0) dx = 1;
      const navigation = context?.navigation;
      if (navigation) {
        const selected = navigation.area(area.id), gridFrom = navigation.toGridPoint(area.id, from);
        const x = Math.max(0, Math.min(selected.grid.width - 1, Math.floor(gridFrom.x) + dx));
        const y = Math.max(0, Math.min(selected.grid.height - 1, Math.floor(gridFrom.y) + dy));
        const destination = navigation.toBattlePoint(area.id, { x: x + 0.5, y: y + 0.5 });
        const speed = c.monsters[enemy.monsterId].moveSpeedMs ?? 400;
        moveOnFieldRoute(enemy, context, area.id, from, destination, `confusion:${enemy.id}:${x},${y}`, 0, 'square', speed, at);
      } else {
        const cell = sourceCell(from);
        const x = Math.max(0, Math.min(BATTLE_CELLS_PER_UNIT - 1, cell.x + dx));
        const y = Math.max(0, Math.min(BATTLE_CELLS_PER_UNIT - 1, cell.y + dy));
        const destination = { x: (x + 0.5) / BATTLE_CELLS_PER_UNIT, y: (y + 0.5) / BATTLE_CELLS_PER_UNIT };
        enemy.approachFrom = from; enemy.position = destination; enemy.startedAt = at;
        enemy.arrivedAt = at + walkDuration(from, destination, c.monsters[enemy.monsterId].moveSpeedMs ?? 400);
      }
      enemy.confusionWalkAt = enemy.arrivedAt;
    }
    if (!enemy.engaged && !combatStatus(c, enemy, at).immobilized &&
        c.monsters[enemy.monsterId].canMove !== false && at >= enemy.arrivedAt + 2200) {
      const from = enemyPositionAt(enemy, at);
      const status = combatStatus(c, enemy, at);
      const slow = Math.max((enemy.statuses?.quagmire?.expiresAt ?? 0) > at ? 50 : 0,
        (enemy.statuses?.SC_DEC_AGI?.expiresAt ?? 0) > at ? 25 : 0, status.moveSlowPct);
      const speed = Math.floor((c.monsters[enemy.monsterId].moveSpeedMs ?? 400) * (100 + slow) / 100);
      if (context?.navigation) {
        const selected = context.navigation.area(area.id), fromCell = context.navigation.toGridPoint(area.id, from);
        const dx = Math.floor(random(s) * 11) - 5, dy = Math.floor(random(s) * 11) - 5;
        const x = Math.max(0, Math.min(selected.grid.width - 1, Math.floor(fromCell.x) + dx));
        const y = Math.max(0, Math.min(selected.grid.height - 1, Math.floor(fromCell.y) + dy));
        const destination = context.navigation.toBattlePoint(area.id, { x: x + 0.5, y: y + 0.5 });
        moveOnFieldRoute(enemy, context, area.id, from, destination, `patrol:${enemy.id}:${x},${y}`, 0, 'square', speed, at);
      } else {
        enemy.approachFrom = from;
        enemy.position = fieldWanderPoint(enemy.fieldSlot!, at);
        enemy.startedAt = at;
        enemy.arrivedAt = at + walkDuration(from, enemy.position, speed);
      }
    }
  }
  if (s.battle && !s.battle.challengeId) s.battle.enemies = population.enemies.slice();
}
export function syncBattle(s: GameState) {
  const b = s.battle;
  if (!b) return;
  if (!b.enemies?.length) { b.hp = 0; b.targetId = undefined; return; }
  const target = b.enemies.find((e) => e.id === b.targetId) ?? b.enemies.find(e => e.engaged) ?? b.enemies[0];
  b.targetId = target.id;
  b.monsterId = target.monsterId;
  b.hp = target.hp;
  b.maxHp = target.maxHp;
  b.enemyNextAttackAt = target.enemyNextAttackAt;
}
function enemies(s: GameState): BattleEnemy[] {
  const b = s.battle!;
  b.enemies ??= [
    {
      id: `legacy-${b.startedAt}-${b.monsterId}`,
      monsterId: b.monsterId,
      hp: b.hp,
      maxHp: b.maxHp,
      startedAt: b.startedAt,
      arrivedAt: b.startedAt,
      enemyNextAttackAt: b.enemyNextAttackAt,
      spawnDirection: 2,
      position: { x: 0.64, y: 0.65 },
    },
  ];
  b.targetId ??= b.enemies[0]?.id;
  return b.enemies;
}
export function beginBattle(
  s: GameState,
  c: Catalog,
  monsterId: number,
  at: number,
  challengeId?: string,
  context?: SimulationContext,
) {
  const monster = c.monsters[monsterId];
  s.battle = {
    monsterId,
    hp: monster.hp,
    maxHp: monster.hp,
    startedAt: at,
    playerNextAttackAt: at + 1000,
    playerNextSkillAt: at + 1000,
    playerActionReadyAt: at,
    enemyNextAttackAt: at + Math.max(1000, monster.attackDelay),
    enemies: [],
  };
  if (challengeId) {
    const ch = c.challenges.find((ch) => ch.id === challengeId)!;
    Object.assign(s.battle, {
      challengeId: ch.id,
      attemptId: `${s.id}-attempt-${++s.challengeAttempts}`,
      deadlineAt: at + ch.timeoutMs,
    });
  }
  const area = c.areas.find((a) => a.id === s.areaId);
  if (!challengeId && area) {
    updateFieldPopulation(s, c, at, context);
    const population = s.fieldPopulation!;
    const target = fieldTarget(s, c, population.enemies, at);
    s.battle.enemies = population.enemies.slice();
    s.battle.targetId = target?.id;
    s.battle.fieldDecisionAt = at;
    updateFieldActors(s, c, at, context);
    syncBattle(s);
    if (target) event(s, at, "encounter", c.monsters[target.monsterId].name, undefined, "enemy", {
      enemyId: target.id, monsterId: target.monsterId,
    });
    return;
  }
  const count =
    challengeId || !area || area.monsters.length < 2
      ? 1
      : 1 + Math.floor(random(s) * 3);
  const direction = Math.floor(random(s) * 8);
  for (let i = 0; i < count; i++) {
    const id = i ? chooseAreaMonster(s, c, area!, random(s)) : monsterId;
    const mob = c.monsters[id];
    const spawnDirection = (direction + i * 3) % 8;
    const angle = ((spawnDirection * 45 - 90) * Math.PI) / 180;
    const arrivedAt = at + 3000 + i * 750;
    const enemy: BattleEnemy = {
      id: `enemy-${at}-${s.nextEventId}-${i}`,
      monsterId: id,
      hp: mob.hp,
      maxHp: mob.hp,
      sp: mob.maxSp ?? 0,
      startedAt: at,
      arrivedAt,
      enemyNextAttackAt: at,
      spawnDirection,
      hostile: !!challengeId || (mob.aggressive ?? false),
      approachFrom: {
        x: BATTLE_HERO.x + Math.cos(angle),
        y: BATTLE_HERO.y + Math.sin(angle),
      },
      position: {
        x: battleHeroAt(s, at).x + Math.cos(angle) * 0.9 / BATTLE_CELLS_PER_UNIT,
        y: battleHeroAt(s, at).y + Math.sin(angle) * 0.9 / BATTLE_CELLS_PER_UNIT,
      },
    };
    enemy.homePosition = { ...enemy.position };
    s.battle.enemies!.push(enemy);
    event(s, at, "encounter", mob.name, undefined, "enemy", {
      enemyId: enemy.id,
      monsterId: id,
    });
  }
  syncBattle(s);
}
function autoPotion(s: GameState, c: Catalog, at: number) {
  if (at < s.potionReadyAt || s.hp <= 0) return;
  if (classicBuffActive(s, c, 'LK_BERSERK', at) || trickDeadActive(s, c, at)) return;
  const d = derivedStats(s, c);
  const hp =
    s.autoPotion.hpThreshold > 0 &&
    s.hp < d.maxHp &&
    s.hp * 100 <= d.maxHp * s.autoPotion.hpThreshold;
  const sp =
    s.autoPotion.spThreshold > 0 &&
    s.sp < d.maxSp &&
    s.sp * 100 <= d.maxSp * s.autoPotion.spThreshold;
  const choose = (resource: "healHP" | "healSP", missing: number) => {
    const available = s.inventory.filter(
      (e) =>
        c.items[e.itemId]?.type === "consumable" &&
        (c.items[e.itemId][resource] ?? 0) > 0,
    );
    const sufficient = available.filter(
      (e) => (c.items[e.itemId][resource] ?? 0) >= missing,
    );
    return (sufficient.length ? sufficient : available).sort(
      (a, b) =>
        ((c.items[a.itemId][resource] ?? 0) -
          (c.items[b.itemId][resource] ?? 0)) *
          (sufficient.length ? 1 : -1) || a.itemId - b.itemId,
    )[0];
  };
  const entry =
    (hp ? choose("healHP", d.maxHp - s.hp) : undefined) ??
    (sp ? choose("healSP", d.maxSp - s.sp) : undefined);
  if (!entry) return;
  if (!consumeItemBlockReason(s,c,entry,at)) consumeItem(s,c,entry.uid,at);
}
function elementMultiplier(c: Catalog, element: string, monster: Monster) {
  const row =
    c.elementModifiers?.[element.toLowerCase()] ??
    c.elementModifiers?.[element];
  const levels = row?.[monster.element.toLowerCase()] ?? row?.[monster.element];
  return (levels?.[monster.elementLevel - 1] ?? 100) / 100;
}

function magicRodTarget(s: GameState, c: Catalog, level: number, at: number) {
  const window = magicRodWindow(level);
  return enemies(s).find(enemy => {
    const cast = enemy.npcCombat?.cast;
    const skill = cast && c.monsters[enemy.monsterId].npcStatusSkills?.find(candidate => candidate.skillId === cast.skillId && candidate.sourceRowIndex === cast.sourceRowIndex);
    return !!cast && skill?.damageType === 'magic' && cast.areaId === s.areaId && cast.targetActorId === s.id &&
      cast.startedAt <= at && cast.endsAt >= at && cast.endsAt < at + window && enemy.hp > 0 && enemy.hostile !== false &&
      (enemy.fieldSlot === undefined || enemy.engaged) && enemyDistanceAt(enemy, at, battleHeroAt(s, at)) <= skill.range;
  });
}

function resolveNpcMagicAttack(s: GameState, c: Catalog, enemy: BattleEnemy, monster: Monster,
  d: ReturnType<typeof derivedStats>, skill: MonsterStatusSkill, cast: NonNullable<NonNullable<BattleEnemy['npcCombat']>['cast']>, at: number, action: ActionMetadata) {
  const sourceSkill = c.skills[skill.sourceName.toLowerCase()] ?? Object.values(c.skills).find(candidate =>
    candidate.sourceName === skill.sourceName && candidate.herculesId === skill.skillId);
  const fogWallActive = fogWallDefending(s, c, at);
  // skill.c:6557..6563 checks PF_FOGWALL before battle_calc_magic_attack.
  if (fogWallActive && random(s) * 100 < 75) {
    event(s, at, 'miss', 'Miss!', undefined, 'player', { ...action, skillId: skill.sourceName.toLowerCase(),
      skillLevel: skill.level, enemyId: enemy.id, monsterId: monster.id, targetActorId: s.id, hitMotionMs: 0 });
    enemy.enemyNextAttackAt = at + monsterAttackInterval(monster);
    return;
  }
  const activeMatkPct = Object.values(enemy.statuses ?? {})
    .filter(status => status.expiresAt > at)
    .reduce((total, status) => total + (status.magicAttackPct ?? 0), 0);
  const [matkMin, matkMax] = monsterMagicAttack(monster.stats.int, activeMatkPct);
  const matk = matkMin + (matkMax > matkMin ? Math.floor(random(s) * (matkMax - matkMin)) : 0);
  const ratio = sourceSkill?.power[skill.level - 1] ?? 100;
  // Armor property is resolved independently; player race remains normal.
  // Hercules' Soul Strike bonus depends on the target, so an undead caster grants none.
  const targetBodyRace: string = 'normal';
  const undeadBonus = skill.sourceName === 'MG_SOULSTRIKE' && targetBodyRace === 'undead' ? 5 * skill.level : 0;
  const raw = Math.floor(matk * (ratio + undeadBonus) / 100);
  const spellElement = skill.element ?? sourceSkill?.element ?? 'neutral';
  const perHitDamage = monsterMagicDamage({ matk: raw, hardMdef: d.hardMdef ?? 0, softMdef: d.softMdef ?? 0,
    elementRate: sageFieldElementRate(monsterMagicElementRate(c, spellElement, playerDefenseElement(s, c)),
      sageFieldModifiers(s, enemy.id, at), spellElement) });
  const passiveReduction = classicIncomingSkillReduction(learnedBySource(s, c), monster.race, spellElement,
    (spellElement.toLowerCase() === 'neutral' ? d.effects.neutralResist ?? 0 : 0) + itemElementResistance(s,spellElement,at));
  let damage = Math.floor(perHitDamage * passiveReduction) * Math.max(1, skill.hitCount ?? 1);
  // battle.c:3472..3475 uses `damage -= 25 * damage / 100` for direct BF_SKILL.
  if (fogWallActive) damage = Math.max(0, damage - Math.floor(damage * 25 / 100));
  if (s.combatEffects?.energyCoat && damage > 0) {
    const coat = energyCoatMagicDamage(damage, s.sp, d.maxSp);
    damage = coat.damage;
    if (coat.spCost > s.sp) {
      s.combatEffects.energyCoat = false;
      const coatId = Object.keys(s.buffs).find(id => c.skills[id]?.sourceName === 'MG_ENERGYCOAT');
      cancelClassicBuff(s, c, 'MG_ENERGYCOAT');
      event(s, at, 'status-end', 'Energy Coat terminou por falta de SP.', undefined, 'player',
        { skillId: coatId ?? 'mg_energycoat', sourceActorId: s.id, targetActorId: s.id, actorAction: 'none' });
    } else {
      s.sp -= coat.spCost;
    }
  }
  const rodEntry = Object.entries(s.buffs).find(([id, buff]) => buff.expiresAt > at && c.skills[id]?.sourceName === 'SA_MAGICROD');
  if (rodEntry) {
    const [id, buff] = rodEntry;
    const level = s.combatEffects?.buffLevels?.[id] ?? s.learnedSkills[id] ?? 1;
    const window = magicRodWindow(level), armedAt = buff.expiresAt - window;
    if (magicRodAcceptsCast({ startsAt: cast.startedAt, endsAt: at, armedAt, expiresAt: buff.expiresAt })) {
      const baseSp = skill.baseSp ?? sourceSkill?.spCost[skill.level - 1] ?? sourceSkill?.spCost.at(-1) ?? 0;
      const refund = magicRodRefund(baseSp, level);
      damage = 0;
      s.sp = Math.min(d.maxSp, s.sp + refund);
      event(s, at, 'skill', 'Magic Rod', refund, 'player', { skillId: id, skillLevel: level,
        sourceActorId: s.id, targetActorId: s.id, enemyId: enemy.id, monsterId: monster.id,
        actionId: cast.actionId, actorAction: 'none', castMs: 0 });
    }
  }
  // Hercules battle.c:3590 decrements Kyrie's pool and hit count for any
  // positive hit, but only BF_WEAPON (or Throw Stone) is absorbed by it.
  if (damage > 0 && (s.combatEffects?.kyrieHp ?? 0) > 0 && (s.combatEffects?.kyrieHits ?? 0) > 0) {
    s.combatEffects!.kyrieHp! -= Math.floor(damage);
    s.combatEffects!.kyrieHits!--;
    if (s.combatEffects!.kyrieHp! <= 0 || s.combatEffects!.kyrieHits! <= 0) {
      for (const id of Object.keys(s.buffs))
        if (c.skills[id]?.sourceName === 'PR_KYRIE') delete s.buffs[id];
    }
  }
  const berserkActive = classicBuffActive(s, c, 'LK_BERSERK', at);
  const hitMotionMs = berserkActive ? 0 : defenseHitMotion(
    Math.min(800, Math.max(400, 800 - (d.attributes?.agi ?? s.stats.agi) * 4)), s.combatEffects?.endure, at);
  if (damage > 0 && s.combatEffects?.endure) {
    s.combatEffects.endure = endureHit(s.combatEffects.endure, at, { damage });
    if (!s.combatEffects.endure) cancelClassicBuff(s, c, 'SM_ENDURE');
  }
  const hpBefore = s.hp;
  if (sourceSkill) captureNpcSpell(s, c, sourceSkill, skill.level, damage, hpBefore, at, enemy);
  s.hp = Math.max(0, s.hp - damage);
  discardAloeveraUnderAutoBerserk(s,c,at);
  if (damage > 0) interruptSageEnchantCast(s, c, at);
  event(s, at, 'damage', monster.name, damage, 'player', { ...action, skillId: skill.sourceName.toLowerCase(),
    skillLevel: skill.level, enemyId: enemy.id, monsterId: monster.id, targetActorId: s.id,
    targetHpBefore: hpBefore, hitCount: skill.hitCount ?? 1, hitMotionMs: damage > 0 ? hitMotionMs : 0 });
  if (damage > 0) {
    cancelClassicBuff(s, c, 'TF_HIDING');
    cancelClassicBuff(s, c, 'AS_CLOAKING');
    cancelClassicBuff(s, c, 'ST_CHASEWALK');
  }
  if (!s.battle?.challengeId && s.areaId) recordAreaActivity(s, s.areaId, at, { damageTaken: damage });
  const activeCast = s.battle?.cast;
  if (activeCast && damage > 0 && c.skills[activeCast.skillId]?.interruptCast) {
    event(s, at, 'cast-interrupted', 'Conjuração interrompida.', undefined, 'player', {
      skillId: activeCast.skillId, sourceActorId: s.id, actorAction: 'none', actionId: activeCast.actionId });
    cancelSkillAction(s, activeCast.skillClockOwnership, at);
    s.battle!.cast = undefined;
    s.battle!.playerActionReadyAt = at + 1000;
    s.battle!.playerNextSkillAt = at + 1000;
    if (!s.battle?.challengeId && s.fieldHero?.areaId === s.areaId) s.fieldHero.moveBlockedUntil = at + 1000;
  }
  enemy.enemyNextAttackAt = at + monsterAttackInterval(monster);
  if (s.hp <= 0) defeatPlayer(s, c, at, !!s.battle?.challengeId);
}

/** Auto posture is useful only when its later linked action survives its own cost. */
function bladeStopAutoHasUsefulFollowup(s: GameState, c: Catalog, blade: Skill, level: number, at: number) {
  const incoming = bladeStopIncomingEnemy(s, c, level, at);
  if (!incoming) return false;
  const afterPayment = structuredClone(s);
  if (!paySkillResources(afterPayment, c, blade, level, at)) return false;
  const linkAt = at + bladeStopRules(level).waitMs;
  afterPayment.combatEffects ??= {};
  const clonedPartner = afterPayment.battle?.enemies?.find(enemy => enemy.id === incoming.id);
  if (!clonedPartner) return false;
  createBladeStopLink(afterPayment, clonedPartner, level, linkAt);
  const followups = new Set(['MO_FINGEROFFENSIVE', 'MO_INVESTIGATE', 'MO_CHAINCOMBO', 'MO_EXTREMITYFIST']);
  return s.rotation.some(id => {
    const skill = c.skills[id], followupLevel = s.learnedSkills[id];
    return !!skill && !!followupLevel && skill.implementation !== 'unsupported' &&
      followups.has(skill.sourceName ?? '') && bladeStopSkillAllowed(skill.sourceName ?? '', level) &&
      (s.skillReadyAt[id] ?? 0) <= linkAt &&
      canPaySkillResources(afterPayment, c, skill, followupLevel, linkAt);
  });
}

import { activePlayerStatus, treatmentSources, statusTreatmentEligible, resolveStatusTreatment, tickPlayerStatuses, nextPlayerStatusDeadline, playerRecoveryBlocked, clearPlayerDiseasesOnDeath } from './playerStatuses.js';
import { tryMonsterStatusSkill, takeMonsterStatusCast, applyMonsterStatusEffect, interruptMonsterStatusCast, cancelInvalidMonsterStatusCasts } from './monsterStatusSkills.js';
import { activeRuwachConcealment, revealRuwachTarget } from './ruwachRules.js';
import { resolveSageEnchantCast, interruptSageEnchantCast, cancelSageEnchantCast, sageEnchantCanStart, startSageEnchantCast } from './sageEnchantments.js';
import { tickChasewalk, CHASEWALK_STRENGTH_ID } from './chasewalk.js';
import { resolveSupportCast } from './supportCasts.js';
import { beginSkillAction, finishSkillAction, cancelSkillAction, sourceAfterCastDelay } from './skillActionClock.js';
import type { MonsterStatusSkill } from '../shared/types.js';
const bodyRelocationReachabilityCache = new WeakMap<GameState, Map<string, boolean>>();

function bodyRelocationCanReach(s: GameState, c: Catalog, skill: Skill, level: number, target: BattleEnemy,
  at: number, context?: SimulationContext, refresh = false): boolean {
  if (!skillTargetInRange(s, c, skill, level, target, at)) return false;
  // Omitted context is reserved for deterministic legacy unit fixtures.
  if (!context) return true;
  const navigation = context.navigation;
  if (!navigation || !s.areaId) return false;
  const from = battleHeroAt(s, at), targetPoint = enemyPositionAt(target, at);
  const area = navigation.area(s.areaId), gridFrom = navigation.toGridPoint(s.areaId, from);
  const startCell = Math.floor(gridFrom.y) * area.grid.width + Math.floor(gridFrom.x);
  const startInOrigin = startCell >= 0 &&
    (area.component[startCell >> 3] & (1 << (startCell & 7))) !== 0;
  const gridTarget = navigation.toGridPoint(s.areaId, targetPoint);
  const key = `${s.areaId}:${startInOrigin ? 'origin' : startCell}:${target.id}:${Math.floor(gridTarget.x)},${Math.floor(gridTarget.y)}`;
  let cache = bodyRelocationReachabilityCache.get(s);
  if (!cache) { cache = new Map(); bodyRelocationReachabilityCache.set(s, cache); }
  const known = refresh ? undefined : cache.get(key);
  if (known !== undefined) return known;
  const approach = navigation.routeToRange(s.areaId, from, targetPoint, 1, 'player');
  const reachable = !!approach?.withinRange;
  if (cache.size >= 128) cache.delete(cache.keys().next().value!);
  cache.set(key, reachable);
  return reachable;
}

function chooseSkill(
  s: GameState,
  c: Catalog,
  at: number,
  target: BattleEnemy,
  ignoreRange = false,
  offenseOnly = false,
  context?: SimulationContext,
): Skill | undefined {
  if ((s.playerCanActAt ?? 0) > at) return;
  const bladeLink = s.combatEffects?.bladeStopLink;
  const linkedTarget = bladeStopTarget(s, at);
  if (linkedTarget) target = linkedTarget;
  if (classicBuffActive(s, c, 'MO_STEELBODY', at) || classicBuffActive(s, c, 'LK_BERSERK', at) ||
    classicBuffActive(s, c, 'KN_AUTOCOUNTER', at) || classicBuffActive(s, c, 'ST_CHASEWALK', at)) return;
  const d = derivedStats(s, c);
  const entry = s.inventory.find((e) => e.uid === s.equipment.weapon);
  const type = entry ? c.items[entry.itemId]?.weaponType : undefined;
  for (const id of s.rotation) {
    const skill = c.skills[id],
      level = skillUseLevel(s, c, id);
    if (skill?.sourceName === 'KN_AUTOCOUNTER' && type === 'bow') continue;
    if (skill?.sourceName === 'CR_SHRINK') {
      const autoGuard = Object.values(c.skills).find(candidate => candidate.sourceName === 'CR_AUTOGUARD');
      const guardActive = (activeBySource(s, c, at).CR_AUTOGUARD ?? 0) > 0;
      const guardPlanned = !!autoGuard && s.rotation.includes(autoGuard.id) &&
        (s.learnedSkills[autoGuard.id] ?? 0) > 0 && autoGuard.implementation === 'supported' &&
        guardianSkillEligible(s, c, autoGuard);
      if (guardianStatusActive(s, c, 'CR_SHRINK', at) || !guardianShieldEquipped(s, c) ||
        !guardActive && !guardPlanned) continue;
    }
    if (skill?.sourceName === 'PA_SACRIFICE' &&
      (activeSacrifice(s, c, at) || s.hp <= sacrificeHpCost(d.maxHp) || target.hp <= 0 ||
        classicBuffActive(s, c, 'TF_HIDING', at) ||
        playerBattleDistance(battleHeroAt(s, at), enemyPositionAt(target, at)) > basicAttackRange(s, c))) continue;
    if (['CR_SHRINK', 'PA_SACRIFICE'].includes(skill?.sourceName ?? '') && skill &&
      !guardianSkillEligible(s, c, skill)) continue;
    // AFK policy: predict a nearby incoming basic hit; the posture does not
    // create a self attack or bypass native canact.
    if (skill?.sourceName === 'KN_AUTOCOUNTER' &&
      (playerBattleDistance(battleHeroAt(s, at), enemyPositionAt(target, at)) > basicAttackRange(s, c) + 1 ||
       target.npcCombat?.cast || nextEnemyAttackAt(s, c, target, at, at + val(skill.statusDurationMs, level)) === undefined)) continue;
    if (
      !skill ||
      !level ||
      skill.kind === "passive" ||
      skill.manualUse && !configurableSkillUseLevel(skill) && !['SA_FLAMELAUNCHER', 'SA_FROSTWEAPON', 'SA_LIGHTNINGLOADER', 'SA_SEISMICWEAPON', 'WS_MELTDOWN', 'AM_POTIONPITCHER'].includes(skill.sourceName ?? '') && skill.sourceName !== 'CR_SHRINK' &&
        !(skill.sourceName === 'PA_SACRIFICE' && skill.manualUse === 'activate') &&
        !(skill.sourceName === 'MO_BLADESTOP' && skill.manualUse === 'activate') &&
        !(skill.sourceName === 'HT_DETECTING' && skill.manualUse === 'activate') &&
        !(skill.sourceName === 'SA_MAGICROD' && skill.manualUse === 'activate') && !sageFieldSource(skill.sourceName) ||
      skill.implementation === "unsupported" ||
      (s.skillReadyAt[id] ?? 0) > at
    )
      continue;
    if (skill.sourceName === 'HT_DETECTING' &&
      (!detectingCanStart(s,c,skill,level,at) || !detectingAfkUseful(s,at))) continue;
    if (configurableSkillUseLevel(skill) && !soloAlchemyAfkUseful(s, c, skill, level, at)) continue;
    if (skill.targetType === 'enemy' && target.hp <= 0) continue;
    if (skill.sourceName === 'HT_POWER' &&
      !['brute', 'insect'].includes(c.monsters[target.monsterId]?.race.toLowerCase() ?? '')) continue;
    if (skill.sourceName === 'SA_MAGICROD' && ((s.buffs[id]?.expiresAt ?? 0) > at || !magicRodTarget(s, c, level, at))) continue;
    if (skill.sourceName === 'ST_PRESERVE' && !copiedSpell(s, c)) continue;
    if (bladeLink && linkedTarget && !bladeStopSkillAllowed(skill.sourceName ?? '', bladeLink.level)) continue;
    if (skill.sourceName === 'MO_BLADESTOP' && (bladeLink || s.combatEffects?.bladeStopWait && bladeStopWaitActive(s.combatEffects.bladeStopWait, at) ||
      !bladeStopAutoHasUsefulFollowup(s, c, skill, level, at))) continue;
    const breaker = skill.sourceName === 'SA_SPELLBREAKER';
    const dispell = skill.sourceName === 'SA_DISPELL';
    const sageEnchant = ['SA_FLAMELAUNCHER', 'SA_FROSTWEAPON', 'SA_LIGHTNINGLOADER', 'SA_SEISMICWEAPON'].includes(skill.sourceName ?? '');
    const sageField = !!sageFieldSource(skill.sourceName);
    if (sageField && (sageFieldIsActive(s, at) || !sageFieldCanStart(s, c, skill, level, at))) continue;
    if (sageEnchant && (!sageEnchantCanStart(s, c, skill, level, at) ||
      (s.buffs[id]?.expiresAt ?? 0) > at)) continue;
    const conversion=!!conversionSpec(skill.sourceName??'');
    if(conversion&&!elementalConversionTarget(s,c,skill,at))continue;
    const priestControl = priestControlSources.has(skill.sourceName??'');
    const priestTarget = priestControl ? priestControlTarget(s,c,skill.sourceName!,at) : undefined;
    if(priestControl&&!priestTarget)continue;
    const pangVoice = skill.sourceName === 'BA_PANGVOICE';
    const pangTarget = pangVoice ? pangVoiceTarget(s,c,at) : undefined;
    if (pangVoice && !pangTarget) continue;
    const winkCharm = skill.sourceName === 'DC_WINKCHARM';
    const winkTarget = winkCharm ? winkCharmTarget(s, c, at) : undefined;
    if (winkCharm && !winkTarget) continue;
    const closeConfine = skill.sourceName === 'RG_CLOSECONFINE' && closeConfineEligible(s, skill, target, at);
    if (skill.sourceName === 'RG_CLOSECONFINE' && !closeConfine) continue;
    const bodyRelocation = skill.sourceName === 'MO_BODYRELOCATION' &&
      bodyRelocationCanReach(s, c, skill, level, target, at, context);
    if (skill.sourceName === 'MO_BODYRELOCATION' && !bodyRelocation) continue;
    const breakerTarget = breaker && castControlEligible(s,c,skill,level,at)
      ? findInterruptibleNpcCast(s,c,at,spellBreakerCastMs(s,c,skill,level,at)) : undefined;
    if (breaker && !breakerTarget) continue;
    const treatment = treatmentSources.has(skill.sourceName ?? '');
    const targetMonster = c.monsters[target.monsterId];
    if (skill.sourceName === 'SA_DISPELL' &&
      activeDispellableMonsterStatuses(target, at).length === 0) continue;
    if (skill.sourceName === 'PR_TURNUNDEAD' &&
      !classicUndeadTargetEligible(combatStatus(c, target, at).monster)) continue;
    const hasMagicThreat = targetMonster.npcStatusSkills?.some(row => row.damageType === 'magic' && row.range > 3) ?? false;
    const fogWall = skill.sourceName === 'PF_FOGWALL' &&
      !fogWallDefending(s, c, at) && ((targetMonster.attackRange ?? 1) > 3 || hasMagicThreat) &&
      canPlaceSelfGround(s, c, skill, level, at, context);
    if (skill.sourceName === 'PF_FOGWALL' && !fogWall) continue;
    if (treatment && !statusTreatmentEligible(s, c, skill, level, at)) continue;
    if (offenseOnly && !offensiveSkill(skill) && !pangVoice && !winkCharm && !closeConfine && !fogWall && !bodyRelocation && !dispell) continue;
    if (s.battle?.supportNeedsOffense && !offensiveSkill(skill) && !treatment && !breaker && !priestControl && !conversion && !pangVoice && !winkCharm && !closeConfine && !fogWall && !bodyRelocation && !dispell &&
      skill.sourceName !== 'PA_SACRIFICE') continue;
    if (skill.sourceName === 'TF_PICKSTONE' && !pickStoneAfkNeeded(s, c)) continue;
    if (skill.sourceName === 'ALL_RESURRECTION' &&
      (target.hp <= 0 || !resurrectionMonsterEligible(combatStatus(c,target,at).monster))) continue;
    if (skill.sourceName === 'PF_SOULCHANGE' &&
      (!soulChangeMonsterEligible(target, combatStatus(c,target,at).monster) || s.sp >= d.maxSp ||
        soulChangeRecovery(d.maxSp) <= Math.floor(val(skill.spCost, level) *
          (1 - Math.min(100, d.effects.spCostReductionPct ?? 0) / 100)))) continue;
    if (skill.sourceName === 'PF_MINDBREAKER' && !mindBreakerEligible(c, target, at)) continue;
    if (skill.sourceName === "AS_ENCHANTPOISON" &&
      enchantPoisonCastBlocked(Object.keys(activeBySource(s, c, at)))) continue;
    if (skill.sourceName === "SA_AUTOSPELL" && !automaticSpellChoices(s, c, level)
      .some(choice => choice.skillId === s.autospellSkillId)) continue;
    if (["AL_PNEUMA", "MG_SAFETYWALL"].includes(skill.sourceName ?? "") &&
      !canPlaceDefenseGround(s, skill.sourceName!, at)) continue;
    if (skill.sourceName === 'DC_DONTFORGETME' && !canPlaceSlowGrace(s, c, at)) continue;
    if (isHunterTrapSkill(skill.sourceName ?? "") && !hunterTrapPosition(s, c, skill, level, target, at)) continue;
    if (['AS_VENOMDUST', 'PF_SPIDERWEB'].includes(skill.sourceName ?? '') &&
      !canPlaceSoloGround(s, c, skill.sourceName!, target, at)) continue;
    if (skill.sourceName === 'AS_SPLASHER' && !canApplySplasher({ hp: target.hp, maxHp: target.maxHp,
      boss: !!c.monsters[target.monsterId].boss, activeUntil: target.statuses?.SC_SPLASHER?.expiresAt ?? 0, at })) continue;
    if (skill.sourceName === 'WZ_SIGHTBLASTER' && !sightBlasterContactWithinCast(s, c, skill, level, target, at)) continue;
    if (skill.sourceName === 'AL_RUWACH' && (classicBuffActive(s, c, 'AL_RUWACH', at) ||
      !ruwachTargetWithinAura(s, skill, level, at))) continue;
    if (!['WZ_SIGHTBLASTER', 'AL_RUWACH'].includes(skill.sourceName ?? '') && !winkCharm &&
      !breaker && !sageEnchant && !sageField && !configurableSkillUseLevel(skill) && !treatment && !priestControl && !pangVoice && !conversion &&
      !ignoreRange && !skillTargetInRange(s, c, skill, level, target, at)) continue;
    if (skill.sourceName === "AL_CRUCIS" && !targets(s, skill, level, target, at).some((enemy) =>
      classicCrucisAffects(combatStatus(c,enemy,at).monster) &&
      (enemy.statuses?.SC_CRUCIS?.expiresAt ?? 0) <= at)) continue;
    if (skill.sourceName === 'ST_FULLSTRIP' && STRIP_STATUSES.every(name =>
      (target.statuses?.[name]?.expiresAt ?? 0) > at ||
      (target.statuses?.[name.replace('SC_NOEQUIP', 'SC_PROTECT')]?.expiresAt ?? 0) > at)) continue;
    if (
      !canPaySkillResources(s, c, skill, level, at) ||
      !comboAllowed(s, c, skill, at)
    )
      continue;
    if (classicBuffActive(s, c, "TF_HIDING", at) && !canActWhileHidden(skill))
      continue;
    // Level 1–2 Cloaking requires real wall cells, unavailable in this formation.
    if (skill.sourceName === "AS_CLOAKING" && level < 3) continue;
    if (
      skill.sourceName === "PF_HPCONVERSION" &&
      (s.sp >= d.maxSp || s.hp <= Math.floor(d.maxHp * 0.1))
    )
      continue;
    if (
      (skill.requiredWeapon?.length &&
        ((!type && skill.sourceName !== 'KN_AUTOCOUNTER') || !!type && !skill.requiredWeapon.includes(type))) ||
      (skill.requiredSlot && !s.equipment[skill.requiredSlot])
    )
      continue;
    if (
      skill.requiredTwoHanded &&
      (!entry || !c.items[entry.itemId]?.twoHanded)
    )
      continue;
    if (skill.requiredState) {
      const state = skill.requiredState.toLowerCase();
      if (state === 'riding' && !isPecoMounted(s, c)) continue;
      if (state === 'falcon' && !isFalconEquipped(s,c)) continue;
      const hasBuff = (source: string) =>
        Object.entries(s.buffs).some(
          ([id, b]) => b.expiresAt > at && c.skills[id]?.sourceName === source,
        );
      if (state === "sight" && !hasBuff("MG_SIGHT")) continue;
      if (state === "shield" && !s.equipment.shield) continue;
      if (state === "explosionspirits" && !hasBuff("MO_EXPLOSIONSPIRITS"))
        continue;
      if (state === "hiding" && !hasBuff("TF_HIDING")) continue;
      if (
        state === "inwater" &&
        !["sea"].includes(
          c.areas.find((a) => a.id === s.areaId)?.scene ?? "",
        ) &&
        !hasBuff("SA_DELUGE") && sageFieldModifiers(s, s.id, at).element !== 'water'
      )
        continue;
      if (state === "cartboost" && !hasBuff("WS_CARTBOOST")) continue;
      if (
        state === "cart" &&
        !Object.entries(s.learnedSkills).some(
          ([id, l]) => l > 0 && c.skills[id]?.sourceName === "MC_PUSHCART",
        )
      )
        continue;
      if (
        state === "combo" &&
        !(s.combatEffects?.combo && s.combatEffects.combo.expiresAt > at)
      )
        continue;
    }
    if (skill.kind === "heal" && skill.sourceName !== "AM_POTIONPITCHER" && s.hp > d.maxHp * 0.7) continue;
    if (
      !conversion && !pangVoice && !winkCharm && skill.statusEffect &&
      skill.targetType === "enemy" &&
      skill.sourceName !== 'LK_JOINTBEAT' &&
      (target.statuses?.[skill.statusEffect]?.expiresAt ?? 0) > at
    )
      continue;
    if (skill.kind === "steal" && !canSteal(s, c, skill, target)) continue;
    if (
      skill.kind === "buff" &&
      s.buffs[id]?.expiresAt > at &&
      !["MO_CALLSPIRITS", "CH_SOULCOLLECT", "AL_PNEUMA", "MG_SAFETYWALL"].includes(skill.sourceName ?? "")
    )
      continue;
    if (
      ["MO_CALLSPIRITS", "CH_SOULCOLLECT"].includes(skill.sourceName ?? "") &&
      (s.combatEffects?.spiritSpheres ?? 0) >=
        (skill.sourceName === "MO_CALLSPIRITS" ? level : 5)
    )
      continue;
    if (
      skill.sourceName === "MO_ABSORBSPIRITS" &&
      !(s.combatEffects?.spiritSpheres ?? 0)
    )
      continue;
    if (skill.mechanic === "HW_MAGICPOWER" && s.combatEffects?.magicPower)
      continue;
    return skill;
  }
}
function removeKilledFieldActor(s: GameState, enemy: BattleEnemy, at: number): boolean {
  if (enemy.fieldSlot === undefined || s.fieldPopulation?.areaId !== s.areaId) return false;
  s.fieldPopulation.enemies = s.fieldPopulation.enemies.filter(entry => entry.id !== enemy.id);
  s.fieldPopulation.respawns = s.fieldPopulation.respawns.filter(entry => entry.slot !== enemy.fieldSlot);
  s.fieldPopulation.respawns.push({ slot: enemy.fieldSlot, at: at + POST_WAVE_SEARCH_MS });
  return true;
}
function awardKill(
  s: GameState,
  c: Catalog,
  enemy: BattleEnemy,
  at: number,
  skill?: Skill,
  requireLivingOwner = false,
) {
  // XP may level up and healFull; native ore eligibility belongs to the actual kill instant.
  const oreOwnerWasAlive = s.hp > 0;
  if (s.combatEffects?.bladeStopLink?.partnerActorId === enemy.id) clearBladeStop(s, at);
  // Reward only finalizes the battle that actually owns this actor.
  const b = s.battle?.enemies?.some(entry => entry.id === enemy.id) ? s.battle : undefined,
    monster = c.monsters[enemy.monsterId];
  releaseCloseConfineTarget(s, enemy, at);
  const enemyPosition = { ...enemyPositionAt(enemy, at) };
  const areaId = b?.challengeId ? undefined : s.areaId ?? undefined;
  if (b?.attemptId && s.rewardedAttempts.includes(b.attemptId)) {
    clearTrickDead(s, c, at);
    cancelSageEnchantCast(s, c, at, 'Conjuração encerrada com o desafio.');
    s.battle = null;
    s.status = "town";
    s.pendingAreaId = null;
    return;
  }
  s.bestiary[monster.id] = (s.bestiary[monster.id] ?? 0) + 1;
  s.totals.kills++;
  const base = s.totals.baseExp,
    job = s.totals.jobExp;
  if (!requireLivingOwner || oreOwnerWasAlive) gainExp(
    s,
    c,
    monster.baseExp * c.rates.baseExp,
    monster.jobExp * c.rates.jobExp,
    at,
  );
  if (!b?.challengeId && s.areaId)
    recordAreaActivity(s, s.areaId, at, {
      kills: 1,
      baseExp: s.totals.baseExp - base,
      jobExp: s.totals.jobExp - job,
    });
  event(s, at, "kill", `${monster.name} derrotado.`, undefined, "enemy", {
    enemyId: enemy.id,
    enemyPosition: { ...enemyPosition },
    areaId,
    monsterId: monster.id,
  });
  for (const drop of [...monster.drops, ...(monster.mvpDrops ?? [])])
    if (
      c.items[drop.itemId] &&
      random(s) * 10000 < Math.min(10000, drop.chance * c.rates.drop)
    ) {
      pickupItem(s, c, drop.itemId, 1, at, { source: 'monster', areaId, enemyId: enemy.id,
        monsterId: monster.id, position: { ...enemyPosition } });
      if (!b?.challengeId && s.areaId)
        recordAreaActivity(s, s.areaId, at, {
          lootZeny: c.items[drop.itemId].sellPrice,
        });
      event(s, at, "loot", c.items[drop.itemId].type === "equipment" ? "Equipamento não identificado" : c.items[drop.itemId].name, undefined, undefined, {
        itemId: drop.itemId,
        quantity: 1,
        enemyId: enemy.id,
        enemyPosition: { ...enemyPosition },
        areaId,
        monsterId: monster.id,
      });
    }
  const oreItemId=findingOreItem(s,c,oreOwnerWasAlive);
  if(oreItemId!==undefined){
    pickupItem(s,c,oreItemId,1,at,{source:'skill',areaId,enemyId:enemy.id,monsterId:monster.id,position:{...enemyPosition}});
    if(!b?.challengeId&&s.areaId)recordAreaActivity(s,s.areaId,at,{lootZeny:c.items[oreItemId].sellPrice});
    event(s,at,'loot',c.items[oreItemId].name,undefined,undefined,{itemId:oreItemId,quantity:1,enemyId:enemy.id,enemyPosition:{...enemyPosition},areaId,monsterId:monster.id,skillId:'bs_findingore'});
  }
  const drain =
    Object.entries(s.learnedSkills).find(
      ([id]) => c.skills[id]?.sourceName === "HW_SOULDRAIN",
    )?.[1] ?? 0;
  if (
    drain &&
    skill?.kind === "magical" &&
    !val(skill.aoeRadius, s.learnedSkills[skill.id])
  )
    s.sp = Math.min(
      derivedStats(s, c).maxSp,
      s.sp + Math.floor((monster.level * (95 + 15 * drain)) / 100),
    );
  if (!b) {
    removeKilledFieldActor(s, enemy, at);
    updateQuests(s, c);
    return;
  }
  b.enemies = b.enemies!.filter((e) => e.id !== enemy.id);
  for (const unit of b.skillUnits ?? []) if (unit.capturedEnemyId === enemy.id) {
    delete unit.capturedEnemyId;
    unit.expiresAt = Math.min(unit.expiresAt, at + 1000); unit.nextTickAt = unit.expiresAt;
  }
  // Copy the shortened lifetime before the last kill discards this battle.
  pruneGroundPlacements(s, at);
  if (!b.challengeId && removeKilledFieldActor(s, enemy, at)) {
    if (s.pendingAreaId && b.targetId === enemy.id) b.fieldTransferReady = true;
    if (!b.enemies.some(entry => entry.id === b.targetId))
      b.targetId = fieldTarget(s, c, b.enemies, at)?.id;
    b.fieldDecisionAt = at;
    if (s.fieldHero) {
      s.fieldHero.targetId = b.targetId;
      s.fieldHero.phase = b.targetId ? "seeking" : "waiting";
    }
    syncBattle(s);
    updateQuests(s, c);
    return;
  }
  if (b.enemies.some(entry => entry.fieldSlot === undefined || entry.engaged)) {
    const target = fieldTarget(s, c, b.enemies.filter(entry => entry.fieldSlot === undefined || entry.engaged), at);
    b.targetId = target?.id;
    syncBattle(s);
    return;
  }
  if (b?.challengeId) {
    if (b?.attemptId && s.rewardedAttempts.includes(b.attemptId)) {
      clearTrickDead(s, c, at);
      cancelSageEnchantCast(s, c, at, 'Conjuração encerrada com o desafio.');
      s.battle = null;
      s.status = "town";
      return;
    }
    if (b.attemptId) s.rewardedAttempts.push(b.attemptId);
    const ch = c.challenges.find((ch) => ch.id === b?.challengeId)!;
    const previous = s.challengeWins[ch.id] ?? 0;
    s.challengeWins[ch.id] = previous + 1;
    s.challengeCooldowns[ch.id] = at + ch.cooldownMs;
    clearTrickDead(s, c, at);
    if (!previous) grantReward(s, c, ch.firstReward, at, { source: 'challenge', challengeId: ch.id });
    cancelSageEnchantCast(s, c, at, 'Conjuração encerrada com o desafio.');
    s.status = "town";
    s.autoResume = false;
  }
  s.battle = null;
  if (!b?.challengeId && s.pendingAreaId) {
    const next = c.areas.find((a) => a.id === s.pendingAreaId);
    if (next) {
      clearCloseConfine(s, at);
      s.areaId = next.id;
      if (!s.visitedAreas.includes(next.id)) s.visitedAreas.push(next.id);
      event(s, at, "hunt", `Caçando em ${next.name}.`);
    }
  }
  s.pendingAreaId = null;
  if (s.status === "hunting" && s.areaId)
    s.nextEncounterAt = at + encounterDelay(s, s.areaId, POST_WAVE_SEARCH_MS);
  updateQuests(s, c);
}
function targets(
  s: GameState,
  skill: Skill | undefined,
  level: number,
  target: BattleEnemy,
  at: number,
  center?: { x: number; y: number },
) {
  if (skill?.sourceName === 'KN_BRANDISHSPEAR') {
    const areas = brandishTargetAreas(s, target, level, at);
    return enemies(s).filter(enemy => enemy.startedAt <= at && areas.has(enemy.id));
  }
  const radius = val(skill?.aoeRadius, level) || (center ? 0.5 : 0);
  const selfCentered = skill?.targetType === "self" && val(skill.range, level) === 0;
  const point = center ?? (selfCentered ? battleHeroAt(s, at) : enemyPositionAt(target, at));
  return enemies(s).filter(
    (e) =>
      e.startedAt <= at &&
      ((!center && !selfCentered && e.id === target.id) ||
        (radius > 0 &&
          battleDistance(enemyPositionAt(e, at), point) <= radius)),
  );
}
/** Source target-anchored integer rows, captured before any knockback changes cells. */
function brandishTargetAreas(s: GameState, target: BattleEnemy, level: number, at: number): Map<string, BrandishFlag> {
  const hero = sourceCell(battleHeroAt(s, at)), anchor = sourceCell(enemyPositionAt(target, at));
  const facing = sourceFacing(anchor.x - hero.x, anchor.y - hero.y, s.playerFacing);
  const cells = new Map(brandishCells(anchor, facing, level).map(cell => [`${cell.x},${cell.y}`, cell.flag]));
  const result = new Map<string, BrandishFlag>();
  for (const enemy of enemies(s)) {
    const cell = sourceCell(enemyPositionAt(enemy, at)), flag = cells.get(`${cell.x},${cell.y}`);
    if (enemy.startedAt <= at && flag !== undefined) result.set(enemy.id, flag);
  }
  return result;
}
function applyEnemyStatus(
  s: GameState,
  c: Catalog,
  skill: Skill,
  level: number,
  target: BattleEnemy,
  at: number,
  center?: { x: number; y: number },
) {
  if (skill.sourceName === 'ST_FULLSTRIP') {
    const dex = derivedStats(s, c).attributes?.dex ?? s.stats.dex;
    for (const enemy of targets(s, skill, level, target, at, center)) {
      const protectedStatuses = STRIP_STATUSES.filter(name =>
        (enemy.statuses?.[name.replace('SC_NOEQUIP', 'SC_PROTECT')]?.expiresAt ?? 0) > at);
      const result = resolveFullStrip({ level, casterDex: dex, targetDex: combatStatus(c, enemy, at).monster.stats.dex,
        rollPct: random(s) * 100, protectedStatuses });
      if (!result.appliedStatuses.length) continue;
      provokeEnemy(s, c, enemy, at);
      for (const name of result.appliedStatuses)
        (enemy.statuses ??= {})[name] = { startsAt: at, expiresAt: at + Math.max(1, result.durationMs), level };
    }
    return;
  }
  if (!skill.statusEffect) return;
  const attrs = derivedStats(s, c).attributes ?? s.stats;
  const casterDex = attrs.dex;
  const fatalBlow = skill.sourceName === "SM_BASH"
    ? Object.values(c.skills).find((candidate) => candidate.sourceName === "SM_FATALBLOW")
    : undefined;
  const fatalBlowLevel = fatalBlow ? s.learnedSkills[fatalBlow.id] ?? 0 : 0;
  for (const enemy of targets(s, skill, level, target, at, center)) {
    if (enemy.hp <= 0 || skill.statusEffect === 'SC_POISON' && (enemy.statuses?.SC_POISON?.expiresAt ?? 0) > at) continue;
    const monster = combatStatus(c, enemy, at).monster;
    const strip = (skill.sourceName ?? "").startsWith("RG_STRIP");
    if (strip && (enemy.statuses?.[skill.statusEffect.replace('SC_NOEQUIP', 'SC_PROTECT')]?.expiresAt ?? 0) > at)
      continue;
    let chance = strip
      ? classicStripChance(level, casterDex, monster.stats.dex)
      : val(skill.statusChance, level, 100);
    if (skill.sourceName === "SM_PROVOKE")
      chance = classicProvokeBaseChance(monster, level, s.baseLevel);
    if (skill.sourceName === "AL_DECAGI")
      chance = classicDecreaseAgilityBaseChance(level, s.baseLevel, attrs.int);
    if (skill.sourceName === "AL_CRUCIS")
      chance = classicCrucisBaseChance(level, s.baseLevel, monster.level);
    if (skill.sourceName === "SM_BASH")
      chance = classicBashStunChance(level, s.baseLevel, fatalBlowLevel);
    if (skill.sourceName === "AL_CRUCIS" && !classicCrucisAffects(monster)) continue;
    let duration = strip
      ? classicStripDuration(
          val(skill.statusDurationMs, level, 5000),
          casterDex,
          monster.stats.dex,
        )
      : val(skill.statusDurationMs, level, 5000);
    if (skill.sourceName === "SM_BASH" && fatalBlowLevel > 0 && level > 5)
      duration = 5000;
    if (isClassicResistedStatus(skill.statusEffect)) {
      const resistance = classicStatusResistance(
        monster,
        skill.statusEffect,
        chance,
        duration,
        { level: s.baseLevel, luk: attrs.luk },
      );
      chance = resistance.chancePct;
      duration = resistance.durationMs;
    }
    if (
      (strip || !(monster.boss ?? !!s.battle?.challengeId)) &&
      random(s) * 100 < chance
    ) {
      provokeEnemy(s, c, enemy, at);
      if (skill.sourceName === "SM_PROVOKE") breakControlOnDamage(enemy, 1, at);
      (enemy.statuses ??= {})[skill.statusEffect] = {
        // Hercules marks Crucis INFINITE_DURATION; keep that in JSON with an
        // integer sentinel that remains active for every practical save age.
        expiresAt: skill.sourceName === "AL_CRUCIS" ? Number.MAX_SAFE_INTEGER :
          at + (skill.statusEffect === "SC_STONE"
            ? classicStoneTiming(duration, skill.durationMs ?? 5000)
                .totalDurationMs
            : duration),
        startsAt: at,
        ...(skill.statusEffect === "SC_STONE" && {
          petrifiesAt:
            at + classicStoneTiming(duration, skill.durationMs ?? 5000).delayMs,
        }),
        ...(skill.statusEffect === "SC_POISON" && { nextTickAt: at + 1000 }),
        level,
      };
      if (at < enemy.arrivedAt && combatStatus(c, enemy, at).immobilized)
        enemy.approachPausedAt ??= at;
    }
  }
}
function applyJointBeatStatus(
  s: GameState,
  c: Catalog,
  skill: Skill,
  level: number,
  target: BattleEnemy,
  at: number,
  part: JointBeatPart,
) {
  const monster = c.monsters[target.monsterId];
  if (monster.boss || random(s) * 100 >= jointBeatStatusChancePercent(level)) return;
  const previous = target.statuses?.SC_JOINTBEAT;
  const parts = mergeJointBeatParts(
    previous && previous.expiresAt > at ? previous.parts ?? [] : [],
    part,
  );
  (target.statuses ??= {}).SC_JOINTBEAT = {
    startsAt: at,
    expiresAt: at + (skill.statusDurationMs?.[level - 1] ?? skill.statusDurationMs?.at(-1) ?? 30000),
    level,
    parts,
  };
  if (part !== 'neck') return;
  const bleeding = classicStatusResistance(
    monster,
    'SC_BLOODING',
    100,
    skill.statusDurationMs?.[level - 1] ?? skill.statusDurationMs?.at(-1) ?? 30000,
    { level: s.baseLevel, luk: derivedStats(s, c).attributes?.luk ?? s.stats.luk },
  );
  if (bleeding.chancePct <= 0 || random(s) * 100 >= bleeding.chancePct) return;
  (target.statuses ??= {}).SC_BLOODING = {
    startsAt: at,
    expiresAt: at + bleeding.durationMs,
    nextTickAt: at + 10000,
    level,
    skillId: skill.id,
    sourceActorId: s.id,
  };
}
function damageEnemies(
  s: GameState,
  c: Catalog,
  target: BattleEnemy,
  at: number,
  skill?: Skill,
  level = 1,
  center?: { x: number; y: number },
  action = playerAction(s, c, at, "attack"),
  repeated = false,
  jointBeatPart?: JointBeatPart,
  context?: SimulationContext,
) {
  if (skill && ['HT_BLITZBEAT','SN_FALCONASSAULT'].includes(skill.sourceName ?? '')) {
    queueFalconStrike(s,c,skill,level,target,at,false,action.actionId);
    return;
  }
  if (jointBeatPart && skill?.sourceName === 'LK_JOINTBEAT')
    skill = { ...skill, power: [jointBeatDamagePercent(level, jointBeatPart)] };
  if (skill?.sourceName === "MO_FINGEROFFENSIVE") {
    const count = Math.max(1, s.combatEffects?.consumedSpheres ?? 1);
    skill = { ...skill, sourceHitCount: [count], hitCount: [count] };
  }
  const d = derivedStats(s, c),
    equipped = s.inventory.find((e) => e.uid === s.equipment.weapon),
    weapon = equipped ? c.items[equipped.itemId] : undefined;
  const hitTargets = targets(s, skill, level, target, at, center),
    magical = skill?.kind === "magical",
    boost = s.combatEffects?.magicPower ?? 0;
  const mounted = isPecoMounted(s, c);
  const brandishAreas = skill?.sourceName === 'KN_BRANDISHSPEAR' ? brandishTargetAreas(s, target, level, at) : undefined;
  // Engage the whole splash before any kill can finish the current wave.
  for (const enemy of hitTargets) {
    provokeEnemy(s, c, enemy, at);
    if (skill?.herculesId !== undefined && c.monsters[enemy.monsterId].npcStatusSkills?.some(row => row.condition === 'MSC_SKILLUSED'))
      (enemy.npcCombat ??= { firstAttackDone: false, readyAt: {} }).lastReceivedSkillId = skill.herculesId;
  }
  const bySource = Object.fromEntries(
    Object.entries(s.learnedSkills).map(([id, l]) => [
      c.skills[id]?.sourceName ?? id,
      l,
    ]),
  );
  for (const enemy of hitTargets) {
    if (
      ["WZ_STORMGUST", "WZ_FROSTNOVA"].includes(skill?.sourceName ?? "") &&
      (enemy.statuses?.SC_FREEZE?.expiresAt ?? 0) > at
    )
      continue;
    provokeEnemy(s, c, enemy, at);
    const enemyStatus = combatStatus(c, enemy, at, sageFieldModifiers(s, enemy.id, at));
    const monster = enemyStatus.monster;
    const counterCritical = (skill?.sourceName === 'KN_AUTOCOUNTER' ||
      !skill && classicBuffActive(s, c, 'KN_AUTOCOUNTER', at)) && d.crit !== 0;
    let crit = false;
    if (!skill || skill.sourceName === 'KN_AUTOCOUNTER') {
      const rolled = random(s) * 100 < Math.min(100, d.crit - monster.stats.luk * .2);
      crit = counterCritical || rolled;
      if (counterCritical && !skill) cancelClassicBuff(s, c, 'KN_AUTOCOUNTER');
    }
    const hitBonus =
      skill?.sourceName === "SM_BASH" || skill?.sourceName === "KN_PIERCE"
        ? 5 * level
        : skill?.sourceName === "SM_MAGNUM"
          ? 10 * level
          : skill?.sourceName === "PA_SHIELDCHAIN"
            ? 20
            : skill?.sourceName === "AS_SONICBLOW" &&
                (bySource.AS_SONICACCEL ?? 0) > 0
              ? 50
              : 0;
    const accuracy = Math.min(
      0.95,
      Math.max(
        0.05,
        ((80 + d.hit - enemyStatus.flee) * (1 + hitBonus / 100)) / 100,
      ),
    );
    if (!magical && !crit && !skill?.ignoreFlee && random(s) >= accuracy) {
      event(s, at, "miss", "Ataque errou.", undefined, "enemy", {
        enemyId: enemy.id,
        monsterId: monster.id,
        skillId: skill?.id,
        ...action,
        targetActorId: enemy.id,
        hitMotionMs: monster.damageMotionMs ?? 400,
      });
      continue;
    }
    const active = activeBySource(s, c, at);
    const attackElement =
      skill?.element && skill.element.toLowerCase() !== "weapon"
        ? skill.element
        : classicWeaponElement(active);
    const webFire = spiderWebFire(enemy.statuses?.SC_SPIDERWEB as SpiderWebStatus | undefined,
      skill?.ignoreElement ? '' : attackElement.toLowerCase(), at);
    if (webFire.multiplier !== 1) {
      if (webFire.status) enemy.statuses!.SC_SPIDERWEB = webFire.status;
      else delete enemy.statuses!.SC_SPIDERWEB;
      if (s.battle) s.battle.fieldDecisionAt = at;
    }
    const element = sageFieldElementRate(elementMultiplier(c, attackElement, monster),
      sageFieldModifiers(s, s.id, at), attackElement, !!skill?.ignoreElement) * webFire.multiplier;
    const sizeName = mounted && weapon?.weaponType === 'spear' && monster.size.toLowerCase() === 'medium'
      ? 'large' : monster.size;
    const size = weapon?.weaponType
      ? (c.sizeModifiers?.[weapon.weaponType]?.[sizeName.toLowerCase()] ??
          c.sizeModifiers?.[weapon.weaponType]?.[sizeName] ??
          100) / 100
      : 1;
    const shieldEntry = s.inventory.find((e) => e.uid === s.equipment.shield),
      shield = shieldEntry ? c.items[shieldEntry.itemId] : undefined;
    const stats = {
      ...d,
      ...d.attributes,
      baseLevel: s.baseLevel,
      baseAttack:
        d.baseAttack ?? d.attack -
        (d.weaponAttack ?? weapon?.attack ?? 0) -
        (d.weaponRefineAttack ?? 0),
      weaponType: weapon?.weaponType,
      weaponAttack: d.weaponAttack ?? weapon?.attack ?? 0,
      weaponLevel: weapon?.weaponLevel ?? 1,
      weaponWeight: weapon?.weight,
      weaponRefineAttack: d.weaponRefineAttack ?? 0,
      shieldWeight: shield?.weight,
      shieldRefine: shieldEntry?.refine,
      twoHanded: weapon?.twoHanded,
      mounted,
      brandishArea: brandishAreas?.get(enemy.id),
      critical: crit,
      damagePercent: d.effects.damagePct ?? 0,
      magicPowerPercent: boost * 5,
      targetCount: hitTargets.length,
      sizeMultiplier: size,
      elementMultiplier: element,
      learnedSkills: s.learnedSkills,
      skillLevelsBySource: bySource,
      activeSkillsBySource: active,
      targetDefPercent: enemyStatus.defPercent,
      maxHp: d.maxHp,
      maxSp: d.maxSp,
      hp: s.hp,
      sp: s.sp,
      cartWeightRatio: Math.min(
        1,
        s.inventory.reduce(
          (n, e) => n + (c.items[e.itemId]?.weight ?? 0) * e.quantity,
          0,
        ) / 8000,
      ),
      spiritSpheres:
        skill?.sourceName === "MO_FINGEROFFENSIVE"
          ? (s.combatEffects?.consumedSpheres ?? 0)
          : (s.combatEffects?.spiritSpheres ?? 0),
      consumedSpheres: s.combatEffects?.consumedSpheres ?? 0,
      targetHp: enemy.hp,
      targetIsBoss: skill?.sourceName === 'ALL_RESURRECTION' ? !!monster.boss : monster.boss ?? !!s.battle?.challengeId,
    };
    let damage = magical
      ? classicMagicDamage(stats, monster, skill!, level, () => random(s))
      : classicPhysicalDamage(stats, monster, skill, level, () => random(s));
    const lex = Object.entries(enemy.statuses ?? {}).find(
      ([name, effect]) => /LEXAETERNA/i.test(name) && effect.expiresAt > at,
    );
    if (damage > 0 && lex) {
      damage *= 2;
      delete enemy.statuses![lex[0]];
    }
    // Hercules case 0 includes Double Attack, but Triple Attack is a separate
    // skill attack. Gank runs before lethal damage and control-status breaking.
    const normalHit = !skill || skill.sourceName === "TF_DOUBLE";
    if (normalHit) attemptGank(s, c, enemy, at, {
      attackLanded: damage > 0, weaponType: weapon?.weaponType,
    });
    const targetHpBefore = enemy.hp;
    enemy.hp = Math.max(0, enemy.hp - damage);
    rememberMonsterAttacker(s,enemy,damage,at);
    interruptMonsterStatusCast(s, c, enemy, at, damage);
    breakControlOnDamage(enemy, damage, at);
    event(
      s,
      at,
      "damage",
      magical ? "Dano mágico" : "Ataque",
      damage,
      "enemy",
      {
        skillId: skill?.id,
        skillLevel: skill ? level : undefined,
        critical: crit,
        enemyId: enemy.id,
        monsterId: monster.id,
        hitCount: val(skill?.hitCount, level, 1),
        castMs: 0,
        ...action,
        targetActorId: enemy.id,
        targetHpBefore,
        hitMotionMs: monster.damageMotionMs ?? 400,
      },
    );
    if (skill?.sourceName === 'PA_SACRIFICE') {
      applyMeltdownHit(s, c, enemy, at, damage, skill);
      const playerHpBefore = s.hp;
      s.hp = Math.max(0, s.hp - sacrificeHpCost(d.maxHp));
      event(s, at, 'damage', 'Custo próprio do Sacrifício do Mártir', playerHpBefore - s.hp, 'player', {
        skillId: skill.id, skillLevel: level, sourceActorId: s.id, targetActorId: s.id,
        targetHpBefore: playerHpBefore, ...action, actorAction: 'none', actionMotionMs: 0, hitMotionMs: 0,
      });
      const playerDefeated = s.hp <= 0, challenge = !!s.battle?.challengeId;
      if (enemy.hp <= 0 && s.battle) awardKill(s, c, enemy, at, skill);
      if (playerDefeated) defeatPlayer(s, c, at, challenge);
      continue;
    }
    if (skill?.sourceName === "WZ_STORMGUST") {
      enemy.stormGustHits = damage > 0 ? (enemy.stormGustHits ?? 0) + 1 : 0;
      if (enemy.stormGustHits >= 3) {
        applyEnemyStatus(
          s,
          c,
          { ...skill, aoeRadius: [0], statusChance: [150] },
          level,
          enemy,
          at,
        );
        if (
          (enemy.statuses?.SC_FREEZE?.expiresAt ?? 0) > at ||
          enemy.stormGustHits > 250
        )
          enemy.stormGustHits = 0;
      }
    } else if (skill?.sourceName === 'LK_JOINTBEAT' && jointBeatPart) {
      if (damage > 0 && enemy.hp > 0) applyJointBeatStatus(s, c, skill, level, enemy, at, jointBeatPart);
    } else if (skill?.statusEffect && skill.sourceName !== "MO_EXTREMITYFIST")
      applyEnemyStatus(s, c, { ...skill, aoeRadius: [0] }, level, enemy, at);
    if (normalHit && enemy.hp > 0) {
      const enchant = Object.entries(s.buffs).find(([id, buff]) =>
        buff.expiresAt > at && c.skills[id]?.sourceName === "AS_ENCHANTPOISON");
      if (enchant) {
        const [id, buff] = enchant;
        const poison = enchantPoisonProc({
          monster, skillLevel: s.combatEffects?.buffLevels?.[id] ?? s.learnedSkills[id] ?? 1,
          buffExpiresAt: buff.expiresAt, at, casterLevel: s.baseLevel,
          casterLuk: d.attributes?.luk ?? s.stats.luk, skillAttack: false,
          landed: damage > 0, existingPoisonExpiresAt: enemy.statuses?.SC_POISON?.expiresAt,
          rng: () => random(s),
        });
        if (poison) (enemy.statuses ??= {}).SC_POISON = poison;
      }
      const edp = active.ASC_EDP ?? 0;
      const rules = deadlyPoisonRules(edp);
      if (rules && damage > 0) {
        const resisted = classicStatusResistance(monster, 'SC_POISON', rules.poisonChancePct,
          rules.poisonDurationMs, { level: s.baseLevel, luk: d.attributes?.luk ?? s.stats.luk });
        // status_change_start rolls before rejecting an existing DPOISON status.
        const applied = random(s) * 100 < resisted.chancePct;
        if (applied && (enemy.statuses?.SC_DPOISON?.expiresAt ?? 0) <= at) {
          const duration = Math.max(1000, Math.trunc(resisted.durationMs / 1000) * 1000);
          (enemy.statuses ??= {}).SC_DPOISON = { level: edp, startsAt: at, expiresAt: at + duration, nextTickAt: at + 1000 };
          const poisonDamage = deadlyPoisonInitialDamage(enemy.hp, enemy.maxHp);
          const targetHpBefore = enemy.hp;
          enemy.hp -= poisonDamage;
          if (poisonDamage) event(s, at, 'damage', 'Veneno Mortal', poisonDamage, 'enemy', {
            enemyId: enemy.id, monsterId: monster.id, actorAction: 'none', targetActorId: enemy.id, targetHpBefore, hitMotionMs: 0 });
        }
      }
    }
    if (normalHit && damage > 0 && enemy.hp > 0) tryAutoFalcon(s,c,enemy,at,action.actionId);
    applyMeltdownHit(s, c, enemy, at, damage, skill);
    if (enemy.hp <= 0 && s.battle) awardKill(s, c, enemy, at, skill);
    else if (skill?.sourceName === 'KN_BRANDISHSPEAR' && damage > 0 && !monster.boss && !monster.noKnockback &&
      !c.areas.find(area => area.id === s.areaId)?.noKnockback) {
      const point = enemyPositionAt(enemy, at), cell = sourceCell(point), hero = sourceCell(battleHeroAt(s, at));
      // skill.c:3140..3142 calculates target→caster, then reverses that source direction.
      const towardsCaster = sourceFacing(hero.x - cell.x, hero.y - cell.y);
      const pushed = context?.navigation && s.areaId
        ? context.navigation.displace(s.areaId, point, -towardsCaster.x * 3, -towardsCaster.y * 3)
        : { x: point.x - towardsCaster.x * 3 / BATTLE_CELLS_PER_UNIT,
          y: point.y - towardsCaster.y * 3 / BATTLE_CELLS_PER_UNIT };
      stopEnemyMovement(enemy, pushed, at);
      delete enemy.approachPausedAt;
      if (s.battle) s.battle.fieldDecisionAt = at;
    }
    else if (skill?.sourceName === 'WZ_SIGHTBLASTER' && damage > 0 && !monster.boss && !monster.noKnockback &&
      !c.areas.find(area => area.id === s.areaId)?.noKnockback) {
      const point = enemyPositionAt(enemy, at), cell = sourceCell(point), hero = sourceCell(battleHeroAt(s, at));
      const towardsCaster = sourceFacing(hero.x - cell.x, hero.y - cell.y);
      const pushed = context?.navigation && s.areaId
        ? context.navigation.displace(s.areaId, point, -towardsCaster.x * 3, -towardsCaster.y * 3)
        : { x: point.x - towardsCaster.x * 3 / BATTLE_CELLS_PER_UNIT,
          y: point.y - towardsCaster.y * 3 / BATTLE_CELLS_PER_UNIT };
      stopEnemyMovement(enemy, pushed, at);
      delete enemy.approachPausedAt;
      if (s.battle) s.battle.fieldDecisionAt = at;
      event(s, at, 'knockback', skill.name, undefined, 'enemy', { skillId: skill.id, skillLevel: level,
        enemyId: enemy.id, monsterId: monster.id, sourceActorId: s.id, targetActorId: enemy.id,
        enemyPosition: { ...pushed }, actionSourcePosition: { ...point }, areaId: s.areaId ?? undefined,
        actorAction: 'none' });
    }
    else if (
      skill?.sourceName === "MG_FIREWALL" &&
      !monster.boss &&
      monster.element.toLowerCase() !== "undead"
    ) {
      const point = enemyPositionAt(enemy, at);
      const dx = point.x - battleHeroAt(s, at).x,
        dy = point.y - battleHeroAt(s, at).y,
        length = Math.hypot(dx, dy) || 1;
      const pushed = context?.navigation && s.areaId
        ? context.navigation.displace(s.areaId, point, dx / length, dy / length)
        : { x: point.x + dx / length / BATTLE_CELLS_PER_UNIT,
          y: point.y + dy / length / BATTLE_CELLS_PER_UNIT };
      if (!context?.navigation && at < enemy.arrivedAt) {
        const remaining = Math.max(1, enemy.arrivedAt - at);
        enemy.approachFrom = pushed;
        enemy.startedAt = at;
        enemy.arrivedAt = at + remaining * battleDistance(pushed, enemy.position) / Math.max(1, battleDistance(point, enemy.position));
      } else stopEnemyMovement(enemy, pushed, at);
    }
  }
  if (magical && s.combatEffects) s.combatEffects.magicPower = 0;
  if (magical && skill) {
    const active = Object.entries(s.buffs).find(([id, buff]) =>
      c.skills[id]?.sourceName === "PF_DOUBLECASTING" && buff.expiresAt > at);
    if (active) {
      const [id, buff] = active;
      const repeat = doubleCastingRepeat({ sourceName: skill.sourceName ?? "", skillLevel: level,
        doubleCastingLevel: s.combatEffects?.buffLevels?.[id] ?? s.learnedSkills[id] ?? 1,
        at, buffExpiresAt: buff.expiresAt, attackMotionMs: d.attackMotionMs, repeated,
        rng: () => random(s) });
      if (repeat && s.battle) (s.battle.delayedSkills ??= []).push({ effect: "doublecast", skillId: skill.id,
        level: repeat.level, targetId: target.id, position: { ...enemyPositionAt(target, at) }, endsAt: repeat.at });
    }
  }
  if (s.battle) syncBattle(s);
}
/** Capture BF_MISC damage now; the timer only validates actor/map/distance and applies HP. */
function queueFalconStrike(s:GameState,c:Catalog,skill:Skill,level:number,primary:BattleEnemy,
  at:number,automatic:boolean,actionId?:string,triggerActionId?:string){
 const d=derivedStats(s,c),origin={...battleHeroAt(s,at)},anchor=sourceCell(enemyPositionAt(primary,at));
 const radius=skill.sourceName==='SN_FALCONASSAULT'?0:1;
 const selected=new Map<string,BattleEnemy>();
 for(const enemy of enemies(s)){
  const cell=sourceCell(enemyPositionAt(enemy,at));
  if(enemy.hp>0&&enemy.startedAt<=at&&(enemy.id===primary.id||radius>0&&
    Math.max(Math.abs(cell.x-anchor.x),Math.abs(cell.y-anchor.y))<=radius))selected.set(enemy.id,enemy);
 }
 if(!selected.size)return;
 const levels=learnedBySource(s,c),sourceCellPoint=sourceCell(origin);
 const id=actionId??`auto-falcon-${s.id}-${at}-${s.nextEventId}`;
 const strike:FalconStrike={id,triggerActionId,sourceActorId:s.id,sceneKey:classicGroundSceneKey(s),areaId:s.areaId??undefined,
  skillId:skill.id,level,automatic,launchedAt:at,impactAt:at+d.attackMotionMs,sourcePosition:origin,targets:[]};
 for(const enemy of selected.values()){
  provokeEnemy(s,c,enemy,at);
  const monster=combatStatus(c,enemy,at,sageFieldModifiers(s,enemy.id,at)).monster;
  const point=sourceCell(enemyPositionAt(enemy,at));
  let damage=falconDamage({dex:d.attributes?.dex??s.stats.dex,int:d.attributes?.int??s.stats.int,
   steelCrow:levels.HT_STEELCROW??0,level,kind:automatic?'auto':skill.sourceName==='SN_FALCONASSAULT'?'assault':'manual',
   targetCount:selected.size,elementRatePct:elementMultiplier(c,'Neutral',monster)*100});
  // No supported monster skill currently produces Pneuma; do not model a fake player ground on enemies.
  const lex=Object.entries(enemy.statuses??{}).find(([name,status])=>/LEXAETERNA/i.test(name)&&status.expiresAt>at);
  if(damage>0&&lex)delete enemy.statuses![lex[0]];
  damage=finishFalconDamage(damage,skill.sourceName==='SN_FALCONASSAULT'?1:level,!!lex);
  if(skill.herculesId!==undefined&&monster.npcStatusSkills?.some(row=>row.condition==='MSC_SKILLUSED'))
   (enemy.npcCombat??={firstAttackDone:false,readyAt:{}}).lastReceivedSkillId=skill.herculesId;
  strike.targets.push({enemyId:enemy.id,monsterId:enemy.monsterId,damage,
   maxDistance:Math.max(Math.abs(point.x-sourceCellPoint.x),Math.abs(point.y-sourceCellPoint.y))+14,
   hitMotionMs:monster.damageMotionMs??400});
 }
 (s.falconStrikes??=[]).push(strike);
 event(s,at,'falcon-flight',skill.name,undefined,'enemy',{skillId:skill.id,skillLevel:level,
  sourceActorId:s.id,targetActorId:primary.id,enemyId:primary.id,monsterId:primary.monsterId,
  actionId:id,triggerActionId,actorAction:'none',actionMotionMs:0,castMs:0,actionSourcePosition:origin,
  movementDestination:{...enemyPositionAt(primary,at)},areaId:strike.areaId});
}
function tryAutoFalcon(s:GameState,c:Catalog,target:BattleEnemy,at:number,triggerActionId?:string){
 if(!isFalconEquipped(s,c))return;
 const entry=s.inventory.find(item=>item.uid===s.equipment.weapon);
 if(!entry||c.items[entry.itemId]?.weaponType!=='bow')return;
 const skill=Object.values(c.skills).find(candidate=>candidate.sourceName==='HT_BLITZBEAT');
 const learned=skill?s.learnedSkills[skill.id]??0:0,level=autoFalconLevel(learned,s.jobLevel);
 if(!skill||skill.implementation!=='supported'||level<=0||!classSkills(c,s.job).includes(skill.id))return;
 const luk=derivedStats(s,c).attributes?.luk??s.stats.luk;
 if(!autoFalconProc(Math.floor(random(s)*1000),luk))return;
 queueFalconStrike(s,c,skill,level,target,at,true,undefined,triggerActionId);
}
function resolveFalconStrike(s:GameState,c:Catalog,strike:FalconStrike,at:number){
 // Consume before side effects: JSON/reconnect cannot apply an impact twice.
 s.falconStrikes=s.falconStrikes?.filter(entry=>entry.id!==strike.id);
 if(!s.falconStrikes?.length)delete s.falconStrikes;
 if(strike.sourceActorId!==s.id||strike.sceneKey!==classicGroundSceneKey(s))return;
 const origin=sourceCell(battleHeroAt(s,at)),skill=c.skills[strike.skillId];
 for(const captured of strike.targets){
  const enemy=s.battle?.enemies?.find(entry=>entry.id===captured.enemyId)??
   s.fieldPopulation?.enemies.find(entry=>entry.id===captured.enemyId);
  if(!enemy||enemy.hp<=0||enemy.monsterId!==captured.monsterId||enemy.startedAt>at)continue;
  const point=sourceCell(enemyPositionAt(enemy,at));
  if(Math.max(Math.abs(point.x-origin.x),Math.abs(point.y-origin.y))>captured.maxDistance)continue;
  const targetHpBefore=enemy.hp;enemy.hp=Math.max(0,enemy.hp-captured.damage);
  rememberMonsterAttacker(s,enemy,captured.damage,at);
  interruptMonsterStatusCast(s,c,enemy,at,captured.damage);breakControlOnDamage(enemy,captured.damage,at);
  const population=s.fieldPopulation?.enemies.find(entry=>entry.id===enemy.id);
  if(population&&population!==enemy)Object.assign(population,structuredClone(enemy));
  event(s,at,'damage','Ataque do falcão',captured.damage,'enemy',{skillId:strike.skillId,skillLevel:strike.level,
   sourceActorId:s.id,targetActorId:enemy.id,enemyId:enemy.id,monsterId:enemy.monsterId,actionId:strike.id,triggerActionId:strike.triggerActionId,
   actorAction:'none',actionMotionMs:0,actionStartedAt:strike.launchedAt,actionSourcePosition:strike.sourcePosition,
   areaId:strike.areaId,hitMotionMs:captured.hitMotionMs,hitCount:skill?.sourceName==='SN_FALCONASSAULT'?1:strike.level,
   castMs:0,targetHpBefore});
  if(enemy.hp<=0)awardKill(s,c,enemy,at,skill,true);
 }
 if(s.battle)syncBattle(s);
}
function resolveUnattachedFalconStrikes(s:GameState,c:Catalog,until:number){
 const persistedAt=s.lastSimulatedAt;
 try{
  for(const strike of [...(s.falconStrikes??[])].sort((a,b)=>a.impactAt-b.impactAt||a.id.localeCompare(b.id))){
   if(strike.impactAt>until)continue;
   s.lastSimulatedAt=strike.impactAt;resolveFalconStrike(s,c,strike,strike.impactAt);
  }
 }finally{s.lastSimulatedAt=persistedAt;}
}

/** Automatic magic is a secondary effect of the swing, never a new actor action. */
function hindsightAttack(s: GameState, c: Catalog, target: BattleEnemy, at: number, normalAttack: boolean, context?: SimulationContext) {
  const selected = s.combatEffects?.autospell;
  const spell = selected && c.skills[selected.skillId];
  const active = Object.entries(s.buffs).find(([id, buff]) =>
    c.skills[id]?.sourceName === "SA_AUTOSPELL" && buff.expiresAt > at);
  if (!active || !selected || !spell || spell.implementation === "unsupported") return;
  const [id, buff] = active;
  const proc = hindsightProc({ autospellLevel: s.combatEffects?.buffLevels?.[id] ?? s.learnedSkills[id] ?? 1,
    maxLevel: selected.level, sp: s.sp, at, buffExpiresAt: buff.expiresAt, normalAttack,
    spCost: level => val(spell.spCost, level), rng: () => random(s) });
  if (!proc) return;
  s.sp -= proc.spCost;
  if (!s.battle || target.hp <= 0) return;
  const action = playerAction(s, c, at, "none");
  event(s, at, "skill", spell.name, undefined, "enemy", { skillId: spell.id, skillLevel: proc.level,
    enemyId: target.id, monsterId: target.monsterId, targetActorId: target.id, ...action });
  damageEnemies(s, c, target, at, spell, proc.level, undefined, action, false, undefined, context);
}
const TAROT_CARD_DURATION_MS = 30_000;
const TAROT_DISPELLABLE_MONSTER_BUFFS = [
  'SC_AGIUP', 'SC_INCREASEAGI', 'SC_BLESSING', 'SC_IMPOSITIO', 'SC_GLORIA',
  'SC_KYRIE', 'SC_ANGELUS', 'SC_ASSUMPTIO', 'SC_ENDURE', 'SC_AUTOGUARD',
  'SC_DEFENDER', 'SC_REFLECTSHIELD', 'SC_ENERGYCOAT', 'SC_MAGICPOWER',
  'SC_SPEEDUP0', 'SC_SPEEDUP1', 'SC_SPEEDUP2', 'SC_ATKUP', 'SC_MATKUP',
  'SC_ARMOR_PROPERTY', 'SC_CHANGEUNDEAD',
] as const;

const SA_DISPELL_PROTECTED_MONSTER_STATUSES = new Set([
  'SC_ASSUMPTIO', 'SC_ASSUMPTIO_BUFF', 'SC_NO_DISPELL', 'SC_TAROTCARD',
]);

function monsterStatusIsActive(status: { startsAt?: number; expiresAt: number } | undefined, at: number) {
  return !!status && (status.startsAt ?? 0) <= at && status.expiresAt > at;
}

function activeDispellableMonsterStatuses(target: BattleEnemy, at: number) {
  if (monsterStatusIsActive(target.statuses?.SC_HERMODE, at)) return [];
  return Object.entries(target.statuses ?? {})
    .filter(([name, status]) => monsterStatusIsActive(status, at) &&
      !SA_DISPELL_PROTECTED_MONSTER_STATUSES.has(name))
    .map(([name]) => name);
}

type TarotStatusValues = {
  attackPercent?: number;
  magicAttackPct?: number;
  hitPercent?: number;
  fleePercent?: number;
  defensePercent?: number;
};

function tarotMetadata(s: GameState, skill: Skill, level: number, target: BattleEnemy, action: Partial<GameEvent>) {
  return {
    skillId: skill.id, skillLevel: level, enemyId: target.id,
    monsterId: target.monsterId, sourceActorId: s.id, targetActorId: target.id,
    ...action,
  };
}

function applyTarotStatus(
  s: GameState, c: Catalog, skill: Skill, level: number, target: BattleEnemy,
  at: number, statusName: string, action: Partial<GameEvent>,
  options: { chancePct?: number; durationMs?: number; values?: TarotStatusValues } = {},
) {
  const base = c.monsters[target.monsterId];
  if (!base || target.hp <= 0) return false;
  let chancePct = options.chancePct ?? 100;
  let durationMs = options.durationMs ?? TAROT_CARD_DURATION_MS;
  if (isClassicResistedStatus(statusName)) {
    const attrs = derivedStats(s, c).attributes ?? s.stats;
    const resistance = classicStatusResistance(
      combatStatus(c, target, at).monster,
      statusName,
      chancePct,
      durationMs,
      { level: s.baseLevel, luk: attrs.luk },
    );
    chancePct = resistance.chancePct;
    durationMs = resistance.durationMs;
  }
  if (durationMs <= 0 || random(s) * 100 >= chancePct) return false;

  const stone = statusName === 'SC_STONE'
    ? classicStoneTiming(durationMs, skill.durationMs ?? 5000)
    : undefined;
  (target.statuses ??= {})[statusName] = {
    startsAt: at,
    expiresAt: at + (stone?.totalDurationMs ?? durationMs),
    ...(stone && { petrifiesAt: at + stone.delayMs }),
    level,
    skillId: skill.id,
    sourceActorId: s.id,
    sourceActionId: action.actionId,
    ...(statusName === 'SC_POISON' && { nextTickAt: at + 1000 }),
    ...options.values,
  };
  provokeEnemy(s, c, target, at);
  if (statusName === 'SC_CONFUSION') {
    const expiresAt = at + durationMs;
    releaseMonsterAttackTarget(s, c, target, at, {
      ...action, skillId: skill.id, skillLevel: level,
    });
    if (target.npcCombat) target.npcCombat.nextTargetCheckAt = expiresAt;
    target.confusionWalkAt = at;
  }
  if (at < target.arrivedAt && combatStatus(c, target, at).immobilized)
    target.approachPausedAt ??= at;
  event(s, at, 'status-start', statusName.replace(/^SC_/, '').replaceAll('_', ' '),
    undefined, 'enemy', { ...tarotMetadata(s, skill, level, target, action), statusName });
  return true;
}

function applyTarotDamage(
  s: GameState, c: Catalog, skill: Skill, level: number, target: BattleEnemy,
  at: number, fixedDamage: number, action: Partial<GameEvent>,
) {
  if (target.hp <= 0) return 0;
  const monster = c.monsters[target.monsterId];
  const before = target.hp;
  const damage = Math.min(before, Math.max(0, Math.trunc(fixedDamage)));
  target.hp = Math.max(0, before - damage);
  if (damage > 0) {
    rememberMonsterAttacker(s, target, damage, at);
    interruptMonsterStatusCast(s, c, target, at, damage);
    breakControlOnDamage(target, damage, at);
    event(s, at, 'damage', 'Carta do Destino', damage, 'enemy', {
      ...tarotMetadata(s, skill, level, target, action),
      targetHpBefore: before,
      enemyPosition: { ...enemyPositionAt(target, at) },
      hitMotionMs: monster.damageMotionMs ?? 400,
      actorAction: 'skill',
    });
    if (target.hp <= 0) awardKill(s, c, target, at, skill);
  }
  return damage;
}

function applyTarotComa(
  s: GameState, c: Catalog, skill: Skill, level: number, target: BattleEnemy,
  at: number, action: Partial<GameEvent>,
) {
  if (target.hp <= 0 || c.monsters[target.monsterId]?.boss) return;
  const before = target.hp;
  if (random(s) * 100 < 100) {
    target.hp = 1;
    const damage = Math.max(0, before - 1);
    if (damage > 0) {
      rememberMonsterAttacker(s, target, damage, at);
      event(s, at, 'damage', 'Coma', damage, 'enemy', {
      ...tarotMetadata(s, skill, level, target, action),
      targetHpBefore: before,
      enemyPosition: { ...enemyPositionAt(target, at) },
      hitMotionMs: c.monsters[target.monsterId].damageMotionMs ?? 400,
      actorAction: 'none',
      });
    }
  }
}

function applyTarotCardEffect(
  s: GameState, c: Catalog, skill: Skill, level: number, target: BattleEnemy,
  at: number, effect: TarotCardEffect, action: Partial<GameEvent>,
) {
  const metadata = tarotMetadata(s, skill, level, target, action);
  const status = (name: string, chancePct = 100, durationMs = TAROT_CARD_DURATION_MS, values?: TarotStatusValues) =>
    applyTarotStatus(s, c, skill, level, target, at, name, action, { chancePct, durationMs, values });
  switch (effect) {
    case 'drain-target-sp':
      target.sp = 0;
      event(s, at, 'status-start', 'Todo o SP do monstro foi drenado.', undefined, 'enemy', metadata);
      return;
    case 'halve-target-magic-attack':
      status('SC_TAROTCARD_MATK_PERC', 100, TAROT_CARD_DURATION_MS, { magicAttackPct: -50 });
      return;
    case 'clear-target-buffs':
      for (const statusName of TAROT_DISPELLABLE_MONSTER_BUFFS) {
        const active = target.statuses?.[statusName];
        if (!active || active.expiresAt <= at) continue;
        delete target.statuses![statusName];
        event(s, at, 'status-end', 'Efeito removido pela Carta do Destino.', undefined, 'enemy', {
          ...metadata, statusName,
        });
      }
      return;
    case 'fixed-damage-1000':
      applyTarotDamage(s, c, skill, level, target, at, 1000, action);
      // Hercules selects and attempts to break one of three equipment slots when the target survives.
      if (target.hp > 0) random(s);
      return;
    case 'halve-target-attack':
      status('SC_TAROTCARD_ATK_PERC', 100, TAROT_CARD_DURATION_MS, { attackPercent: -50 });
      return;
    case 'heal-caster-and-teleport-target': {
      const d = derivedStats(s, c);
      const before = s.hp;
      s.hp = Math.min(d.maxHp, s.hp + 2000);
      event(s, at, 'heal', 'A Carta do Destino restaurou HP.', s.hp - before, 'player', {
        ...metadata, targetActorId: s.id, actorAction: 'none',
      });
      const origin = enemyPositionAt(target, at);
      const angle = random(s) * Math.PI * 2;
      const distance = 1 + random(s) * 6;
      const position = {
        x: origin.x + Math.cos(angle) * distance,
        y: origin.y + Math.sin(angle) * distance,
      };
      stopEnemyMovement(target, position, at);
      event(s, at, 'status-start', 'O monstro foi teleportado.', undefined, 'enemy', {
        ...metadata, enemyPosition: { ...position },
      });
      return;
    }
    case 'stop-target': status('SC_STOP'); return;
    case 'freeze-target': status('SC_FREEZE'); return;
    case 'stone-target': status('SC_STONE'); return;
    case 'curse-coma-poison-target':
      applyTarotComa(s, c, skill, level, target, at, action);
      status('SC_CURSE');
      status('SC_POISON');
      return;
    case 'confuse-target':
      status('SC_CONFUSION');
      return;
    case 'fixed-damage-6666-and-debuff-target':
      applyTarotDamage(s, c, skill, level, target, at, 6666, action);
      status('SC_TAROTCARD_ATK_PERC', 100, TAROT_CARD_DURATION_MS, { attackPercent: -50 });
      status('SC_TAROTCARD_MATK_PERC', 100, TAROT_CARD_DURATION_MS, { magicAttackPct: -50 });
      status('SC_CURSE', level);
      return;
    case 'fixed-damage-4444':
      applyTarotDamage(s, c, skill, level, target, at, 4444, action);
      return;
    case 'stun-target':
      status('SC_STUN', 100, 5000);
      return;
    case 'weaken-target-combat-stats':
      status('SC_TAROTCARD_ATK_PERC', 100, TAROT_CARD_DURATION_MS, { attackPercent: -20 });
      status('SC_TAROTCARD_MATK_PERC', 100, TAROT_CARD_DURATION_MS, { magicAttackPct: -20 });
      status('SC_INCHITRATE', 100, TAROT_CARD_DURATION_MS, { hitPercent: -20 });
      status('SC_INCFLEERATE', 100, TAROT_CARD_DURATION_MS, { fleePercent: -20 });
      status('SC_TAROTCARD_DEF_PERC', 100, TAROT_CARD_DURATION_MS, { defensePercent: -20 });
      status('SC_TAROTCARD');
      return;
  }
}

function resolveSkill(
  s: GameState,
  c: Catalog,
  skill: Skill,
  level: number,
  target: BattleEnemy,
  at: number,
  groundTick = false,
  center?: { x: number; y: number },
  action = playerAction(s, c, at, groundTick ? "none" : "skill"),
  context?: SimulationContext,
) {
  let d = derivedStats(s, c);
  const mechanic = skill.sourceName ?? skill.mechanic;
  let jointBeatPart: JointBeatPart | undefined;
  if (!groundTick && mechanic === 'MO_BLADESTOP') {
    const incoming = bladeStopIncomingEnemy(s, c, level, at);
    if (s.combatEffects?.bladeStopWait && bladeStopWaitActive(s.combatEffects.bladeStopWait, at) || s.combatEffects?.bladeStopLink ||
      !incoming || incoming.id !== target.id) return false;
  }
  if (!groundTick && ['MO_FINGEROFFENSIVE', 'MO_INVESTIGATE', 'MO_CHAINCOMBO', 'MO_EXTREMITYFIST'].includes(mechanic ?? '')) {
    const link = s.combatEffects?.bladeStopLink;
    const linked = bladeStopTarget(s, at);
    if (!link || !linked || linked.id !== target.id || !bladeStopSkillAllowed(mechanic!, link.level)) return false;
  }
  if (!groundTick && mechanic === 'MO_BODYRELOCATION') {
    const activeTarget = s.battle?.enemies?.some(enemy => enemy.id === target.id && enemy.hp > 0);
    if (s.status !== 'hunting' || s.battle?.challengeId || s.battle?.targetId !== target.id ||
      !activeTarget || s.fieldHero?.areaId !== s.areaId ||
      !bodyRelocationCanReach(s, c, skill, level, target, at, context, true)) return false;
  }
  if (!groundTick && ['CR_SHRINK', 'PA_SACRIFICE'].includes(mechanic ?? '') &&
    (!guardianSkillEligible(s, c, skill) || skill.implementation === 'unsupported')) return false;
  if (!groundTick && mechanic === 'CR_SHRINK' && !guardianShieldEquipped(s, c)) return false;
  if (!groundTick && treatmentSources.has(mechanic ?? '') && !statusTreatmentEligible(s, c, skill, level, at)) return false;
  if (!groundTick && mechanic === 'TF_PICKSTONE' &&
    (!pickStoneAfkNeeded(s, c) || s.learnedSkills[skill.id] !== level)) return false;
  if (!groundTick && ['ALL_RESURRECTION', 'PF_SOULCHANGE'].includes(mechanic ?? '')) {
    if (target.hp <= 0 || !enemies(s).some(enemy => enemy.id === target.id) ||
      !skillTargetInRange(s, c, skill, level, target, at)) return false;
    const monster = combatStatus(c,target,at).monster;
    if (mechanic === 'ALL_RESURRECTION' ? !resurrectionMonsterEligible(monster)
      : !soulChangeMonsterEligible(target, monster)) return false;
  }
  if (!groundTick && mechanic === 'PF_MINDBREAKER' &&
      (!mindBreakerEligible(c, target, at) || !skillTargetInRange(s, c, skill, level, target, at))) return false;
  if (!groundTick && mechanic === 'KN_BRANDISHSPEAR') {
    const entry = s.inventory.find(item => item.uid === s.equipment.weapon);
    if (!isPecoMounted(s, c) || !entry || c.items[entry.itemId]?.weaponType !== 'spear') return false;
    action = { ...action, actorAction: 'attack' };
  }
  if (!groundTick && mechanic === 'KN_AUTOCOUNTER') action = { ...action, actionStartedAt: at + 100,
    actorAction: 'none', actionMotionMs: 0 };
  if (!groundTick && mechanic === 'AS_SPLASHER' && !canApplySplasher({ hp: target.hp, maxHp: target.maxHp,
    boss: !!c.monsters[target.monsterId].boss, activeUntil: target.statuses?.SC_SPLASHER?.expiresAt ?? 0, at })) return false;
  if (!groundTick && mechanic === 'RG_CLOSECONFINE' && !closeConfineEligible(s, skill, target, at)) return false;
  if (!groundTick && mechanic === "AS_ENCHANTPOISON" &&
    enchantPoisonCastBlocked(Object.keys(activeBySource(s, c, at)))) return false;
  if (!groundTick && mechanic === 'SA_SPELLBREAKER' && (!castControlEligible(s,c,skill,level,at) || !enemies(s).some(enemy=>enemy.id===target.id) || !skillTargetInRange(s,c,skill,level,target,at))) return false;
  if(!groundTick&&priestControlSources.has(mechanic??'')&&!priestControlEligible(s,c,skill,level,target,at))return false;
  if(!groundTick&&conversionSpec(mechanic??'')&&!elementalConversionEligible(s,c,skill,level,target,at))return false;
  const autoChoice = mechanic === "SA_AUTOSPELL" ? automaticSpellChoices(s, c, level)
    .find(choice => choice.skillId === s.autospellSkillId) : undefined;
  if (!groundTick && mechanic === "SA_AUTOSPELL" && !autoChoice) return false;
  const defensiveGround = ["AL_PNEUMA", "MG_SAFETYWALL"].includes(mechanic ?? "");
  if (!groundTick && defensiveGround && !canPlaceDefenseGround(s, mechanic!, at)) return false;
  const delayedControl = ["BA_FROSTJOKE", "DC_SCREAM"].includes(mechanic ?? "");
  const enemyControl =
    mechanic === 'ST_FULLSTRIP' || !!skill.statusEffect && !defensiveGround &&
    (delayedControl || ["enemy", "ground"].includes(skill.targetType ?? "") ||
      skill.sourceName === "AL_CRUCIS");
  const selfCentered = skill.targetType === "self" && val(skill.range, level) === 0;
  const groundPosition = { ...(center ?? (selfCentered ? battleHeroAt(s, at) : enemyPositionAt(target, at))) };
  const trapPosition = isHunterTrapSkill(mechanic ?? "") ? hunterTrapPosition(s, c, skill, level, target, at, center) : undefined;
  if (isHunterTrapSkill(mechanic ?? "") && !trapPosition) return false;
  const soloGround = ['AS_VENOMDUST', 'PF_SPIDERWEB'].includes(mechanic ?? '');
  if (!groundTick && soloGround && !canPlaceSoloGround(s, c, mechanic!, target, at)) return false;
  if (!groundTick && mechanic === 'PF_FOGWALL' && !canPlaceSelfGround(s, c, skill, level, at, context)) return false;
  const tarotRollPercent = !groundTick && mechanic === 'CG_TAROTCARD'
    ? Math.floor(random(s) * 100) : undefined;
  if (tarotRollPercent !== undefined && !tarotCardSuccess(level, tarotRollPercent)) {
    event(s, at, 'cast-failed', 'A Carta do Destino falhou.', undefined, 'player', {
      skillId: skill.id, skillLevel: level, sourceActorId: s.id, targetActorId: target.id,
      enemyId: target.id, monsterId: target.monsterId, ...action,
    });
    return false;
  }
  if (!groundTick && !paySkillResources(s, c, skill, level, at)) {
    event(
      s,
      at,
      "cast-failed",
      "Recursos insuficientes ao concluir a habilidade.",
      undefined,
      "player",
      { skillId: skill.id },
    );
    return false;
  }
  if (!groundTick && mechanic === 'CG_TAROTCARD') {
    event(s, at, 'skill', skill.name, undefined, 'enemy', {
      ...tarotMetadata(s, skill, level, target, action),
      castMs: val(skill.castTimeMs, level),
    });
    resolveTarotCardDraw(
      level,
      tarotRollPercent!,
      upperBound => Math.floor(random(s) * upperBound) as 3 | 14,
      effect => applyTarotCardEffect(s, c, skill, level, target, at, effect, action),
    );
    return true;
  }
  if (!groundTick && mechanic === 'SA_DISPELL') {
    const metadata = {
      skillId: skill.id, skillLevel: level, enemyId: target.id,
      monsterId: target.monsterId, sourceActorId: s.id,
      targetActorId: target.id, ...action, castMs: val(skill.castTimeMs, level),
    };
    event(s, at, 'skill', skill.name, undefined, 'enemy', metadata);
    const success = Math.floor(random(s) * 100) < 50 + 10 * level;
    if (!success) {
      event(s, at, 'cast-failed', 'O Desencantar falhou.', undefined, 'player', metadata);
      return true;
    }
    if (monsterStatusIsActive(target.statuses?.SC_HERMODE, at)) return true;
    for (const statusName of activeDispellableMonsterStatuses(target, at)) {
      delete target.statuses![statusName];
      event(s, at, 'status-end', 'Efeito removido por Desencantar.', undefined, 'enemy', {
        ...metadata, statusName,
      });
    }
    return true;
  }
  if (!groundTick && val(skill.groundDurationMs, level) > 0 &&
    sourceGroundShape(skill.sourceName ?? '', { x: 0, y: 0 })) {
    // Allocate before the handler appends its unit, so it is counted once.
    reserveGroundPlacementSlot(s, c, at);
    d = derivedStats(s, c);
  }
  if (!groundTick && mechanic === 'SA_MAGICROD') {
    const duration = val(skill.statusDurationMs, level, magicRodWindow(level));
    s.buffs[skill.id] = { expiresAt: at + duration, effects: {} };
    (s.combatEffects ??= {}).buffLevels ??= {};
    s.combatEffects.buffLevels[skill.id] = level;
    random(s); // status_start's guaranteed source roll.
    event(s, at, 'skill', skill.name, undefined, 'player', { skillId: skill.id, skillLevel: level,
      statusName: 'SC_MAGICROD', sourceActorId: s.id, targetActorId: s.id,
      ...action, actorAction: 'none', actionMotionMs: 0, castMs: 0 });
    event(s, at, 'status-start', skill.name, undefined, 'player', { skillId: skill.id, skillLevel: level,
      statusName: 'SC_MAGICROD', sourceActorId: s.id, targetActorId: s.id, actionId: action.actionId });
    return true;
  }
  if (!groundTick && mechanic === 'MO_BLADESTOP') {
    startBladeStopWait(s, level, at);
    random(s); // The source 100% SC_BLADESTOP_WAIT still runs status_start's roll.
    event(s, at, 'skill', skill.name, undefined, 'player', { skillId: skill.id, skillLevel: level,
      statusName: 'SC_BLADESTOP_WAIT', sourceActorId: s.id, targetActorId: s.id,
      ...action, actorAction: 'none', actionMotionMs: 0, castMs: 0 });
    event(s, at, 'status-start', skill.name, undefined, 'player', { skillId: skill.id, skillLevel: level,
      statusName: 'SC_BLADESTOP_WAIT', sourceActorId: s.id, targetActorId: s.id, ...action,
      actorAction: 'none', actionMotionMs: 0 });
    return true;
  }
  if (!groundTick && mechanic === 'MO_BODYRELOCATION') {
    const point = enemyPositionAt(target, at);
    const current = battleHeroAt(s, at);
    const legalApproach = context?.navigation && s.areaId
      ? context.navigation.routeToRange(s.areaId, current, point, 1, 'player')
      : undefined;
    if (context && !legalApproach?.withinRange) return false;
    const position = context?.navigation
      ? legalApproach!.route.points.at(-1) ?? current
      : stopAtRange(current, point, 1);
    stopHeroMovement(s.fieldHero!, position, at);
    Object.assign(s.fieldHero!, {
      phase: 'fighting',
      targetId: target.id,
    });
    s.battle!.targetId = target.id;
    s.battle!.fieldDecisionAt = at;
    faceHeroTowards(s, point, at);
    const extremityFist = Object.values(c.skills).find(candidate => candidate.sourceName === 'MO_EXTREMITYFIST');
    if (extremityFist) s.skillReadyAt[extremityFist.id] = at + 2000;
    event(s, at, 'skill', skill.name, undefined, 'player', {
      skillId: skill.id,
      skillLevel: level,
      enemyId: target.id,
      monsterId: target.monsterId,
      sourceActorId: s.id,
      targetActorId: s.id,
      ...action,
      actorAction: 'none',
      actionMotionMs: 0,
      castMs: 0,
    });
    return true;
  }
  if (!groundTick && mechanic === 'PF_MINDBREAKER') {
    provokeEnemy(s, c, target, at);
    return resolveMindBreaker(s, c, skill, level, target, at, action);
  }
  if (!groundTick && mechanic === 'PF_FOGWALL') {
    const caster = battleHeroAt(s, at);
    const placement = captureGroundPlacement(s, c, skill, level, at, caster, caster, context, true);
    if (!placement) return false;
    s.buffs[skill.id] = { expiresAt: placement.expiresAt, effects: {} };
    (s.combatEffects ??= {}).buffLevels ??= {};
    s.combatEffects.buffLevels[skill.id] = level;
    event(s, at, 'skill', skill.name, undefined, 'player', { skillId: skill.id, skillLevel: level,
      statusName: 'SC_FOGWALL', sourceActorId: s.id, targetActorId: s.id, ...action,
      actorAction: 'none', actionMotionMs: 0, castMs: 0 });
    event(s, at, 'status-start', skill.name, undefined, 'player', { skillId: skill.id, skillLevel: level,
      statusName: 'SC_FOGWALL', sourceActorId: s.id, targetActorId: s.id,
      ...action, actorAction: 'none', actionMotionMs: 0 });
    return true;
  }
  if (!groundTick && mechanic === 'LK_JOINTBEAT') {
    jointBeatPart = chooseJointBeatPart(random(s));
    action = { ...action, actorAction: 'attack' };
  }
  if (!groundTick && mechanic === 'WZ_SIGHTBLASTER') {
    s.buffs[skill.id] = { expiresAt: at + val(skill.statusDurationMs, level, 120000), effects: {} };
    const effects = (s.combatEffects ??= {});
    (effects.buffLevels ??= {})[skill.id] = level;
    event(s, at, 'skill', skill.name, undefined, 'player', { skillId: skill.id, skillLevel: level,
      sourceActorId: s.id, targetActorId: s.id, ...action, actorAction: 'none', actionMotionMs: 0, castMs: 0 });
    return true;
  }
  if (!groundTick && mechanic === 'RG_CLOSECONFINE')
    return applyCloseConfine(s, skill, level, target, at, action.actionId);
  if (!groundTick && mechanic === 'AL_RUWACH') {
    s.buffs[skill.id] = { expiresAt: at + val(skill.statusDurationMs, level, 10000), effects: {} };
    const effects = (s.combatEffects ??= {});
    (effects.buffLevels ??= {})[skill.id] = level;
    event(s, at, 'skill', skill.name, undefined, 'player', { skillId: skill.id, skillLevel: level,
      sourceActorId: s.id, targetActorId: s.id, ...action, actorAction: 'none', actionMotionMs: 0, castMs: 0 });
    return true;
  }
  if (!groundTick && mechanic === 'DC_DONTFORGETME' && s.battle) {
    const position = { ...battleHeroAt(s, at) };
    const lesson = learnedBySource(s, c).DC_DANCINGLESSON ?? 0;
    const slowValues = slowGraceValues(level, d.attributes?.dex ?? s.stats.dex, d.attributes?.agi ?? s.stats.agi, lesson);
    const unit: NonNullable<Battle['skillUnits']>[number] = {
      id: `song-${s.id}-${at}-${s.nextEventId}`, skillId: skill.id, level, position,
      cells: slowGraceCells(position), placedAt: at, nextTickAt: at,
      nextSpDrainAt: at + SLOW_GRACE_SP_DRAIN_MS,
      expiresAt: at + val(skill.groundDurationMs, level, SLOW_GRACE_DURATION_MS),
      sourceActionId: action.actionId, slowValues, targetTickAt: {},
    };
    (s.battle.skillUnits ??= []).push(unit);
    event(s, at, 'skill', skill.name, undefined, 'player', { skillId: skill.id, skillLevel: level,
      sourceActorId: s.id, targetActorId: s.id, ...action });
    tickSlowGraceUnit(s, c, unit, at);
    return true;
  }
  if(!groundTick&&conversionSpec(mechanic??'')) {
    event(s,at,'skill',skill.name,undefined,'enemy',{skillId:skill.id,skillLevel:level,enemyId:target.id,monsterId:target.monsterId,targetActorId:target.id,...action});
    return resolveElementalConversion(s,c,skill,level,target,at,action);
  }
  if(!groundTick&&priestControlSources.has(mechanic??'')) {
    event(s,at,'skill',skill.name,undefined,'enemy',{skillId:skill.id,skillLevel:level,enemyId:target.id,monsterId:target.monsterId,targetActorId:target.id,...action});
    return resolvePriestSoloControl(s,c,skill,level,target,at,action);
  }
  if (!groundTick && mechanic === 'BA_PANGVOICE') {
    event(s,at,'skill',skill.name,undefined,'enemy',{skillId:skill.id,skillLevel:level,enemyId:target.id,monsterId:target.monsterId,targetActorId:target.id,...action});
    return resolvePangVoice(s,c,skill,level,target,at,action);
  }
  if (!groundTick && mechanic === 'DC_WINKCHARM') {
    event(s,at,'skill',skill.name,undefined,'enemy',{skillId:skill.id,skillLevel:level,enemyId:target.id,monsterId:target.monsterId,targetActorId:target.id,...action});
    return resolveWinkCharm(s,c,skill,level,target,at,action);
  }
  if (!groundTick && mechanic === 'SA_SPELLBREAKER') {
    event(s,at,'skill',skill.name,undefined,'enemy',{skillId:skill.id,skillLevel:level,enemyId:target.id,monsterId:target.monsterId,targetActorId:target.id,...action});
    const effect=resolveSpellBreaker(s,c,skill,level,target,at);
    if(effect?.success) {
      const before=target.hp,damage=Math.min(before,effect.hpDamage);target.hp-=damage;
      if(damage>0)event(s,at,'damage',skill.name,damage,'enemy',{skillId:skill.id,skillLevel:level,enemyId:target.id,monsterId:target.monsterId,targetActorId:target.id,targetHpBefore:before,hitMotionMs:0,...action,actorAction:'none',actionMotionMs:0});
      const heal=Math.max(0,Math.min(d.maxHp-s.hp,effect.hpHeal));s.hp+=heal;
      if(heal>0)event(s,at,'heal',skill.name,heal,'player',{skillId:skill.id,skillLevel:level,targetActorId:s.id,...action,actorAction:'none',actionMotionMs:0});
      s.sp+=Math.max(0,Math.min(d.maxSp-s.sp,effect.spHeal));
      if(target.hp<=0)awardKill(s,c,target,at,skill);
    }
    return true;
  }
  if (!groundTick && treatmentSources.has(mechanic ?? '')) {
    if (!resolveStatusTreatment(s, c, skill, level, at)) return false;
    event(s, at, 'treatment', skill.name, undefined, 'player', { skillId: skill.id, skillLevel: level, targetActorId: s.id, ...action });
    return true;
  }
  if (!groundTick && mechanic === 'TF_PICKSTONE') {
    pickupItem(s, c, PICK_STONE_ITEM_ID, 1, at, { source: 'skill', areaId: s.areaId ?? undefined,
      position: { ...battleHeroAt(s, at) } }, false);
    event(s, at, 'skill', 'Pedra coletada', 1, 'player', { skillId: skill.id, skillLevel: level,
      itemId: PICK_STONE_ITEM_ID, quantity: 1, targetActorId: s.id, ...action });
    return true;
  }
  if (!groundTick && mechanic === 'PF_SOULCHANGE') {
    target.soulChangeUsed = true;
    const restored = Math.min(d.maxSp - s.sp, soulChangeRecovery(d.maxSp));
    s.sp += restored;
    event(s, at, 'skill', skill.name, restored, 'player', { skillId: skill.id, skillLevel: level,
      enemyId: target.id, monsterId: target.monsterId, targetActorId: target.id, ...action });
    return true;
  }
  if (!groundTick && soloGround && s.battle) {
    const id = `ground-${s.id}-${at}-${s.nextEventId}`, position = cellPoint(groundCell(groundPosition));
    const unit: NonNullable<Battle['skillUnits']>[number] = { id, skillId: skill.id, level, position,
      cells: mechanic === 'AS_VENOMDUST' ? venomDustCells(position) : [position], placedAt: at,
      nextTickAt: mechanic === 'AS_VENOMDUST' ? (Math.floor(at / 100) + 1) * 100 : at + 30000,
      expiresAt: at + (mechanic === 'AS_VENOMDUST' ? 5000 * level : 30000) };
    (s.battle.skillUnits ??= []).push(unit);
    event(s, at, 'ground-placed', skill.name, undefined, 'enemy', { skillId: skill.id, skillLevel: level,
      enemyId: target.id, targetActorId: target.id, enemyPosition: { ...position }, ...action });
    if (mechanic === 'PF_SPIDERWEB') {
      const status = captureSpiderWeb(target.statuses?.SC_SPIDERWEB as SpiderWebStatus | undefined, id, at);
      (target.statuses ??= {}).SC_SPIDERWEB = status;
      if (status.groundId === id) { unit.capturedEnemyId = target.id; unit.expiresAt = status.expiresAt; unit.nextTickAt = status.expiresAt; }
      if (at < target.arrivedAt) target.approachPausedAt ??= at;
      provokeEnemy(s, c, target, at); s.battle.fieldDecisionAt = at;
    }
    return true;
  }
  if (trapPosition && isHunterTrapSkill(mechanic ?? "") && s.battle) {
    const spec = hunterTrapSpec(mechanic as import('./hunterTraps.js').HunterTrapSkill, level, skill.groundDurationMs?.[level - 1]);
    const id = `trap-${s.id}-${at}-${s.nextEventId}`;
    (s.battle.traps ??= []).push({ id, skillId: skill.id, level, position: trapPosition,
      placedAt: at, nextTickAt: at + spec.intervalMs, expiresAt: at + spec.lifetimeMs });
    event(s, at, "trap-placed", skill.name, undefined, "enemy", { skillId: skill.id, skillLevel: level,
      enemyId: target.id, monsterId: target.monsterId, enemyPosition: { ...trapPosition }, ...action });
    return true;
  }
  if (!groundTick && mechanic === 'AS_SPLASHER') {
    const rules = splasherRules(level);
    (target.statuses ??= {}).SC_SPLASHER = { level, startsAt: at, expiresAt: at + rules.delayMs,
      skillId: skill.id, sourceActorId: s.id };
    event(s, at, 'skill', skill.name, undefined, 'enemy', { skillId: skill.id, skillLevel: level,
      enemyId: target.id, monsterId: target.monsterId, targetActorId: target.id, ...action });
    return true;
  }
  if (
    !groundTick &&
    skill.targetType !== "ground" &&
    ["physical", "magical"].includes(skill.kind) &&
    s.combatEffects
  )
    s.combatEffects.combo = undefined;
  let amount: number | undefined;
  if (skill.kind === "heal") {
    let healing = val(skill.power, level);
    if (mechanic === "AL_HEAL")
      healing = classicHeal(
        s.baseLevel,
        d.attributes?.int ?? s.stats.int,
        level,
      );
    const meditation =
      Object.entries(s.learnedSkills).find(
        ([id]) => c.skills[id]?.sourceName === "HP_MEDITATIO",
      )?.[1] ?? 0;
    if (mechanic === "AL_HEAL")
      healing = Math.floor(healing * (1 + 0.02 * meditation));
    const before = s.hp;
    s.hp = Math.min(d.maxHp, s.hp + healing);
    amount = s.hp - before;
  }
  if (
    skill.kind === "buff" &&
    !enemyControl &&
    !["PF_HPCONVERSION", "MO_ABSORBSPIRITS"].includes(mechanic ?? "")
  ) {
    const effects = skill.sourceName
      ? classicSkillEffects(skill, level, {
          ...d.attributes,
          maxHp: d.maxHp,
          maxSp: d.maxSp,
          skillLevelsBySource: Object.fromEntries(
            Object.entries(s.learnedSkills).map(([id, l]) => [
              c.skills[id]?.sourceName ?? id,
              l,
            ]),
          ),
        })
      : Object.fromEntries(
          Object.entries(skill.effects ?? {}).map(([k, v]) => [k, v * level]),
        );
    for (const source of elementalEnchantReplacements(mechanic ?? ""))
      cancelClassicBuff(s, c, source);
    s.buffs[skill.id] = {
      expiresAt:
        at +
        val(
          skill.statusDurationMs,
          level,
          val(skill.groundDurationMs, level, skill.durationMs ?? 30000),
        ),
      effects,
    };
    if (applyClassicBuff(s, c, skill, level, at))
      s.buffs[skill.id].effects = effects;
    const combat = (s.combatEffects ??= {});
    (combat.buffLevels ??= {})[skill.id] = level;
    if (mechanic === 'ST_REJECTSWORD') {
      combat.rejectSword = { charges: 3 };
      s.buffs[skill.id].expiresAt = Number.MAX_SAFE_INTEGER;
    }
    if (mechanic === 'AS_POISONREACT') combat.poisonReact = { charges: poisonReactCharges(level) };
    if (mechanic === 'KN_AUTOCOUNTER') {
      s.buffs[skill.id].startsAt = at;
      random(s); // status_start's 100% application still draws RNG.
    }
    if (mechanic === 'ST_PRESERVE') {
      s.buffs[skill.id].startsAt = at;
      random(s); // status.c:7177 draws even at 100% application rate.
    }
    startSoloStance(s, skill, at, d.maxHp);
    if (mechanic === "SA_AUTOSPELL" && autoChoice)
      combat.autospell = { skillId: autoChoice.skillId, level: autoChoice.maxLevel };
    if (mechanic === "PF_MEMORIZE") {
      combat.memorizeCharges = 5;
      s.buffs[skill.id].expiresAt = Number.MAX_SAFE_INTEGER;
    }
    if (mechanic === "SM_ENDURE") {
      combat.endure = createEndure(level, at);
      s.buffs[skill.id].expiresAt = combat.endure.expiresAt;
    }
    if (mechanic === 'CR_SHRINK' || mechanic === 'PA_SACRIFICE') {
      applyGuardianStatus(s, skill, level, at);
      random(s); // status_start's 100% application still draws RNG.
    }
    if (mechanic === "AL_PNEUMA") {
      const groups = defensiveGroundCollection(s, at);
      combat.pneumaGround = { ...createPneuma(defenseCell(s, at), at)!, sceneKey: defenseSceneKey(s) };
      groups.push({ ...combat.pneumaGround, kind: "pneumaGround" });
      s.buffs[skill.id].expiresAt = combat.pneumaGround.expiresAt;
    }
    if (mechanic === "MG_SAFETYWALL") {
      const groups = defensiveGroundCollection(s, at);
      combat.safetyWallHits = level + 1;
      combat.safetyWallGround = { cells: [defenseCell(s, at)], expiresAt: s.buffs[skill.id].expiresAt,
        sceneKey: defenseSceneKey(s) };
      groups.push({ ...combat.safetyWallGround, kind: "safetyWallGround", hits: level + 1 });
    }
    if (mechanic === "MG_ENERGYCOAT") combat.energyCoat = true;
    if (mechanic === "HW_MAGICPOWER") combat.magicPower = level;
    if (mechanic === "PR_KYRIE") {
      combat.kyrieHp = Math.floor((d.maxHp * (10 + 2 * level)) / 100);
      combat.kyrieHits = Math.floor(level / 2) + 5;
    }
    if (mechanic === "MO_CALLSPIRITS")
      combat.spiritSpheres = Math.min(level, (combat.spiritSpheres ?? 0) + 1);
    if (mechanic === "CH_SOULCOLLECT") combat.spiritSpheres = 5;
    if (mechanic === "MO_ABSORBSPIRITS") {
      s.sp = Math.min(d.maxSp, s.sp + 7 * (combat.spiritSpheres ?? 0));
      combat.spiritSpheres = 0;
    }
    if (mechanic === "WZ_QUAGMIRE")
      for (const e of targets(s, skill, level, target, at))
        (e.statuses ??= {}).quagmire = {
          expiresAt: at + val(skill.groundDurationMs, level, 5000 * level),
          level,
        };
  }
  if (skill.kind === "steal") attemptSteal(s, c, skill, level, target, at);
  if (mechanic === "MO_ABSORBSPIRITS") {
    s.sp = Math.min(d.maxSp, s.sp + 7 * (s.combatEffects?.spiritSpheres ?? 0));
    (s.combatEffects ??= {}).spiritSpheres = 0;
  }
  if (mechanic === "PF_HPCONVERSION") {
    const hp = Math.floor(d.maxHp * 0.1);
    if (s.hp > hp) {
      s.hp -= hp;
      const before = s.sp;
      s.sp = Math.min(d.maxSp, s.sp + Math.floor((hp * level) / 10));
      amount = s.sp - before;
    }
  }
  if (!groundTick)
    event(
      s,
      at,
      "skill",
      skill.name,
      amount,
      skill.kind === "heal" || skill.kind === "buff" ? "player" : "enemy",
      {
        skillId: skill.id,
        skillLevel: level,
        enemyId: target.id,
        monsterId: target.monsterId,
        castMs: 0,
        hitCount: val(skill.hitCount, level, 1),
        ...action,
        targetActorId: skill.kind === "heal" || skill.kind === "buff" && !enemyControl ? s.id : target.id,
      },
    );
  if (skill.kind === "physical" || skill.kind === "magical")
    damageEnemies(s, c, target, at, skill, level, center, action, false, jointBeatPart, context);
  if (mechanic === "RG_RAID") cancelClassicBuff(s, c, "TF_HIDING");
  if (skill.kind === "buff" && enemyControl && s.battle) {
    if (delayedControl)
      (s.battle.delayedSkills ??= []).push({
        skillId: skill.id,
        level,
        targetId: target.id,
        position: { ...battleHeroAt(s, at) },
        endsAt: at + (skill.effectDelayMs ?? 2000),
      });
    else applyEnemyStatus(s, c, skill, level, target, at, center);
  }
  if (mechanic === "MO_EXTREMITYFIST") {
    s.sp = 0;
    (s.combatEffects ??= {}).spiritSpheres = 0;
    for (const id of Object.keys(s.buffs))
      if (c.skills[id]?.sourceName === "MO_EXPLOSIONSPIRITS")
        delete s.buffs[id];
    s.buffs[skill.id] = {
      expiresAt: at + val(skill.statusDurationMs, level, 300000),
      effects: {},
    };
  }
  if (
    [
      "MO_CHAINCOMBO",
      "MO_COMBOFINISH",
      "CH_TIGERFIST",
      "CH_CHAINCRUSH",
    ].includes(mechanic ?? "")
  )
    (s.combatEffects ??= {}).combo = {
      sourceName: mechanic!,
      expiresAt: at + 2000,
    };
  const pulseCount =
    mechanic === "WZ_WATERBALL"
      ? (2 * Math.floor(level / 2) + 1) ** 2
      : mechanic === "WZ_METEOR"
        ? 2 + Math.floor(level / 2)
        : undefined;
  const interval =
    mechanic === "WZ_WATERBALL" ? 125 : (skill.groundIntervalMs ?? 0);
  const duration = pulseCount
    ? pulseCount * interval
    : val(skill.groundDurationMs, level);
  if (
    !groundTick &&
    mechanic !== "WZ_FIREPILLAR" &&
    skill.groundHitLimit !== 1 &&
    s.battle &&
    interval > 0 &&
    duration > interval
  )
    (s.battle.groundEffects ??= []).push({
      skillId: skill.id,
      level,
      position: groundPosition,
      remainingHits:
        mechanic === "MG_FIREWALL"
          ? 3 + level
          : pulseCount
            ? pulseCount - 1
            : undefined,
      targetId: mechanic === "WZ_WATERBALL" ? target.id : undefined,
      intervalMs: interval,
      nextTickAt: at + interval,
      expiresAt: at + duration,
    });
  return true;
}
function enemyAttack(s: GameState, c: Catalog, enemy: BattleEnemy, at: number, npcSkill?: MonsterStatusSkill, npcCast?: NonNullable<NonNullable<BattleEnemy["npcCombat"]>["cast"]>, context?: SimulationContext) {
  const enemyStatus = combatStatus(c, enemy, at, sageFieldModifiers(s, enemy.id, at));
  const b = s.battle!,
    monster = enemyStatus.monster,
    d = derivedStats(s, c);
  const activeCast = b.cast && b.cast.startedAt <= at && at < b.cast.endsAt ? b.cast : undefined;
  const npcDecisionRange = npcSkill?.range ?? Math.max(monster.attackRange ?? 1,
    ...(monster.npcStatusSkills?.filter(skill => skill.damageType === 'magic').map(skill => skill.range) ?? [1]));
  if (enemyDistanceAt(enemy, at, battleHeroAt(s, at)) > npcDecisionRange + 1e-9) return;
  if (trickDeadActive(s, c, at)) {
    // SC_TRICKDEAD rejects basic and skill damage before the attack RNG/status path.
    enemy.enemyNextAttackAt = at + monsterAttackInterval(monster, enemyStatus.attackDelayPct);
    return;
  }
  if (enemy.hostile === false) {
    enemy.enemyNextAttackAt = at + 500;
    return;
  }
  if (playerHiddenFrom(s, c, monster, at) && !(npcSkill && npcCast && classicBuffActive(s, c, 'ST_CHASEWALK', at) && !classicBuffActive(s, c, 'TF_HIDING', at))) {
    enemy.enemyNextAttackAt = at + 500;
    return;
  }
  if ((enemy.statuses?.SC_BLADESTOP?.expiresAt ?? 0) > at &&
      enemy.statuses?.SC_BLADESTOP?.partnerActorId === s.id) {
    enemy.enemyNextAttackAt = at + monsterAttackInterval(monster, enemyStatus.attackDelayPct);
    return;
  }
  if (enemyStatus.immobilized) {
    enemy.enemyNextAttackAt = at + 500;
    return;
  }
  if (!npcSkill && tryMonsterStatusSkill(s, c, enemy, at)) {
    if (enemy.npcCombat?.cast?.endsAt === at) {
      const cast = enemy.npcCombat.cast;
      const instant = takeMonsterStatusCast(s, c, enemy, at);
      if (instant) enemyAttack(s, c, enemy, at, instant, cast, context);
    }
    return;
  }
  if (!npcSkill && enemyDistanceAt(enemy, at, battleHeroAt(s, at)) > (monster.attackRange ?? 1) + 1e-9) {
    enemy.enemyNextAttackAt = at + monsterAttackInterval(monster, enemyStatus.attackDelayPct);
    return;
  }
  rememberEnemyFacing(enemy, battleHeroAt(s, at), at);
  const action: ActionMetadata = {
    sourceActorId: enemy.id,
    actionId: npcCast?.actionId ?? `action-${enemy.id}-${at}-${s.nextEventId}`,
    actorAction: npcSkill?.damageType === 'magic' ? 'skill' : 'attack',
    actionStartedAt: npcSkill?.damageType === 'magic' ? npcCast?.endsAt ?? at : at,
    actionMotionMs: npcSkill?.damageType === 'magic'
      ? Math.min(2000, Math.max(10, monster.attackMotionMs ?? monster.attackDelay / 2))
      : Math.min(2000, Math.max(10, monster.attackMotionMs ?? monster.attackDelay / 2)),
    actionSourcePosition: { ...(npcCast?.sourcePosition ?? enemyPositionAt(enemy, at)) },
    areaId: s.areaId ?? undefined,
  };
  if (npcSkill?.damageType === 'magic' && npcCast) {
    resolveNpcMagicAttack(s, c, enemy, monster, d, npcSkill, npcCast, at, action);
    return;
  }
  const counterId = Object.keys(s.buffs).find(id => s.buffs[id].expiresAt > at && c.skills[id]?.sourceName === 'KN_AUTOCOUNTER');
  if (counterId && !npcSkill && !classicBuffActive(s, c, 'TF_HIDING', at) &&
    (enemy.statuses?.SC_HIDING?.expiresAt ?? 0) <= at && autoCounterBlocks({
      defender: sourceCell(battleHeroAt(s, at)), attacker: sourceCell(enemyPositionAt(enemy, at)),
      facing: s.playerFacing ?? { x: 0, y: 1 }, weaponRange: basicAttackRange(s, c),
    })) {
    const level = s.combatEffects?.buffLevels?.[counterId] ?? s.learnedSkills[counterId] ?? 1;
    cancelClassicBuff(s, c, 'KN_AUTOCOUNTER'); // End before resolving, including a miss or lethal hit.
    enemy.enemyNextAttackAt = at + monsterAttackInterval(monster, enemyStatus.attackDelayPct);
    event(s, at, 'dodge', 'Contra-Ataque', undefined, 'player', {
      ...action, enemyId: enemy.id, monsterId: monster.id, targetActorId: s.id, hitMotionMs: 1,
    });
    faceHeroTowards(s, enemyPositionAt(enemy, at), at);
    const counterAction = playerAction(s, c, at, 'attack');
    counterAction.actionMotionMs = Math.floor(playerMotion(s, c) / 2);
    blockFieldHero(s, at, at + counterAction.actionMotionMs);
    damageEnemies(s, c, enemy, at, { ...c.skills[counterId], kind: 'physical', damageType: 'weapon',
      targetType: 'enemy', power: [100], sourceHitCount: [1], hitCount: [1], aoeRadius: [0], statusEffect: undefined },
      level, undefined, counterAction, false, undefined, context);
    return; // No incoming RNG/Endure/reflect/Poison React after ATK_BLOCK.
  }
  const wait = s.combatEffects?.bladeStopWait;
  if (!npcSkill && shouldBladeStop({ wait, at, distance: enemyDistanceAt(enemy, at, battleHeroAt(s, at)),
    basicAttack: true, boss: !!monster.boss })) {
    enemy.enemyNextAttackAt = at + monsterAttackInterval(monster, enemyStatus.attackDelayPct);
    createBladeStopLink(s, enemy, wait!.level, at);
    random(s); random(s); // Source starts both reciprocal SC_BLADESTOP statuses at 100%.
    event(s, at, 'dodge', 'Parada da Lâmina', undefined, 'player', { ...action,
      skillId: 'mo_bladestop', skillLevel: wait!.level, statusName: 'SC_BLADESTOP',
      enemyId: enemy.id, monsterId: monster.id, targetActorId: s.id, hitMotionMs: 1 });
    event(s, at, 'status-start', 'Parada da Lâmina', undefined, 'player', { skillId: 'mo_bladestop',
      skillLevel: wait!.level, statusName: 'SC_BLADESTOP', sourceActorId: s.id,
      targetActorId: enemy.id, enemyId: enemy.id, monsterId: monster.id });
    return;
  }
  // status.c:3359: pre-renewal player damage motion, default delay rate 100.
  const berserkActive = classicBuffActive(s, c, 'LK_BERSERK', at);
  const hitMotionMs = berserkActive ? 0 : defenseHitMotion(Math.min(800, Math.max(400, 800 - (d.attributes?.agi ?? s.stats.agi) * 4)),
    s.combatEffects?.endure, at);
  const crowd = enemies(s).filter((e) => e.hostile !== false && enemyDistanceAt(e, at, battleHeroAt(s, at)) <= (c.monsters[e.monsterId].attackRange ?? 1) + 1e-9).length,
    flee = d.flee * Math.max(0.2, 1 - Math.max(0, crowd - 2) * 0.1);
  // battle.c:3939..3944: default mob skill ranges use resolution distance.
  const rangedAttack = npcSkill
    ? enemyDistanceAt(enemy, at, battleHeroAt(s, at)) > 5 + 1e-9
    : (monster.attackRange ?? 1) > 3;
  const wall = activeDefenseGrounds(s, "safetyWallGround", at).find(ground =>
    ground.cells.some(cell => cell.x === defenseCell(s, at).x && cell.y === defenseCell(s, at).y));
  const fogWallActive = fogWallDefending(s, c, at);
  const accuracy = fogWallHitChance(80 + enemyStatus.hit - flee, fogWallActive, rangedAttack, !!npcSkill);
  // battle.c:5025: lucky dodge belongs to normal attacks, not NPC skills.
  if (!npcSkill && random(s) * 100 < (d.perfectDodge ?? d.effects.perfectDodge ?? 0) || random(s) >= accuracy)
    event(s, at, "dodge", "Esquiva!", undefined, "player", {
      enemyId: enemy.id,
      monsterId: monster.id,
      ...action,
      targetActorId: s.id,
      hitMotionMs,
    });
  else if (activeDefenseGrounds(s, "pneumaGround", at).some(ground => pneumaBlocks(ground, defenseCell(s, at), at,
    { long: rangedAttack, weapon: true }))) {
    event(s, at, "dodge", Object.values(c.skills).find(skill => skill.sourceName === "AL_PNEUMA")?.name ?? "Pneuma",
      undefined, "player", { enemyId: enemy.id, ...action, targetActorId: s.id, hitMotionMs: 0 });
  }
  else if (!rangedAttack && (wall || !s.combatEffects?.safetyWallGround && !s.combatEffects?.defensiveGrounds) &&
    (wall?.hits ?? s.combatEffects?.safetyWallHits ?? 0) > 0) {
    if (wall) wall.hits = (wall.hits ?? 0) - 1;
    s.combatEffects!.safetyWallHits = wall?.hits ?? (s.combatEffects!.safetyWallHits ?? 0) - 1;
    if (s.combatEffects!.defensiveGrounds) {
      s.combatEffects!.defensiveGrounds = s.combatEffects!.defensiveGrounds
        .filter(ground => ground.kind !== "safetyWallGround" || (ground.hits ?? 0) > 0);
      if (!activeDefenseGrounds(s, "safetyWallGround", at).length) cancelClassicBuff(s, c, "MG_SAFETYWALL");
    } else if (!s.combatEffects!.safetyWallHits) cancelClassicBuff(s, c, "MG_SAFETYWALL");
    event(s, at, "dodge", "Escudo Mágico", undefined, "player", {
      enemyId: enemy.id,
      ...action,
      targetActorId: s.id,
      hitMotionMs,
    });
  } else {
    const raw = Math.floor(
        ((monster.attack[0] +
          Math.floor(random(s) * (monster.attack[1] - monster.attack[0] + 1))) *
          enemyStatus.atkPercent) /
          100,
      ),
      vit = d.attributes?.vit ?? s.stats.vit;
    const levels = learnedBySource(s, c);
    const protection =
      monster.race.toLowerCase() === "demon" ||
      monster.element.toLowerCase() === "undead"
        ? classicDivineProtection(s.baseLevel, levels.AL_DP ?? 0)
        : 0;
    const soft = berserkActive ? 0 : classicPlayerVitDefense(vit,
      d.sourceDefensePercent ?? 100, () => random(s));
    const castDefenseReduction = activeCast
      ? (c.skills[activeCast.skillId]?.castDefenseReductionPct ?? 0)
      : 0;
    const hardDef = d.def - Math.floor((d.def * castDefenseReduction) / 100);
    let damage = Math.max(
      1,
      Math.floor(
        (raw * (1 - Math.min(100, hardDef) / 100) - soft - protection) *
          classicIncomingSkillReduction(
            levels,
            monster.race,
            "neutral",
            d.effects.neutralResist ?? 0,
          ),
      ),
    );
    damage = Math.max(
      1,
      Math.floor(
        damage * (1 - Math.min(100, d.effects.physicalResistPct ?? 0) / 100),
      ),
    );
    damage = defenderDamage(damage, activeBySource(s, c, at).CR_DEFENDER ?? 0, { long: rangedAttack, weapon: true });
    damage = fogWallDamage(damage, fogWallActive, rangedAttack && !npcSkill, !!npcSkill);
    const incomingWeapon = !npcSkill || npcSkill.damageType !== 'magic' && npcSkill.damageType !== 'misc';
    const activeDefenses = activeBySource(s, c, at);
    const autoGuardLevel = activeDefenses.CR_AUTOGUARD ?? 0;
    let autoGuardBlocked = false;
    if (damage > 0 && incomingWeapon && autoGuardLevel > 0 &&
      Math.floor(random(s) * 100) < autoGuardChance(autoGuardLevel)) {
      damage = 0;
      autoGuardBlocked = true;
      event(s, at, 'block', 'Auto Guard', undefined, 'player', { enemyId: enemy.id, monsterId: monster.id,
        ...action, targetActorId: s.id, hitMotionMs: 0 });
      blockFieldHero(s, at, at + autoGuardWalkDelayMs(autoGuardLevel));
      if (classicBuffActive(s, c, 'CR_SHRINK', at)) {
        const shrinkRoll = Math.floor(random(s) * 100);
        if (shrinkRollAccepted(autoGuardLevel, shrinkRoll)) shrinkRecoil(s, c, enemy, at, context);
      }
    }
    const parryLevel = activeDefenses.LK_PARRYING ?? 0;
    if (!autoGuardBlocked && damage > 0 && incomingWeapon && parryLevel > 0 &&
      Math.floor(random(s) * 100) < (d.effects.parryPct ?? 20 + 3 * parryLevel)) {
      damage = 0;
      event(s, at, 'block', 'Parry', undefined, 'player', { enemyId: enemy.id, monsterId: monster.id,
        ...action, targetActorId: s.id, hitMotionMs: 0 });
    }
    if (random(s) * 100 < (d.effects.blockPct ?? 0)) damage = 0;
    if (s.combatEffects?.energyCoat && s.sp > 0 && damage > 0) {
      const band = Math.min(4, Math.floor((s.sp / d.maxSp) * 5));
      damage = Math.max(1, Math.floor(damage * (1 - 0.06 * (band + 1))));
      s.sp = Math.max(
        0,
        s.sp - Math.max(1, Math.floor((d.maxSp * (1 + 0.5 * band)) / 100)),
      );
    }
    const statusAttackDef = damage > 0;
    if (
      damage > 0 &&
      (s.combatEffects?.kyrieHp ?? 0) > 0 &&
      (s.combatEffects?.kyrieHits ?? 0) > 0
    ) {
      const blocked = Math.min(damage, s.combatEffects!.kyrieHp!);
      s.combatEffects!.kyrieHp! -= blocked;
      s.combatEffects!.kyrieHits!--;
      damage -= blocked;
      if (!s.combatEffects!.kyrieHp || !s.combatEffects!.kyrieHits)
        for (const id of Object.keys(s.buffs))
          if (c.skills[id]?.sourceName === "PR_KYRIE") delete s.buffs[id];
    }
    // Source Reflect Shield is calculated before Reject halves the residual hit.
    const reflected = rangedAttack ? 0 : Math.floor((damage * (d.effects.reflectPct ?? 0)) / 100);
    let counterDamage = 0;
    const rejectId = Object.keys(s.buffs).find(id => s.buffs[id].expiresAt > at && c.skills[id]?.sourceName === 'ST_REJECTSWORD');
    const rejectSkill = rejectId ? c.skills[rejectId] : undefined;
    if (rejectSkill && damage !== 0) {
      const runtime = (s.combatEffects ??= {});
      const reject = runtime.rejectSword ??= { charges: 3 };
      const result = rejectSwordHit({ level: activeBySource(s, c, at).ST_REJECTSWORD ?? 1,
        charges: reject.charges, damage, rollPct: random(s) * 100 });
      damage = result.damage; counterDamage = result.counterDamage;
      reject.charges = result.remainingCharges;
      if (result.triggered && !reject.charges) cancelClassicBuff(s, c, 'ST_REJECTSWORD');
    }
    s.hp = Math.max(0, s.hp - damage);
  discardAloeveraUnderAutoBerserk(s,c,at);
    if (damage > 0) interruptSageEnchantCast(s, c, at);
    if (berserkActive && s.hp <= 100) finishBerserk(s, c, at);
    if (damage > 0) {
      cancelClassicBuff(s, c, "TF_HIDING");
      cancelClassicBuff(s, c, "AS_CLOAKING");
      cancelClassicBuff(s, c, "ST_CHASEWALK");
      if (s.combatEffects?.endure) {
        s.combatEffects.endure = endureHit(s.combatEffects.endure, at, { damage });
        if (!s.combatEffects.endure) cancelClassicBuff(s, c, "SM_ENDURE");
      }
    }
    if (reflected > 0) {
      const targetHpBefore = enemy.hp;
      enemy.hp = Math.max(0, enemy.hp - reflected);
      breakControlOnDamage(enemy, reflected, at);
      event(s, at, "damage", "Reflexão", reflected, "enemy", {
        enemyId: enemy.id,
        monsterId: monster.id,
        ...playerAction(s, c, at, "none"),
        targetActorId: enemy.id,
        targetHpBefore,
        hitMotionMs: monster.damageMotionMs ?? 400,
      });
    }
    if (counterDamage > 0) {
      const targetHpBefore = enemy.hp;
      enemy.hp = Math.max(0, enemy.hp - counterDamage);
      breakControlOnDamage(enemy, counterDamage, at);
      event(s, at, 'damage', rejectSkill!.name, counterDamage, 'enemy', { skillId: rejectSkill!.id,
        enemyId: enemy.id, monsterId: monster.id, ...playerAction(s, c, at, 'none'), targetActorId: enemy.id, targetHpBefore,
        hitMotionMs: monster.damageMotionMs ?? 400 });
    }
    event(s, at, "damage", monster.name, damage, "player", {
      enemyId: enemy.id,
      monsterId: monster.id,
      ...action,
      ...(npcSkill && { skillId: npcSkill.sourceName.toLowerCase(), skillLevel: npcSkill.level }),
      targetActorId: s.id,
      hitMotionMs,
    });
    if (npcSkill && statusAttackDef && s.hp > 0) applyMonsterStatusEffect(s, c, enemy, npcSkill, at, action.actionId);
    if (!b.challengeId && s.areaId)
      recordAreaActivity(s, s.areaId, at, { damageTaken: damage });
    if (activeCast && b.cast === activeCast && damage > 0 && c.skills[activeCast.skillId]?.interruptCast) {
      event(
        s,
        at,
        "cast-interrupted",
        "Conjuração interrompida.",
        undefined,
        "player",
        { skillId: activeCast.skillId, sourceActorId: s.id, actorAction: "none", actionId: activeCast.actionId },
      );
      cancelSkillAction(s, activeCast.skillClockOwnership, at);
      b.cast = undefined;
      b.playerActionReadyAt = at + 1000;
      b.playerNextSkillAt = at + 1000;
      if (!b.challengeId && s.fieldHero?.areaId === s.areaId)
        s.fieldHero.moveBlockedUntil = at + 1000;
    }
  }
  // status.c:3438: source monster_max_aspd=199 means 20 ms minimum
  // attack delay; attacks are capped at 4000 ms. Quagmire changes AGI/DEX,
  // without a separate invented 25% multiplier on a monster's base delay.
  enemy.enemyNextAttackAt = at + monsterAttackInterval(monster, enemyStatus.attackDelayPct);
  // A direct counter can kill both actors. Settle the monster's death before
  // removing battle state, and keep a level-up from reviving the defeated player.
  const playerDefeated = s.hp <= 0;
  // battle_weapon_attack invokes React even on a miss/absorbed normal attack.
  // Preserve its RNG draw and charge consumption before checking a dead victim.
  const reactId = Object.keys(s.buffs).find(id => s.buffs[id].expiresAt > at && c.skills[id]?.sourceName === 'AS_POISONREACT');
  if (reactId && !npcSkill) {
    const level = s.combatEffects?.buffLevels?.[reactId] ?? s.learnedSkills[reactId] ?? 1;
    const runtime = (s.combatEffects ??= {}).poisonReact ??= { charges: poisonReactCharges(level) };
    const counter = poisonReactCounter({ level, charges: runtime.charges, bodyElement: monster.element, rollPct: random(s) * 100 });
    if (counter && !classicBuffActive(s, c, 'TF_HIDING', at) &&
      !classicBuffActive(s, c, 'MO_STEELBODY', at) && !classicBuffActive(s, c, 'LK_BERSERK', at)) {
      runtime.charges = counter.charges;
      const hit = Object.values(c.skills).find(skill => skill.sourceName === counter.source);
      if (hit && enemy.hp > 0) damageEnemies(s, c, enemy, at,
        { ...hit, kind: 'physical', damageType: 'weapon', targetType: 'enemy',
          ...(counter.source === 'AS_POISONREACT' && { element: 'neutral', statusEffect: undefined }) },
        counter.level, undefined, playerAction(s, c, at, 'attack'), false, undefined, context);
      if (!runtime.charges) cancelClassicBuff(s, c, 'AS_POISONREACT');
    }
  }
  if (enemy.hp <= 0 && s.battle?.enemies?.some(entry => entry.id === enemy.id)) awardKill(s, c, enemy, at);
  if (playerDefeated) defeatPlayer(s, c, at, !!b.challengeId);
}

function defeatPlayer(s: GameState, c: Catalog, at: number, challenge = !!s.battle?.challengeId) {
    interruptSageEnchantCast(s, c, at, 'Conjuração interrompida pela derrota.');
    clearBladeStop(s, at);
    // Hercules' paired caster status ends when its owner dies.
    clearCloseConfine(s, at);
    clearPlayerDiseasesOnDeath(s, c, at);
    clearConsumableStatusesOnDeath(s);
    endFieldRest(s, c);
    resetResourceRecovery(s);
    cancelClassicBuff(s, c, 'KN_AUTOCOUNTER');
    cancelClassicBuff(s, c, 'AS_POISONREACT');
    cancelClassicBuff(s, c, 'SA_MAGICROD');
    cancelClassicBuff(s, c, 'PF_FOGWALL');
    cancelClassicBuff(s, c, 'ST_PRESERVE');
    cancelClassicBuff(s, c, 'ST_CHASEWALK');
    delete s.buffs[CHASEWALK_STRENGTH_ID];
    cancelClassicBuff(s, c, 'PA_SACRIFICE');
    clearTrickDead(s, c, at); // SC_TRICKDEAD lacks NoDeathReset.
    s.hp = 0;
    delete s.groundPlacements;
    freezeFieldHero(s, at);
    if (s.fieldHero) {
      s.fieldHero.phase = "waiting";
      delete s.fieldHero.targetId;
      delete s.fieldHero.moveBlockedUntil;
    }
    s.totals.deaths++;
    if (!challenge && s.areaId)
      recordAreaActivity(s, s.areaId, at, { deaths: 1 });
    s.battle = null;
    s.pendingAreaId = null;
    s.status = "resting";
    s.restMode = "recovery";
    s.restUntil = at + 30000;
    if (challenge) s.autoResume = false;
    event(s, at, "death", "Derrota. Recuperando na cidade.");
  }

function nextEnemyAttackAt(s: GameState, c: Catalog, enemy: BattleEnemy, from: number, until: number) {
  if(monsterAttackTarget(s,enemy)!==s.id)return;
  if (enemy.fieldSlot !== undefined && (!enemy.engaged || enemy.hostile === false)) return;
  const monster = c.monsters[enemy.monsterId];
  const range = Math.max(monster.attackRange ?? 1,
    ...(monster.npcStatusSkills?.filter(skill => skill.damageType === 'magic').map(skill => skill.range) ?? [1]));
  const attackAt = Math.max(from, enemy.startedAt, enemy.enemyNextAttackAt);
  if (attackAt > until) return;
  return nextBattleContactAt(s, enemy, attackAt, until, range);
}

/** Return only an ordinary non-boss attacker whose source basic contact is imminent. */
function bladeStopIncomingEnemy(s: GameState, c: Catalog, level: number, at: number) {
  const waitUntil = at + bladeStopRules(level).waitMs;
  return enemies(s).filter(enemy => enemy.hp > 0 && enemy.hostile !== false &&
      !c.monsters[enemy.monsterId].boss &&
      !(enemy.statuses?.SC_BLADESTOP && enemy.statuses.SC_BLADESTOP.expiresAt > at))
    .map(enemy => ({ enemy, attackAt: nextEnemyAttackAt(s, c, enemy, at, waitUntil) }))
    .filter((entry): entry is { enemy: BattleEnemy; attackAt: number } => entry.attackAt !== undefined &&
      enemyDistanceAt(entry.enemy, entry.attackAt, battleHeroAt(s, entry.attackAt)) <= 2)
    .sort((a, b) => a.attackAt - b.attackAt || a.enemy.id.localeCompare(b.enemy.id))[0]?.enemy;
}

/** First source-square contact along the persisted hero/enemy paths. */
function nextBattleContactAt(s: GameState, enemy: BattleEnemy, from: number, until: number, range: number) {
  if (from > until) return;
  if (enemyDistanceAt(enemy, from, battleHeroAt(s, from)) <= range + 1e-9) return from;
  // Both actors may walk. Intersect their relative linear path with the source
  // square range, including contact crossed between two outside endpoints.
  const times = [...new Set([from, until, enemy.arrivedAt, s.fieldHero?.arrivedAt]
    .filter((time): time is number => time !== undefined && time >= from && time <= until))].sort((a, b) => a - b);
  for (let index = 0; index < times.length - 1; index++) {
    const start = times[index], end = times[index + 1];
    const enemyFrom = enemyPositionAt(enemy, start), enemyTo = enemyPositionAt(enemy, end);
    const heroFrom = battleHeroAt(s, start), heroTo = battleHeroAt(s, end);
    let enter = 0, leave = 1;
    for (const axis of ["x", "y"] as const) {
      const origin = (enemyFrom[axis] - heroFrom[axis]) * BATTLE_CELLS_PER_UNIT;
      const delta = (enemyTo[axis] - heroTo[axis]) * BATTLE_CELLS_PER_UNIT - origin;
      if (Math.abs(delta) < 1e-10) {
        if (Math.abs(origin) > range) { enter = 2; break; }
      } else {
        const a = (-range - origin) / delta, z = (range - origin) / delta;
        enter = Math.max(enter, Math.min(a, z)); leave = Math.min(leave, Math.max(a, z));
      }
    }
    if (enter > leave) continue;
    const contact = Math.ceil(start + (end - start) * enter);
    if (contact <= end && enemyDistanceAt(enemy, contact, battleHeroAt(s, contact)) <= range + 1e-9) return contact;
  }
}

function concealedUntil(enemy: BattleEnemy, at: number) {
  const active = activeRuwachConcealment(enemy.statuses, at);
  return active.length ? Math.max(...active.map(name => enemy.statuses?.[name]?.expiresAt ?? at)) : undefined;
}

/** Hercules scans targets on the final aura timer before ending SC_RUWACH. */
function ruwachAuraTickActive(s: GameState, skill: Skill, at: number) {
  return (s.buffs[skill.id]?.expiresAt ?? -Infinity) >= at;
}

function nextRuwachPulseAt(contactAt: number, auraStartedAt: number) {
  return auraStartedAt + Math.max(1, Math.ceil((contactAt - auraStartedAt) / 20)) * 20;
}

/** Activate only if a real hidden target can receive Ruach's next 20 ms pulse. */
function ruwachTargetWithinAura(s: GameState, skill: Skill, level: number, at: number) {
  const auraEndsAt = at + val(skill.statusDurationMs, level, 10000);
  for (const enemy of enemies(s)) {
    if (enemy.hp <= 0) continue;
    const hiddenUntil = concealedUntil(enemy, at);
    if (hiddenUntil === undefined) continue;
    const contactAt = nextBattleContactAt(s, enemy, Math.max(at, enemy.startedAt),
      Math.min(auraEndsAt, hiddenUntil), val(skill.aoeRadius, level));
    if (contactAt === undefined) continue;
    const pulseAt = nextRuwachPulseAt(contactAt, at);
    if (pulseAt <= auraEndsAt && pulseAt < hiddenUntil) return true;
  }
  return false;
}

/** Arm only when the target can reach the skill's source radius during this cast. */
function sightBlasterContactWithinCast(s: GameState, c: Catalog, skill: Skill, level: number,
  target: BattleEnemy, at: number) {
  const d = derivedStats(s, c);
  const base = val(skill.castTimeMs, level);
  const castMs = Math.floor((skill.ignoresDex ? base : classicCastTime(base, d.attributes?.dex ?? s.stats.dex)) *
    (1 - Math.min(100, skill.ignoresStatusEffects ? 0 : d.effects.castReductionPct ?? 0) / 100));
  const from = Math.max(at, target.startedAt);
  return nextBattleContactAt(s, target, from, at + Math.max(0, castMs), val(skill.aoeRadius, level)) !== undefined;
}

function completePlayerSkill(s: GameState, c: Catalog, skill: Skill, level: number, target: BattleEnemy,
  at: number, actionId?: string, center?: { x: number; y: number }, context?: SimulationContext) {
  const b = s.battle!;
  const source = skill.sourceName ?? '', caster = { ...battleHeroAt(s, at) };
  const selfGround = skill.targetType === 'self' || ['MG_SAFETYWALL', 'AL_PNEUMA', 'PF_FOGWALL'].includes(source);
  const placementCenter = { ...(selfGround ? caster : center ?? enemyPositionAt(target, at)) };
  const previousEffects = new Set(b.groundEffects ?? []), previousUnits = new Set(b.skillUnits ?? []);
  const previousTraps = new Set(b.traps ?? []);
  const previousPlacements = new Set(s.groundPlacements ?? []);
  const previousDefense = new Set(s.combatEffects?.defensiveGrounds ?? []);
  const succeeded = resolveSkill(s, c, skill, level, target, at, false, center,
    playerAction(s, c, at, "skill", actionId), context);
  if (succeeded && source === "AC_DOUBLE" && (learnedBySource(s, c).HT_POWER ?? 0) > 0)
    (s.combatEffects ??= {}).combo = { sourceName: "AC_DOUBLE", expiresAt: at + 2000 };
  if (succeeded && source === "HT_POWER" && s.combatEffects?.combo?.sourceName === "AC_DOUBLE")
    s.combatEffects.combo = undefined;
  if (succeeded) {
    const effect = b.groundEffects?.find(g => g.skillId === skill.id && !previousEffects.has(g));
    const unit = b.skillUnits?.find(g => g.skillId === skill.id && !previousUnits.has(g));
    const defense = s.combatEffects?.defensiveGrounds?.find(g => !previousDefense.has(g));
    const trap = b.traps?.find(g => g.skillId === skill.id && !previousTraps.has(g));
    const placement = s.groundPlacements?.find(g => g.skillId === skill.id && !previousPlacements.has(g)) ??
      captureGroundPlacement(s, c, skill, level, at, unit?.position ?? trap?.position ?? placementCenter, caster, context, true);
    if (placement && (effect || unit || defense || trap)) {
      placement.battleStartedAt = b.startedAt;
      if (effect) { effect.groundPlacementId = placement.id; placement.binding = 'groundEffect'; }
      else if (unit) { unit.groundPlacementId = placement.id; placement.binding = 'skillUnit'; }
      else if (defense) { defense.groundPlacementId = placement.id; placement.binding = 'defensiveGround'; }
      else if (trap) { trap.groundPlacementId = placement.id; placement.binding = 'trap'; }
    }
    if (['MO_FINGEROFFENSIVE', 'MO_INVESTIGATE', 'MO_CHAINCOMBO', 'MO_EXTREMITYFIST'].includes(skill.sourceName ?? '') &&
      s.combatEffects?.bladeStopLink?.partnerActorId === target.id) clearBladeStop(s, at);
    // skill.c:6611..6616: individual cooldown is distinct from global delay.
    s.skillReadyAt[skill.id] = at + (skill.sourceName === 'AS_SPLASHER' ? splasherRules(level).cooldownMs : Math.max(0, skill.cooldownMs));
    b.supportNeedsOffense = !offensiveSkill(skill);
  }
  return succeeded;
}

function playerCombatAction(s: GameState, c: Catalog, at: number, context?: SimulationContext) {
  const b = s.battle!;
  if (overweightForCombat(s, c) || s.carryReturnRequestedAt !== undefined && s.carryReturnRequestedAt <= at) {
    b.playerNextAttackAt = b.playerNextSkillAt = at + 250;
    return;
  }
  if (trickDeadActive(s, c, at) || classicBuffActive(s, c, 'ST_CHASEWALK', at)) {
    b.playerNextAttackAt = b.playerNextSkillAt = at + 250; return;
  }
  const currentCast = currentPlayerCast(s, at);
  if (currentCast?.kind === 'support' && activeFreeCastLevel(s, c, at) === 0) return;
  if (s.supportCast && s.supportCast.endsAt <= at) resolveSupportCast(s, c, s.supportCast.endsAt, context);
  const activeCast = b.cast && b.cast.startedAt <= at && at < b.cast.endsAt ? b.cast : undefined;
  const castingWithFreeCast = !!currentPlayerCast(s, at) && activeFreeCastLevel(s, c, at) > 0;
  const bladeLinkedTarget = bladeStopTarget(s, at);
  const living = enemies(s).filter(enemy => enemy.hp > 0);
  let target = activeCast
    ? enemies(s).find(e => e.id === activeCast.targetId)
    : bladeLinkedTarget ?? living.find(e => e.id === b.targetId) ?? living[0];
  if (!activeCast && target && target.hp > 0) b.targetId = target.id;
  if (activeCast && (!target || target.hp <= 0)) {
    // Keep the cast's target ownership; do not swing at a corpse or retarget.
    if (b.playerNextAttackAt <= at) b.playerNextAttackAt = at + 250;
    return;
  }
  if (!target && s.rotation.some(id => treatmentSources.has(c.skills[id]?.sourceName ?? '') && statusTreatmentEligible(s, c, c.skills[id], s.learnedSkills[id], at)))
    target = { id: s.id, monsterId: b.monsterId, hp: 0, maxHp: b.maxHp, startedAt: b.startedAt, arrivedAt: at, enemyNextAttackAt: Infinity, spawnDirection: 0, position: battleHeroAt(s, at) };
  if (!target || s.hp <= 0) return;
  const stats = derivedStats(s, c);
  const motion = stats.attackMotionMs;
  const skillDecisionDue = !activeCast && at >= (b.playerNextSkillAt ?? 0);
  const skill = skillDecisionDue ? chooseSkill(s, c, at, target, false, false, context) : undefined;
  if (skill) {
    if (skill.sourceName === 'HT_DETECTING') {
      useDetecting(s,c,skill,skillUseLevel(s,c,skill.id),at);
      return;
    }
    if (configurableSkillUseLevel(skill)) {
      startSoloAlchemyCast(s, c, skill, skillUseLevel(s, c, skill.id), at);
      return;
    }
    if (sageFieldSource(skill.sourceName)) {
      startSageFieldCast(s, c, skill, s.learnedSkills[skill.id], at, context);
      return;
    }
    if (['SA_FLAMELAUNCHER', 'SA_FROSTWEAPON', 'SA_LIGHTNINGLOADER', 'SA_SEISMICWEAPON', 'WS_MELTDOWN', 'AM_POTIONPITCHER'].includes(skill.sourceName ?? '')) {
      const level = s.learnedSkills[skill.id];
      startSageEnchantCast(s, c, skill, level, at);
      return;
    }
    if (skill.sourceName === 'MO_BLADESTOP') target = bladeStopIncomingEnemy(s, c, s.learnedSkills[skill.id], at) ?? target;
    else if (bladeLinkedTarget) target = bladeLinkedTarget;
    if (skill.sourceName === 'SA_SPELLBREAKER') target = findInterruptibleNpcCast(s,c,at,spellBreakerCastMs(s,c,skill,s.learnedSkills[skill.id],at)) ?? target;
    if (skill.sourceName === 'SA_MAGICROD') target = magicRodTarget(s,c,s.learnedSkills[skill.id],at) ?? target;
    if(conversionSpec(skill.sourceName??''))target=elementalConversionTarget(s,c,skill,at)??target;
    if(priestControlSources.has(skill.sourceName??''))target=priestControlTarget(s,c,skill.sourceName!,at)??target;
    if(skill.sourceName==='BA_PANGVOICE')target=pangVoiceTarget(s,c,at)??target;
    if(skill.sourceName==='DC_WINKCHARM')target=winkCharmTarget(s,c,at)??target;
    faceHeroTowards(s, enemyPositionAt(target, at), at);
    if ((offensiveSkill(skill) && !['AL_RUWACH', ...priestControlSources].includes(skill.sourceName ?? '')) ||
      ['BA_PANGVOICE', 'DC_WINKCHARM'].includes(skill.sourceName ?? ''))
      provokeEnemy(s, c, target, at);
    if (skill.sourceName !== "AS_CLOAKING") cancelClassicBuff(s, c, "AS_CLOAKING");
    const level = skillUseLevel(s, c, skill.id);
    const base = val(skill.castTimeMs, level) *
      (skill.sourceName === "MO_FINGEROFFENSIVE" ? 1 + Math.min(level, s.combatEffects?.spiritSpheres ?? 0) : 1);
    let castMs = skill.sourceName === "MO_EXTREMITYFIST" && s.combatEffects?.combo &&
      s.combatEffects.combo.expiresAt > at &&
      ["MO_COMBOFINISH", "CH_TIGERFIST", "CH_CHAINCRUSH"].includes(s.combatEffects.combo.sourceName)
      ? 0 : Math.floor((skill.ignoresDex ? base : classicCastTime(base, stats.attributes?.dex ?? s.stats.dex)) *
        (1 - Math.min(100, skill.ignoresStatusEffects ? 0 : stats.effects.castReductionPct ?? 0) / 100));
    const memorize = memorizeCastStart({ remaining: classicBuffActive(s, c, "PF_MEMORIZE", at)
      ? s.combatEffects?.memorizeCharges ?? 0 : 0, castTimeMs: castMs,
      started: true, ignoresStatusEffects: !!skill.ignoresStatusEffects });
    castMs = memorize.castTimeMs;
    if (s.combatEffects?.memorizeCharges && memorize.remaining !== s.combatEffects.memorizeCharges) {
      s.combatEffects.memorizeCharges = memorize.remaining;
      if (!memorize.remaining) cancelClassicBuff(s, c, "PF_MEMORIZE");
    }
    const delay = afterCastDelay(s, c, skill, level);
    // Auto Counter's posture owns its visual stillness; the independent source
    // canact clock still applies and only an incoming hit triggers its counter.
    const previousActionReadyAt=b.playerActionReadyAt, previousNextSkillAt=b.playerNextSkillAt, previousMoveBlockedUntil=s.fieldHero?.moveBlockedUntil;
    const skillClockOwnership = beginSkillAction(s, at, castMs, motion);
    b.playerActionReadyAt = at + castMs + Math.max(skill.sourceName === 'KN_AUTOCOUNTER' ? 0 : motion, delay);
    if (!(castMs > 0 && learnedFreeCastLevel(s, c) > 0))
      blockFieldHero(s, at, at + castMs + (skill.sourceName === 'KN_AUTOCOUNTER' ? 0 : motion));
    b.playerNextSkillAt = s.playerCanActAt;
    const actionId = `action-${s.id}-${at}-${s.nextEventId}`;
    // Support preserves the due basic attack; its short motion is the only
    // obstruction when the source skill has no cast or after-cast delay.
    if (castMs > 0) {
      b.cast = {
        skillId: skill.id, level, targetId: target.id, startedAt: at, endsAt: at + castMs,
        position: { ...(isHunterTrapSkill(skill.sourceName ?? "")
          ? hunterTrapPosition(s, c, skill, level, target, at)! : enemyPositionAt(target, at)) }, actionId, afterCastDelayMs: delay,
        clockOwnership:{actionReadyAt:b.playerActionReadyAt,previousActionReadyAt,nextSkillAt:b.playerNextSkillAt,previousNextSkillAt,moveBlockedUntil:s.fieldHero?.moveBlockedUntil,previousMoveBlockedUntil},
        skillClockOwnership,
      };
      event(s, at, "cast", skill.name, undefined, "player", {
        skillId: skill.id, skillLevel: level, castMs, enemyId: target.id, monsterId: target.monsterId,
        ...playerAction(s, c, at, "none", actionId), targetActorId: skill.targetType === "self" ? s.id : target.id,
      });
    } else {
      if (completePlayerSkill(s, c, skill, level, target, at, actionId, undefined, context))
        finishSkillAction(s, at, delay);
      else if (val(skill.afterCastDelayMs, level) !== 0) cancelSkillAction(s, skillClockOwnership, at);
      b.playerNextSkillAt = s.playerCanActAt;
    }
    return;
  }
  // This is the automation's next decision, not a skill cooldown.
  if (skillDecisionDue) b.playerNextSkillAt = at + 250;
  if (bladeLinkedTarget) {
    if (at >= b.playerNextAttackAt) b.playerNextAttackAt = at + 250;
    return;
  }
  if (at < b.playerNextAttackAt || !castingWithFreeCast && at < Math.max(b.playerActionReadyAt ?? 0, s.playerCanActAt ?? 0)) return;
  const range = basicAttackRange(s, c);
  const inRange = (e: BattleEnemy) => playerBattleDistance(battleHeroAt(s, at), enemyPositionAt(e, at)) <= range;
  const targetId = target.id;
  const meleeTarget = enemies(s).find(e => e.id === targetId && inRange(e)) ??
    (b.challengeId ? enemies(s).find(inRange) : undefined);
  if (classicBuffActive(s, c, "TF_HIDING", at) || !meleeTarget) {
    b.playerNextAttackAt = at + 250;
    return;
  }
  target = meleeTarget;
  b.targetId = target.id;
  faceHeroTowards(s, enemyPositionAt(target, at), at);
  cancelClassicBuff(s, c, "AS_CLOAKING");
  const levels = learnedBySource(s, c);
  const weaponEntry = s.inventory.find(e => e.uid === s.equipment.weapon);
  const weaponType = weaponEntry ? c.items[weaponEntry.itemId]?.weaponType : undefined;
  const sacrifice = activeSacrifice(s, c, at);
  if (sacrifice) {
    const sourceSkill = Object.values(c.skills).find(candidate => candidate.sourceName === 'PA_SACRIFICE');
    const consumed = consumeSacrificeCharge(s, c, at, stats.maxHp);
    if (sourceSkill && consumed) {
      const strike: Skill = { ...sourceSkill, kind: 'physical', targetType: 'enemy', damageType: 'weapon',
        power: [100], hitCount: [1], sourceHitCount: [1], element: 'Neutral',
        ignoreDefense: true, ignoreFlee: true, statusEffect: undefined, implementation: 'supported' };
      const action = playerAction(s, c, at, 'attack');
      if (!castingWithFreeCast) blockFieldHero(s, at, at + motion);
      damageEnemies(s, c, target, at, strike, consumed.level, undefined, action, false, undefined, context);
      b.playerNextAttackAt = at + stats.attackIntervalMs;
      if (!activeCast) {
        b.playerActionReadyAt = at + motion;
      }
      b.supportNeedsOffense = false;
      return;
    }
  }
  const proc = weaponType === "dagger" && random(s) * 100 < 5 * (levels.TF_DOUBLE ?? 0)
    ? "TF_DOUBLE" : random(s) * 100 < 30 - (levels.MO_TRIPLEATTACK ? levels.MO_TRIPLEATTACK : 30)
      ? "MO_TRIPLEATTACK" : undefined;
  const passive = proc ? Object.values(c.skills).find(candidate => candidate.sourceName === proc) : undefined;
  const action = playerAction(s, c, at, "attack");
  if (!castingWithFreeCast) blockFieldHero(s, at, at + motion);
  if (passive) {
    damageEnemies(s, c, target, at, {
      ...passive, kind: "physical", damageType: "weapon",
      ...(proc === "TF_DOUBLE" && { power: [100], sourceHitCount: [2] }),
      hitCount: [proc === "TF_DOUBLE" ? 2 : 3],
    }, levels[proc!], undefined, action, false, undefined, context);
    if (proc === "MO_TRIPLEATTACK") {
      (s.combatEffects ??= {}).combo = { sourceName: proc, expiresAt: at + 2000 };
      // Source skill.c3445 only delays Triple's proc when a follow-up is learned.
      if ((levels.MO_CHAINCOMBO ?? 0) > 0)
        finishSkillAction(s, at, sourceAfterCastDelay(s, c, passive, levels[proc]));
    }
  } else damageEnemies(s, c, target, at, undefined, 1, undefined, action, false, undefined, context);
  hindsightAttack(s, c, target, at, proc !== "MO_TRIPLEATTACK", context);
  b.playerNextAttackAt = at + stats.attackIntervalMs;
  if (!activeCast) {
    b.playerActionReadyAt = at + motion;
  }
  b.supportNeedsOffense = false;
}

type CombatDeadline = { at: number; priority: number; key: string } & (
  { kind: "cast" | "supportCast" | "player" | "timeout" | "buffs" | "field" | 'sageField' | 'carryReturn' } |
  { kind: "enemy" | "npcCast" | "targetCheck"; enemy: BattleEnemy } |
  { kind: "sightBlaster"; enemy: BattleEnemy } |
  { kind: "ruwach"; enemy: BattleEnemy } |
  { kind: "playerStatus" } |
  { kind: "splasher"; enemy: BattleEnemy } |
  { kind: "poison"; enemy: BattleEnemy; status: 'SC_POISON' | 'SC_DPOISON' } |
  { kind: "bleeding"; enemy: BattleEnemy } |
  { kind: 'controlExpiry'; enemy: BattleEnemy; status: string } |
  { kind: "ground"; ground: NonNullable<Battle["groundEffects"]>[number] } |
  { kind: "trap"; trap: NonNullable<Battle["traps"]>[number] } |
  { kind: "unit"; unit: NonNullable<Battle["skillUnits"]>[number] } |
  { kind: "falcon"; strike: FalconStrike } |
  { kind: "delayed"; delayed: NonNullable<Battle["delayedSkills"]>[number] }
);

function maintainPlayerBuffs(s: GameState, c: Catalog, at: number) {
  discardAloeveraUnderAutoBerserk(s,c,at);
  if (s.elementalField) syncSageField(s, c, at);
  tickTensionRelax(s, c, at);
  tickSoloStances(s, c, at);
  tickChasewalk(s, c, at);
  tickClassicBuffs(s, c, at);
  if ([s.combatEffects?.pneumaGround, s.combatEffects?.safetyWallGround, ...(s.combatEffects?.defensiveGrounds ?? [])]
    .some(ground => ground && ground.sceneKey !== defenseSceneKey(s))) clearClassicGrounds(s, c);
  if (s.combatEffects?.defensiveGrounds) s.combatEffects.defensiveGrounds = s.combatEffects.defensiveGrounds
    .filter(ground => ground.expiresAt > at && (ground.kind !== "safetyWallGround" || (ground.hits ?? 0) > 0));
  for (const [id, buff] of Object.entries(s.buffs))
    if (buff.expiresAt <= at) {
      delete s.buffs[id];
      const name = c.skills[id]?.sourceName;
      if (name === "MG_SAFETYWALL" && s.combatEffects)
        s.combatEffects.safetyWallHits = 0;
      if (name === "MG_ENERGYCOAT" && s.combatEffects)
        s.combatEffects.energyCoat = false;
      if (name === "PR_KYRIE" && s.combatEffects) {
        s.combatEffects.kyrieHp = 0;
        s.combatEffects.kyrieHits = 0;
      }
      if (s.combatEffects) {
        if (name === 'AS_POISONREACT') delete s.combatEffects.poisonReact;
        if (name === 'PA_SACRIFICE') delete s.combatEffects.sacrifice;
        if (name === "SA_AUTOSPELL") delete s.combatEffects.autospell;
        if (name === "PF_MEMORIZE") s.combatEffects.memorizeCharges = 0;
        if (name === "SM_ENDURE") delete s.combatEffects.endure;
        if (name === "AL_PNEUMA") delete s.combatEffects.pneumaGround;
        if (name === "MG_SAFETYWALL") delete s.combatEffects.safetyWallGround;
        if (s.combatEffects.buffLevels) delete s.combatEffects.buffLevels[id];
      }
    }
  const stats = derivedStats(s, c);
  s.hp = Math.min(s.hp, stats.maxHp);
  s.sp = Math.min(s.sp, stats.maxSp);
}

/** One persisted, synchronous timeline; no actor waits for another actor's animation. */
function runCombatTimeline(s: GameState, c: Catalog, until: number, windowStart: number, context?: SimulationContext) {
  const persistedAt = s.lastSimulatedAt;
  try {
  let cursor = windowStart;
  // derivedStats and legacy eligibility helpers read this clock. Resolve each
  // deadline against its own time; restore the persisted window end in finally.
  s.lastSimulatedAt = cursor;
  maintainPlayerBuffs(s, c, cursor);
  const initial = s.battle!;
  const diseaseTiming = !!s.elementalField || !!sageFieldSource(c.skills[s.supportCast?.skillId ?? '']?.sourceName) ||
    !!Object.keys(s.playerStatuses ?? {}).length || enemies(s).some(enemy => !!c.monsters[enemy.monsterId].npcStatusSkills?.length);
  let recoveryCursor = cursor;
  initial.playerNextSkillAt ??= initial.playerNextAttackAt;
  initial.playerActionReadyAt ??= initial.cast?.endsAt ?? initial.playerNextAttackAt;
  if (!initial.challengeId) initial.fieldDecisionAt ??= cursor;
  while (s.battle || s.falconStrikes?.some(strike => strike.impactAt <= until)) {
    if (!s.battle) { resolveUnattachedFalconStrikes(s,c,until); break; }
    const b = s.battle;
    const due: CombatDeadline[] = [];
    const add = (deadline: CombatDeadline) => { if (deadline.at <= until) due.push(deadline); };
    for (const strike of s.falconStrikes ?? [])
      add({kind:'falcon',strike,at:Math.max(cursor,strike.impactAt),priority:2.5,key:strike.id});
    const fieldBoundary = nextSageFieldBoundary(s, cursor);
    if (fieldBoundary !== undefined) add({ kind: 'sageField', at: fieldBoundary, priority: -2.15, key: 'sageField' });
    const carryAt = s.carryReturnRequestedAt ?? (overweightForCombat(s, c) ? cursor : undefined);
    if (carryAt !== undefined) add({ kind: 'carryReturn', at: Math.max(cursor, carryAt), priority: 100, key: 'carryReturn' });
    if (!b.challengeId) {
      const movement = [b.fieldDecisionAt ?? cursor, s.fieldHero?.arrivedAt,
        s.fieldHero?.moveBlockedUntil, ...(s.fieldPopulation?.respawns.map(entry => entry.at) ?? [])]
        .filter((time): time is number => time !== undefined && time > cursor);
      add({ kind: "field", at: (b.fieldDecisionAt ?? cursor) <= cursor ? cursor : Math.min(...movement), priority: -0.5, key: "field" });
    }
    const diseaseDeadline = nextPlayerStatusDeadline(s);
    if (Number.isFinite(diseaseDeadline)) add({ kind: 'playerStatus', at: Math.max(cursor, diseaseDeadline), priority: -1.8, key: 'playerStatus' });
    for (const buff of Object.values(s.buffs))
      if (Number.isFinite(buff.expiresAt))
        add({ kind: "buffs", at: Math.max(cursor, buff.expiresAt), priority: -2, key: "buffs" });
    for (const [id, drainAt] of Object.entries(s.combatEffects?.buffDrainAt ?? {}))
      if (s.buffs[id] && Number.isFinite(drainAt))
        add({ kind: "buffs", at: Math.max(cursor, drainAt), priority: -2, key: "buffs" });
    if (s.combatEffects?.berserk) add({ kind: 'buffs', at: Math.max(cursor, s.combatEffects.berserk.nextTickAt), priority: -2, key: 'berserk' });
    if (b.deadlineAt !== undefined) add({ kind: "timeout", at: Math.max(cursor, b.deadlineAt), priority: -2.2, key: "timeout" });
    if (b.cast) add({ kind: "cast", at: Math.max(cursor, b.cast.endsAt), priority: 0, key: b.cast.actionId ?? b.cast.skillId });
    if (s.supportCast) add({ kind: 'supportCast', at: Math.max(cursor, s.supportCast.endsAt), priority: -1, key: s.supportCast.actionId });
    for (const [index, delayed] of (b.delayedSkills ?? []).entries())
      add({ kind: "delayed", delayed, at: Math.max(cursor, delayed.endsAt), priority: 1, key: `${index}` });
    for (const [index, ground] of (b.groundEffects ?? []).entries())
      if ((ground.intervalMs ?? c.skills[ground.skillId]?.groundIntervalMs ?? 0) > 0 &&
        ground.nextTickAt < ground.expiresAt && (ground.remainingHits ?? 1) > 0)
        add({ kind: "ground", ground, at: Math.max(cursor, ground.nextTickAt), priority: 2, key: `${index}` });
    for (const trap of b.traps ?? []) add({ kind: "trap", trap,
      at: Math.max(cursor, trap.triggeredAt === undefined ? Math.min(trap.nextTickAt, trap.expiresAt) : trap.expiresAt),
      priority: 1.5, key: trap.id });
    for (const unit of b.skillUnits ?? []) {
      const slowGrace = c.skills[unit.skillId]?.sourceName === 'DC_DONTFORGETME';
      const victim = enemies(s).find(enemy => enemy.id === unit.capturedEnemyId);
      const departure = victim && victim.approachPausedAt === undefined && victim.approachFrom
        ? groundDepartureAt(victim.approachFrom, victim.position, victim.startedAt, victim.arrivedAt, unit.position, cursor) : undefined;
      const alreadyOut = victim && !groundCovers(unit.cells, enemyPositionAt(victim, cursor), 0);
      const graceDeparture = slowGrace ? nextSlowGraceDeparture(s, unit, cursor) : undefined;
      const spDrain = slowGrace ? unit.nextSpDrainAt ?? Infinity : Infinity;
      add({ kind: 'unit', unit, at: Math.max(cursor, alreadyOut ? cursor : Math.min(unit.nextTickAt, unit.expiresAt,
        departure ?? Infinity, graceDeparture ?? Infinity, spDrain)),
        priority: 1.6, key: unit.id });
    }
    for (const enemy of enemies(s)) {
      const ruwach = c.skills.al_ruwach;
      if (ruwach && ruwachAuraTickActive(s, ruwach, cursor) && enemy.hp > 0) {
        const level = s.combatEffects?.buffLevels?.[ruwach.id] ?? s.learnedSkills[ruwach.id] ?? 1;
        const hiddenUntil = concealedUntil(enemy, cursor);
        if (hiddenUntil !== undefined) {
          const auraStart = (s.buffs[ruwach.id]?.expiresAt ?? cursor) - val(ruwach.statusDurationMs, level, 10000);
          const contactAt = nextBattleContactAt(s, enemy, Math.max(cursor, enemy.startedAt),
            Math.min(until, hiddenUntil, s.buffs[ruwach.id]?.expiresAt ?? cursor), val(ruwach.aoeRadius, level));
          const pulseAt = contactAt === undefined ? undefined : nextRuwachPulseAt(contactAt, auraStart);
          const auraExpiresAt = s.buffs[ruwach.id]?.expiresAt ?? cursor;
          if (pulseAt !== undefined && pulseAt <= Math.min(until, auraExpiresAt) && pulseAt < hiddenUntil)
            // status.c scans and applies the final aura pulse before decrementing
            // the status timer and ending SC_RUWACH at the same timestamp.
            add({ kind: 'ruwach', enemy, at: pulseAt, priority: -2.1, key: enemy.id });
        }
      }
      const sightSkill = c.skills.sight_blaster;
      if (sightSkill && classicBuffActive(s, c, 'WZ_SIGHTBLASTER', cursor)) {
        const level = s.combatEffects?.buffLevels?.[sightSkill.id] ?? s.learnedSkills[sightSkill.id] ?? 1;
        const contactAt = nextBattleContactAt(s, enemy, Math.max(cursor, enemy.startedAt), until,
          val(sightSkill.aoeRadius, level));
        if (contactAt !== undefined)
          add({ kind: 'sightBlaster', enemy, at: contactAt, priority: -1.9, key: enemy.id });
      }
      const conversionEffect=enemy.statuses?.SC_ARMOR_PROPERTY;
      if(conversionEffect&&conversionSpec(c.skills[conversionEffect.skillId??'']?.sourceName??''))add({kind:'controlExpiry',enemy,status:'SC_ARMOR_PROPERTY',at:Math.max(cursor,conversionEffect.expiresAt),priority:-1.7,key:`${enemy.id}:SC_ARMOR_PROPERTY`});
      for(const status of ['SC_BLIND','SC_SILENCE']) {
        const effect=enemy.statuses?.[status];
        if(effect&&priestControlSources.has(c.skills[effect.skillId??'']?.sourceName??''))add({kind:'controlExpiry',enemy,status,at:Math.max(cursor,effect.expiresAt),priority:-1.7,key:`${enemy.id}:${status}`});
      }
      const confusion=enemy.statuses?.SC_CONFUSION;
      if(confusion&&c.skills[confusion.skillId??'']?.sourceName==='BA_PANGVOICE')
        add({kind:'controlExpiry',enemy,status:'SC_CONFUSION',at:Math.max(cursor,confusion.expiresAt),priority:-1.7,key:`${enemy.id}:SC_CONFUSION`});
      const winkCharm=enemy.statuses?.SC_DC_WINKCHARM;
      if(winkCharm&&c.skills[winkCharm.skillId??'']?.sourceName==='DC_WINKCHARM')
        add({kind:'controlExpiry',enemy,status:'SC_DC_WINKCHARM',at:Math.max(cursor,winkCharm.expiresAt),priority:-1.7,key:`${enemy.id}:SC_DC_WINKCHARM`});
      const closeConfine = enemy.statuses?.[RG_CLOSECONFINE_STATUS];
      if (closeConfine?.sourceActorId === s.id && c.skills[closeConfine.skillId ?? '']?.sourceName === 'RG_CLOSECONFINE')
        add({ kind: 'controlExpiry', enemy, status: RG_CLOSECONFINE_STATUS,
          at: Math.max(cursor, closeConfine.expiresAt), priority: -1.7, key: `${enemy.id}:${RG_CLOSECONFINE_STATUS}` });
      const bomb = enemy.statuses?.SC_SPLASHER;
      if (bomb) add({ kind: 'splasher', enemy, at: Math.max(cursor, bomb.expiresAt), priority: 1.7, key: enemy.id });
      const bleeding = enemy.statuses?.SC_BLOODING;
      if (bleeding && bleeding.sourceActorId === s.id && enemy.hp > 0) {
        bleeding.nextTickAt ??= (bleeding.startsAt ?? cursor) + 10000;
        if (bleeding.nextTickAt <= bleeding.expiresAt)
          add({ kind: 'bleeding', enemy, at: Math.max(cursor, bleeding.nextTickAt), priority: 2.9, key: enemy.id });
      }
      for (const status of ['SC_POISON', 'SC_DPOISON'] as const) {
      const poison = enemy.statuses?.[status];
      if (poison) {
        poison.nextTickAt ??= Math.max(cursor, poison.startsAt ?? cursor) + 1000;
        if (poison.nextTickAt < poison.expiresAt)
          add({ kind: "poison", enemy, status, at: Math.max(cursor, poison.nextTickAt), priority: 3, key: `${enemy.id}:${status}` });
      }
      }
      if (enemy.npcCombat?.cast) add({ kind: 'npcCast', enemy, at: Math.max(cursor, enemy.npcCombat.cast.endsAt), priority: 0.5, key: enemy.id });
      if(enemy.npcCombat?.nextTargetCheckAt!==undefined)add({kind:'targetCheck',enemy,at:Math.max(cursor,enemy.npcCombat.nextTargetCheckAt),priority:1,key:enemy.id});
      const attackAt = enemy.npcCombat?.cast ? undefined : nextEnemyAttackAt(s, c, enemy, cursor, until);
      if (attackAt !== undefined) add({ kind: "enemy", enemy, at: attackAt, priority: 5, key: enemy.id });
    }
    const activePlayerCast = currentPlayerCast(s, cursor);
    const freeCastDuringCast = !!activePlayerCast && activeFreeCastLevel(s, c, cursor) > 0;
    const supportCastBlocksPlayer = activePlayerCast?.kind === 'support' && !freeCastDuringCast;
    if (s.hp > 0 && !overweightForCombat(s, c) && !(s.carryReturnRequestedAt !== undefined && s.carryReturnRequestedAt <= cursor) && !trickDeadActive(s, c, cursor) && (!b.cast || freeCastDuringCast) && !supportCastBlocksPlayer && (enemies(s).some(enemy => enemy.hp > 0) || s.rotation.some(id => treatmentSources.has(c.skills[id]?.sourceName ?? '') && statusTreatmentEligible(s, c, c.skills[id], s.learnedSkills[id], cursor)))) {
      const nextPlayerWork = freeCastDuringCast ? b.playerNextAttackAt : Math.min(
        Math.max(b.playerNextAttackAt, b.playerActionReadyAt ?? 0, s.playerCanActAt ?? 0),
        Math.max(b.playerNextSkillAt ?? b.playerNextAttackAt, s.playerCanActAt ?? 0));
      add({ kind: "player", at: Math.max(cursor, b.startedAt, nextPlayerWork), priority: 4, key: s.id });
    }
    due.sort((a, z) => a.at - z.at || a.priority - z.priority || (a.key < z.key ? -1 : a.key > z.key ? 1 : 0));
    const next = due[0];
    if (!next) break;
    if (diseaseTiming && next.at > recoveryCursor) recoverResources(s, c, next.at - .001, next.at - recoveryCursor);
    recoveryCursor = next.at;
    cursor = next.at;
    s.lastSimulatedAt = cursor;
    if (s.elementalField && next.kind !== 'sageField') syncSageField(s, c, cursor);
    if (next.kind === 'falcon') {
      resolveFalconStrike(s,c,next.strike,cursor);
      continue;
    }
    const target = enemies(s).find(e => e.id === b.targetId) ?? enemies(s)[0];
    if (next.kind === 'sageField') {
      syncSageField(s, c, cursor);
    } else if (next.kind === 'carryReturn') {
      returnForCarry(s, c, cursor);
    } else if (next.kind === "field") {
      updateFieldActors(s, c, cursor, context);
      b.fieldDecisionAt = cursor + 250;
     } else if (next.kind === 'playerStatus') {
      tickPlayerStatuses(s, c, cursor);
      if (s.hp <= 0) defeatPlayer(s, c, cursor);
    }
    else if (next.kind === 'sightBlaster') {
      const skill = c.skills.sight_blaster;
      const target = enemies(s).find(enemy => enemy.id === next.enemy.id && enemy.hp > 0);
      if (skill && target && classicBuffActive(s, c, 'WZ_SIGHTBLASTER', cursor)) {
        const level = s.combatEffects?.buffLevels?.[skill.id] ?? s.learnedSkills[skill.id] ?? 1;
        const pulseTargets = targets(s, skill, level, target, cursor);
        if (pulseTargets.length) {
          cancelClassicBuff(s, c, 'WZ_SIGHTBLASTER');
          const action = playerAction(s, c, cursor, 'none');
          event(s, cursor, 'skill', skill.name, undefined, 'enemy', { skillId: skill.id, skillLevel: level,
            enemyId: target.id, monsterId: target.monsterId, sourceActorId: s.id, targetActorId: target.id,
            ...action, actorAction: 'none', actionMotionMs: 0, castMs: 0 });
          damageEnemies(s, c, target, cursor, skill, level, undefined, action, false, undefined, context);
        }
      }
    }
    else if (next.kind === 'ruwach') {
      const skill = c.skills.al_ruwach;
      const target = enemies(s).find(enemy => enemy.id === next.enemy.id && enemy.hp > 0);
      if (skill && target && ruwachAuraTickActive(s, skill, cursor) &&
        enemyDistanceAt(target, cursor, battleHeroAt(s, cursor)) <= val(skill.aoeRadius, 1)) {
        const revealed = revealRuwachTarget(target.statuses, cursor);
        if (revealed.length) {
          const level = s.combatEffects?.buffLevels?.[skill.id] ?? s.learnedSkills[skill.id] ?? 1;
          const action = playerAction(s, c, cursor, 'none');
          event(s, cursor, 'skill', skill.name, undefined, 'enemy', { skillId: skill.id, skillLevel: level,
            enemyId: target.id, monsterId: target.monsterId, sourceActorId: s.id, targetActorId: target.id,
            ...action, actorAction: 'none', actionMotionMs: 0, castMs: 0 });
          damageEnemies(s, c, target, cursor, { ...skill, targetType: 'enemy', aoeRadius: [0], statusEffect: undefined }, level, undefined, action, false, undefined, context);
        }
      }
    }
    else if(next.kind==='controlExpiry') {if(next.status==='SC_ARMOR_PROPERTY')expireElementalConversion(s,c,next.enemy,cursor);else if(next.status==='SC_CONFUSION')expirePangVoice(s,next.enemy,cursor);else if(next.status==='SC_DC_WINKCHARM')expireWinkCharm(s,next.enemy,cursor);else if(next.status===RG_CLOSECONFINE_STATUS){if(expireCloseConfine(s,next.enemy,cursor)&&s.battle&&!s.battle.challengeId)updateFieldActors(s,c,cursor,context);}else expirePriestMonsterStatus(s,c,next.enemy,next.status,cursor);}
    else if(next.kind==='targetCheck') {
      reacquireReleasedMonster(s,c,next.enemy,cursor);
      if(s.battle&&!s.battle.challengeId)updateFieldActors(s,c,cursor,context);
    }
    else if (next.kind === 'npcCast') {
      const cast = next.enemy.npcCombat?.cast;
      const skill = takeMonsterStatusCast(s, c, next.enemy, cursor);
      if (skill) enemyAttack(s, c, next.enemy, cursor, skill, cast, context);
    } else if (next.kind === "buffs") maintainPlayerBuffs(s, c, cursor);
    else if (next.kind === "timeout") {
      clearBladeStop(s, cursor);
      clearTrickDead(s, c, cursor);
      cancelSageEnchantCast(s, c, cursor, 'Conjuração encerrada pelo fim do desafio.');
      s.battle = null; s.status = "town"; s.autoResume = false; s.pendingAreaId = null;
      event(s, cursor, "challenge", "Tempo do desafio esgotado.");
    } else if (next.kind === 'supportCast') {
      resolveSupportCast(s, c, cursor, context);
    } else if (next.kind === "cast") {
      const cast = b.cast!, skill = c.skills[cast.skillId];
      const castTarget = enemies(s).find(e => e.id === cast.targetId);
      b.cast = undefined;
      // Ground/self casts can finish while the finite population is waiting to
      // respawn. Their saved position is independent of a living target actor.
      const resolutionTarget: BattleEnemy = castTarget ?? target ?? {
        id: cast.targetId, monsterId: b.monsterId, hp: 0, maxHp: b.maxHp,
        startedAt: cast.startedAt, arrivedAt: cursor, enemyNextAttackAt: Infinity,
        spawnDirection: 0, position: cast.position ?? battleHeroAt(s, cursor),
      };
      const validTarget = !!skill && ((castTarget?.hp ?? 0) > 0 || skill.targetType !== "enemy");
      const succeeded = validTarget && completePlayerSkill(s, c, skill, cast.level, resolutionTarget, cursor, cast.actionId,
        skill.targetType === "ground" ? cast.position : undefined, context);
      if (succeeded) {
        const delay = cast.afterCastDelayMs ?? afterCastDelay(s, c, skill, cast.level);
        finishSkillAction(s, cursor, delay);
        b.playerActionReadyAt = cursor + Math.max(playerMotion(s, c), delay);
        b.playerNextSkillAt = s.playerCanActAt;
        blockFieldHero(s, cursor, cursor + playerMotion(s, c));
      } else {
        if (skill && val(skill.afterCastDelayMs, cast.level) !== 0) cancelSkillAction(s, cast.skillClockOwnership, cursor);
        const owned = cast.clockOwnership;
        const legacyAction = cast.endsAt + Math.max(playerMotion(s, c), cast.afterCastDelayMs ?? 0);
        if (b.playerActionReadyAt === (owned?.actionReadyAt ?? legacyAction)) b.playerActionReadyAt = Math.max(cursor, owned?.previousActionReadyAt ?? cursor);
        if (b.playerNextSkillAt === (owned?.nextSkillAt ?? legacyAction)) b.playerNextSkillAt = Math.max(cursor, owned?.previousNextSkillAt ?? cursor);
        if (s.fieldHero?.moveBlockedUntil === (owned?.moveBlockedUntil ?? cast.endsAt + playerMotion(s, c)))
          s.fieldHero!.moveBlockedUntil = Math.max(cursor, owned?.previousMoveBlockedUntil ?? cursor);
        if (!validTarget) event(s, cursor, "cast-failed", "O alvo da conjuração foi derrotado.", undefined, "player", {
          skillId: cast.skillId, sourceActorId: s.id, actorAction: "none", actionId: cast.actionId,
        });
      }
    } else if (next.kind === "delayed") {
      b.delayedSkills = b.delayedSkills?.filter(pending => pending !== next.delayed);
      const skill = c.skills[next.delayed.skillId];
      const original = enemies(s).find(e => e.id === next.delayed.targetId);
      if (next.delayed.effect === "doublecast") {
        if (skill && original && original.hp > 0)
          damageEnemies(s, c, original, cursor, skill, next.delayed.level, undefined, playerAction(s, c, cursor, "none"), true, undefined, context);
      } else {
        const delayedTarget = original ?? target;
        if (skill && delayedTarget) applyEnemyStatus(s, c, skill, next.delayed.level, delayedTarget, cursor, next.delayed.position);
      }
    } else if (next.kind === 'splasher') {
      const bomb = next.enemy.statuses!.SC_SPLASHER;
      delete next.enemy.statuses!.SC_SPLASHER;
      const skill = bomb.skillId && c.skills[bomb.skillId];
      if (skill && bomb.sourceActorId === s.id && next.enemy.hp > 0) {
        damageEnemies(s, c, next.enemy, cursor,
          { ...skill, kind: 'physical', damageType: 'weapon', statusEffect: 'SC_POISON',
            statusChance: Array.from({ length: skill.maxLevel }, (_, i) => 10 + 4 * (i + 1)) },
          bomb.level, { ...enemyPositionAt(next.enemy, cursor) }, playerAction(s, c, cursor, 'none'), false, undefined, context);
      }
    } else if (next.kind === "trap") tickHunterTrap(s, c, next.trap, cursor, context);
    else if (next.kind === 'unit') tickSoloUnit(s, c, next.unit, cursor);
    else if (next.kind === "ground") {
      const ground = next.ground, skill = c.skills[ground.skillId];
      const closest = enemies(s).filter(e => e.startedAt <= cursor && (!ground.targetId || e.id === ground.targetId))
        .sort((a, z) => battleDistance(enemyPositionAt(a, cursor), ground.position) -
          battleDistance(enemyPositionAt(z, cursor), ground.position) || (a.id < z.id ? -1 : a.id > z.id ? 1 : 0))[0];
      const center = ground.targetId ? undefined : ground.position;
      if (closest && skill && targets(s, skill, ground.level, closest, cursor, center).length) {
        resolveSkill(s, c, skill, ground.level, closest, cursor, true, center, playerAction(s, c, cursor, "none"), context);
        if (ground.remainingHits !== undefined && --ground.remainingHits <= 0)
          removeGroundPlacement(s, ground.groundPlacementId);
      }
      ground.nextTickAt = cursor + (ground.intervalMs ?? skill?.groundIntervalMs ?? 1000);
    } else if (next.kind === "poison") {
      const poison = next.enemy.statuses![next.status];
      const deadly = next.status === 'SC_DPOISON';
      const damage = deadly ? deadlyPoisonTickRules(next.enemy.maxHp, 1000).damage : 3 + Math.floor(next.enemy.maxHp / 200);
      if (!deadly && next.enemy.hp <= Math.max(Math.floor(next.enemy.maxHp / 4), damage)) delete next.enemy.statuses![next.status];
      else {
        const taken = Math.min(next.enemy.hp, damage);
        const targetHpBefore = next.enemy.hp;
        next.enemy.hp -= taken;
        event(s, cursor, "damage", deadly ? 'Veneno Mortal' : "Veneno", taken, "enemy", {
          enemyId: next.enemy.id, monsterId: next.enemy.monsterId, actorAction: "none",
          targetActorId: next.enemy.id, hitMotionMs: c.monsters[next.enemy.monsterId].damageMotionMs ?? 400,
          targetHpBefore,
        });
        poison.nextTickAt = cursor + 1000;
        if (next.enemy.hp <= 0 && s.battle) awardKill(s, c, next.enemy, cursor);
      }
    } else if (next.kind === 'bleeding') {
      const bleeding = next.enemy.statuses?.SC_BLOODING;
      if (bleeding && bleeding.sourceActorId === s.id && cursor <= bleeding.expiresAt && next.enemy.hp > 0) {
        const damage = 200 + Math.floor(random(s) * 600);
        const targetHpBefore = next.enemy.hp;
        const taken = Math.min(targetHpBefore, damage);
        next.enemy.hp -= taken;
        rememberMonsterAttacker(s, next.enemy, taken, cursor);
        event(s, cursor, 'damage', 'Sangramento', taken, 'enemy', {
          skillId: bleeding.skillId, skillLevel: bleeding.level,
          sourceActorId: bleeding.sourceActorId, enemyId: next.enemy.id,
          monsterId: next.enemy.monsterId, actorAction: 'none', targetActorId: next.enemy.id,
          targetHpBefore, hitMotionMs: c.monsters[next.enemy.monsterId].damageMotionMs ?? 400,
        });
        bleeding.nextTickAt = cursor + 10000;
        if (next.enemy.hp <= 0 && s.battle) awardKill(s, c, next.enemy, cursor, c.skills[bleeding.skillId ?? '']);
      }
    } else if (next.kind === "enemy") {
      enemyAttack(s, c, next.enemy, cursor, undefined, undefined, context);
      // A rejected stale spatial deadline must still advance the reducer.
      if (s.battle && next.enemy.enemyNextAttackAt <= cursor) next.enemy.enemyNextAttackAt = cursor + 1;
    }
    else if (next.kind === "player") playerCombatAction(s, c, cursor, context);
    if (s.battle?.fieldTransferReady && s.pendingAreaId && s.carryReturnRequestedAt === undefined && !overweightForCombat(s, c)) {
      const area = c.areas.find(entry => entry.id === s.pendingAreaId);
      cancelSageEnchantCast(s, c, cursor, 'Conjuração encerrada pela troca de área.');
      freezeFieldHero(s, cursor);
      s.battle = null;
      s.pendingAreaId = null;
      if (area) {
        clearBladeStop(s, cursor);
        clearTrickDead(s, c, cursor); // Crossing to a different area is a source warp.
        clearCloseConfine(s, cursor);
        clearClassicGrounds(s, c);
        s.areaId = area.id;
        if (!s.visitedAreas.includes(area.id)) s.visitedAreas.push(area.id);
        s.nextEncounterAt = cursor;
        event(s, cursor, "hunt", `Caçando em ${area.name}.`);
      }
    }
  }
  if (s.carryReturnRequestedAt !== undefined && s.carryReturnRequestedAt <= until)
    returnForCarry(s, c, s.carryReturnRequestedAt);
  if (diseaseTiming && until > recoveryCursor) recoverResources(s, c, until - .001, until - recoveryCursor);
  if (s.battle) s.battle.groundEffects = s.battle.groundEffects?.filter(g => g.expiresAt > until && (g.remainingHits ?? 1) > 0);
  pruneGroundPlacements(s, until);
  } finally {
    s.lastSimulatedAt = persistedAt;
  }
}
export function tick(s: GameState, c: Catalog, at: number, elapsedMs = 1000, context?: SimulationContext) {
  cancelInvalidMonsterStatusCasts(s,at);
  const diseaseTiming = !!s.elementalField || !!sageFieldSource(c.skills[s.supportCast?.skillId ?? '']?.sourceName) ||
    !!Object.keys(s.playerStatuses ?? {}).length || (s.battle?.enemies ?? []).some(enemy => !!c.monsters[enemy.monsterId].npcStatusSkills?.length);
  if (!s.battle && (diseaseTiming || s.falconStrikes?.length)) {
    const persistedAt = s.lastSimulatedAt;
    let cursor = at - elapsedMs;
    try {
    s.lastSimulatedAt = cursor;
    if (s.elementalField) syncSageField(s, c, cursor);
    if (s.supportCast && s.supportCast.endsAt <= cursor) resolveSupportCast(s, c, cursor, context);
    while (cursor < at) {
      const slowEnds = Object.entries(s.buffs).filter(([id,b]) => c.skills[id]?.sourceName === 'PR_SLOWPOISON' && b.expiresAt > cursor).map(([,b]) => b.expiresAt);
      const fieldBoundary = nextSageFieldBoundary(s, cursor) ?? Number.POSITIVE_INFINITY;
      const castEnd = s.supportCast ? Math.max(cursor, s.supportCast.endsAt) : Number.POSITIVE_INFINITY;
      const falconAt=Math.min(...(s.falconStrikes??[]).map(strike=>Math.max(cursor,strike.impactAt)));
      const end = Math.min(at, Math.max(cursor, nextPlayerStatusDeadline(s)), ...slowEnds, fieldBoundary, castEnd, falconAt);
      recoverResources(s, c, end - .001, end - cursor);
      s.lastSimulatedAt = end;
      if (s.elementalField) syncSageField(s, c, end);
      tickPlayerStatuses(s, c, end);
      resolveUnattachedFalconStrikes(s,c,end);
      if (s.hp <= 0 && s.restMode !== "recovery") { defeatPlayer(s, c, end); if (end === at) return; }
      if (s.supportCast && s.supportCast.endsAt <= end) resolveSupportCast(s, c, end, context);
      cursor = end;
      if (end === at) break;
    }
    } finally { s.lastSimulatedAt = persistedAt; }
  }
  tickWindow(s, c, at, elapsedMs, diseaseTiming, context);
  // Combat deadlines inside this window must see the status that was active at
  // their own timestamp. Cleanup at the window end would otherwise erase a
  // NoSave status before replaying an earlier contact or combo action.
  tickBladeStop(s, at);
  pruneGroundPlacements(s, at);
}
function tickWindow(s: GameState, c: Catalog, at: number, elapsedMs: number, diseaseTiming: boolean, context?: SimulationContext) {
  const replayingCombat = !!s.battle && (s.status === "hunting" || s.status === "challenge");
  if (!replayingCombat && (s.status === 'hunting' || s.status === 'challenge') &&
      (overweightForCombat(s, c) || s.carryReturnRequestedAt !== undefined && s.carryReturnRequestedAt <= at))
    returnForCarry(s, c, Math.max(at - elapsedMs, s.carryReturnRequestedAt ?? at - elapsedMs));
  if (!replayingCombat) {
    if (s.supportCast && s.supportCast.endsAt <= at)
      resolveSupportCast(s, c, s.supportCast.endsAt, context);
    updateFieldHero(s, at);
    updateFieldPopulation(s, c, at, context);
    if (s.elementalField) syncSageField(s, c, at);
  }
  // Town, rest and travel have no earlier combat deadlines to replay.
  if (!replayingCombat) maintainPlayerBuffs(s, c, at);
  const d = derivedStats(s, c);
  if (isFieldSitting(s)) {
    // Saved field rests with the old thirty-second deadline are migrated in place.
    s.restUntil = 0;
    if (!diseaseTiming) recoverResources(s, c, at, elapsedMs);
    if (overweightForCombat(s, c)) s.autoResume = false;
    if (!trickDeadActive(s, c, at) && s.autoResume && s.areaId && s.hp >= d.maxHp && s.sp >= d.maxSp) {
      endFieldRest(s, c);
      s.status = 'hunting'; delete s.restMode;
      s.nextEncounterAt = at + encounterDelay(s, s.areaId, 1000);
    }
    return;
  }
  if (s.status === "resting" || s.status === "town") {
    if (!classicBuffActive(s, c, 'ST_CHASEWALK', at) && !soloRecoveryBlocked(s, c, at) && !playerRecoveryBlocked(s, c, at) && Math.floor(at / 1000) !== Math.floor((at - elapsedMs) / 1000)) {
      s.hp = Math.min(d.maxHp, s.hp + Math.max(1, Math.ceil(d.maxHp / 30)));
      s.sp = Math.min(d.maxSp, s.sp + Math.max(1, Math.ceil(d.maxSp / 30)));
    }
    if (s.status === "resting" && s.restUntil > 0 && at >= s.restUntil) {
      healFull(s, c);
      s.restUntil = 0;
      s.status = s.restMode === "field" && s.areaId ? "resting" : "town";
      if (overweightForCombat(s, c)) s.autoResume = false;
      if (s.autoResume && s.areaId) {
        s.status = "hunting";
        s.restMode = undefined;
        s.nextEncounterAt = at + encounterDelay(s, s.areaId, 1000);
      }
    }
    return;
  }
  if (s.status !== "hunting" && s.status !== "challenge") return;
  if (!replayingCombat) {
    autoPotion(s, c, at);
    if (!diseaseTiming) recoverResources(s, c, at, elapsedMs);
  }
  if (!s.battle) {
    if (s.status === "challenge") {
      s.status = "town";
      return;
    }
    if (at < s.nextEncounterAt) return;
    const area = c.areas.find((a) => a.id === s.areaId);
    if (!area?.monsters.length) {
      s.status = "town";
      return;
    }
    beginBattle(s, c, chooseAreaMonster(s, c, area, random(s)), at, undefined, context);
    if (!s.battle) return;
  }
  const b = s.battle!,
    list = enemies(s);
  for (const e of list) {
    rememberEnemyFacing(e, undefined, at);
    if (e.fieldSlot !== undefined) continue;
    if(e.npcCombat?.targetReleasedAt!==undefined&&monsterAttackTarget(s,e)!==s.id)continue;
    e.hostile ??= !!b.challengeId || (c.monsters[e.monsterId].aggressive ?? false);
    if (!e.homePosition || battleDistance(battleHeroAt(s, at), e.homePosition) > 1) {
      const angle = (e.spawnDirection * 45 - 90) * Math.PI / 180;
      e.homePosition = {
        x: battleHeroAt(s, at).x + Math.cos(angle) * 0.9 / BATTLE_CELLS_PER_UNIT,
        y: battleHeroAt(s, at).y + Math.sin(angle) * 0.9 / BATTLE_CELLS_PER_UNIT,
      };
    }
    const immobilized = c.monsters[e.monsterId].canMove === false || enemyWalkBlocked(c, e, at);
    if (e.approachPausedAt !== undefined || at < e.arrivedAt) {
      if (immobilized) e.approachPausedAt ??= Math.max(e.startedAt, at - elapsedMs);
      else if (e.approachPausedAt !== undefined) {
        const pausedMs = Math.max(0, at - e.approachPausedAt);
        e.startedAt += pausedMs;
        e.arrivedAt += pausedMs;
        delete e.approachPausedAt;
      }
    }
    if (!immobilized && e.arrivedAt <= at && e.homePosition) {
      const dx = e.homePosition.x - e.position.x,
        dy = e.homePosition.y - e.position.y,
        distance = Math.hypot(dx, dy);
      if (distance > 0) {
        const step = Math.min(distance, elapsedMs / 1000 / 12);
        e.position.x += (dx / distance) * step;
        e.position.y += (dy / distance) * step;
      }
    }
  }
  runCombatTimeline(s, c, at, Math.max(b.startedAt, at - elapsedMs), context);
  if (replayingCombat) {
    // These automations retain the 250 ms outer cadence. Their end-window
    // HP/SP mutations cannot rescue or fund an earlier combat deadline.
    maintainPlayerBuffs(s, c, at);
    if (s.status === "hunting" || s.status === "challenge") {
      autoPotion(s, c, at);
      if (!diseaseTiming) recoverResources(s, c, at, elapsedMs);
    }
  }
  if (s.battle) syncBattle(s);
}
