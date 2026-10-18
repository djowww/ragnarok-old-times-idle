import {reconcileArrowCraft} from './arrowCraft.js';
import {reconcileWeaponRefine} from './weaponRefine.js';
import {reconcileWeaponRepair} from './weaponRepair.js';
import {reconcileFalcon} from './falcon.js';
import type {
  Catalog,
  GameCommand,
  GameSnapshot,
  GameState,
} from "../shared/types.js";
import { addItem, emptySummary, event, requireRule } from "./state.js";
import { availableClasses, derivedStats, healFull } from "./stats.js";
import { tick } from "./combat.js";
import { executeCommand } from "./commands.js";
import { updateQuests } from "./progression.js";
import { pruneAreaActivity, recordAreaActivity, reconcileHuntFocus } from "../shared/hunt.js";
import { clearStaleSenseInspection } from './senseInspection.js';
import { bladeStopRules } from './bladeStop.js';
import { assertSimulationNavigation, type SimulationContext } from './fieldNavigation.js';
import { migrateFieldNavigationState } from './fieldNavigationMigration.js';
export { GameError } from "./state.js";
/** Reconcile only the explicitly removed skills, without resetting progression. */
function reconcileRemovedSkills(s: GameState, c: Catalog) {
  const merchant = c.classes[s.job]?.family === "merchant";
  const removed = (id: string) => {
    const source = (c.skills[id]?.sourceName ?? id).toUpperCase();
    return source.startsWith("WE_") || (source === "ALL_INCCARRY" && !merchant);
  };
  for (const [id, level] of Object.entries(s.learnedSkills)) {
    if (!removed(id)) continue;
    // These skills cost one point per level. Return previously spent points once.
    if (Number.isSafeInteger(level) && level > 0) s.skillPoints += level;
    delete s.learnedSkills[id];
  }
  s.rotation = s.rotation.filter(id => !removed(id));
  if (s.rotationByArea) {
    const validAreaIds = new Set(c.areas.map(area => area.id));
    for (const [areaId, ids] of Object.entries(s.rotationByArea)) {
      if (!validAreaIds.has(areaId)) delete s.rotationByArea[areaId];
      else s.rotationByArea[areaId] = ids.filter(id => !removed(id));
    }
  }
  for (const id of Object.keys(s.skillReadyAt)) {
    if (removed(id)) delete s.skillReadyAt[id];
  }
}
export function createInitialState(
  catalog: Catalog,
  now: number,
  name = "djow",
): GameState {
  requireRule(
    Number.isFinite(now) && now >= 0,
    "INVALID_TIME",
    "Relógio inválido.",
  );
  requireRule(
    catalog.classes.novice,
    "INVALID_CATALOG",
    "Catálogo sem Aprendiz.",
  );
  const firstAid = catalog.classes.novice.skills.find(
    (id) => catalog.skills[id]?.kind === "heal",
  );
  const s: GameState = {
    schemaVersion: 1,
    id: "local-idle",
    revision: 0,
    name: name.trim().slice(0, 24) || "djow",
    gender: "male",
    appearance: { hairStyle: 0, hairColor: 0, clothesColor: 0 },
    job: "novice",
    falconEquipped: false,
    family: null,
    branch: null,
    reborn: false,
    baseLevel: 1,
    jobLevel: 1,
    baseExp: 0,
    jobExp: 0,
    zeny: 200,
    hp: 1,
    sp: 1,
    stats: { str: 1, agi: 1, vit: 1, int: 1, dex: 1, luk: 1 },
    statPoints: 20,
    skillPoints: 0,
    learnedSkills: firstAid ? { [firstAid]: 1 } : {},
    rotation: firstAid ? [firstAid] : [],
    skillReadyAt: {},
    buffs: {},
    inventory: [],
    equipment: {},
    status: "town",
    areaId: null,
    battle: null,
    nextEncounterAt: now,
    restUntil: 0,
    pendingAreaId: null,
    huntFocus: {},
    areaActivity: {},
    autoPotion: { hpThreshold: 40, spThreshold: 20 },
    potionReadyAt: 0,
    autoResume: false,
    bestiary: {},
    visitedAreas: [],
    quests: {},
    challengeCooldowns: {},
    challengeAttempts: 0,
    challengeWins: {},
    rewardedAttempts: [],
    highestRefine: 0,
    lastSimulatedAt: now,
    lastSeenAt: now,
    rngState: 0x52414749,
    nextItemId: 1,
    nextEventId: 1,
    totals: emptySummary(),
    contactTotals: emptySummary(),
    offlineSummary: null,
    events: [],
  };
  s.equipment.weapon = addItem(s, catalog, 1201, 1).uid;
  s.equipment.armor = addItem(s, catalog, 2301, 1).uid;
  addItem(s, catalog, 501, 20);
  addItem(s, catalog, 505, 5);
  healFull(s, catalog);
  updateQuests(s, catalog);
  event(s, now, "welcome", "Bem-vindo a Rune-Midgard!");
  return s;
}
function* advanceStateSteps(
  state: GameState,
  catalog: Catalog,
  now: number,
  context?: SimulationContext,
): Generator<void, GameState, void> {
  requireRule(
    Number.isFinite(now) && now >= 0,
    "INVALID_TIME",
    "Relógio inválido.",
  );
  const s = structuredClone(state);
  migrateFieldNavigationState(s, s.status === 'paused' ? s.pausedAt ?? s.lastSimulatedAt : s.lastSimulatedAt, context);
  reconcileRemovedSkills(s, catalog);
  reconcileFalcon(s, catalog);
  reconcileWeaponRefine(s,catalog,now);
  reconcileWeaponRepair(s,catalog,now);
  reconcileArrowCraft(s,catalog,now);
  reconcileHuntFocus(s, catalog);
  if (s.status === "paused") return s;
  const limit = s.lastSeenAt + 12 * 3600000;
  const until = Math.min(now, limit);
  // Quarter-second steps resolve short classic casts and high ASPD attacks.
  // The persisted clock preserves partial steps across browser polls/restarts.
  while (s.lastSimulatedAt + 250 <= until) {
    // A fully recovered avatar in town has no combat deadlines to process.
    // Skip empty offline ticks while preserving the same persisted clock.
    if (s.status === "town" && !s.falconStrikes?.length && !s.supportCast && !s.elementalField && !s.groundPlacements?.length &&
      Object.keys(s.buffs).length === 0 && Object.keys(s.playerStatuses ?? {}).length === 0) {
      const stats = derivedStats(s, catalog);
      if (s.hp >= stats.maxHp && s.sp >= stats.maxSp) {
        const gap = Math.floor((until - s.lastSimulatedAt) / 250) * 250;
        s.lastSimulatedAt += gap;
        s.totals.elapsedMs += gap;
        break;
      }
    }
    const previousMinute = Math.floor(s.lastSimulatedAt / 60000);
    s.lastSimulatedAt += 250;
    s.totals.elapsedMs += 250;
    if (Math.floor(s.lastSimulatedAt / 60000) !== previousMinute)
      pruneAreaActivity(s, s.lastSimulatedAt);
    if (s.status === "hunting" && s.areaId)
      recordAreaActivity(s, s.areaId, s.lastSimulatedAt, { elapsedMs: 250 });
    tick(s, catalog, s.lastSimulatedAt, 250, context);
    reconcileWeaponRefine(s,catalog,s.lastSimulatedAt);
    reconcileWeaponRepair(s,catalog,s.lastSimulatedAt);
    reconcileArrowCraft(s,catalog,s.lastSimulatedAt);
    yield;
  }
  pruneAreaActivity(s, until);
  if (now >= limit) {
    s.pausedStatus = s.status;
    s.pausedAt = s.lastSimulatedAt;
    s.status = "paused";
    event(
      s,
      limit,
      "offline",
      "Limite offline de 12 horas atingido. Retome a caça para continuar.",
    );
  }
  updateQuests(s, catalog);
  return s;
}
export function advanceState(
  state: GameState,
  catalog: Catalog,
  now: number,
  context?: SimulationContext,
): GameState {
  assertSimulationNavigation(state, context);
  const steps = advanceStateSteps(state, catalog, now, context);
  let step = steps.next();
  while (!step.done) step = steps.next();
  clearStaleSenseInspection(step.value);
  return step.value;
}
export async function advanceStateCooperatively(
  state: GameState,
  catalog: Catalog,
  now: number,
  context?: SimulationContext,
): Promise<GameState> {
  assertSimulationNavigation(state, context);
  const steps = advanceStateSteps(state, catalog, now, context);
  let step = steps.next();
  let batch = 0;
  while (!step.done) {
    if (++batch >= 250) {
      batch = 0;
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    step = steps.next();
  }
  clearStaleSenseInspection(step.value);
  return step.value;
}
export function applyCommand(
  state: GameState,
  catalog: Catalog,
  command: GameCommand,
  now: number,
  context?: SimulationContext,
): GameState {
  const s = advanceState(state, catalog, now, context);
  // A player intention after an offline pause discards the capped gap permanently.
  if (s.status === "paused") {
    if (command.type !== "dismissOffline") {
      resumePausedState(s, now);
    }
  }
  if (command.type === 'startHunt') {
    assertSimulationNavigation({ status: 'hunting', areaId: command.areaId }, context);
    context?.navigation?.area(command.areaId);
  }
  executeCommand(s, catalog, command, now, context);
  clearStaleSenseInspection(s);
  return s;
}

/** The capped gap is discarded once; active timers retain their remaining time. */
function resumePausedState(s: GameState, now: number) {
  const gap = Math.max(0, now - (s.pausedAt ?? s.lastSimulatedAt));
  const shift = (at: number) => Number.isFinite(at) ? Math.min(Number.MAX_SAFE_INTEGER, at + gap) : at;
  const optional = (at: number | undefined) => at === undefined ? undefined : shift(at);
  s.playerCanActAt = optional(s.playerCanActAt);
  const shiftSkillOwnership = (ownership: { readyAt: number; previousReadyAt?: number } | undefined) => {
    if (ownership) { ownership.readyAt = shift(ownership.readyAt); ownership.previousReadyAt = optional(ownership.previousReadyAt); }
  };
  for (const strike of s.falconStrikes ?? []) {
    strike.launchedAt = shift(strike.launchedAt); strike.impactAt = shift(strike.impactAt);
  }
  s.nextEncounterAt = shift(s.nextEncounterAt);
  if (s.supportCast) {
    s.supportCast.startedAt = shift(s.supportCast.startedAt);
    s.supportCast.endsAt = shift(s.supportCast.endsAt);
    shiftSkillOwnership(s.supportCast.skillClockOwnership);
    if (s.supportCast.battleClockOwnership) {
      if (s.supportCast.battleClockOwnership.battleIdentity)
        s.supportCast.battleClockOwnership.battleIdentity.startedAt = shift(s.supportCast.battleClockOwnership.battleIdentity.startedAt);
      if (s.supportCast.battleClockOwnership.actionReadyAt !== undefined)
        s.supportCast.battleClockOwnership.actionReadyAt = shift(s.supportCast.battleClockOwnership.actionReadyAt);
      if (s.supportCast.battleClockOwnership.nextSkillAt !== undefined)
        s.supportCast.battleClockOwnership.nextSkillAt = shift(s.supportCast.battleClockOwnership.nextSkillAt);
      if (s.supportCast.battleClockOwnership.nextAttackAt !== undefined)
        s.supportCast.battleClockOwnership.nextAttackAt = shift(s.supportCast.battleClockOwnership.nextAttackAt);
      if (s.supportCast.battleClockOwnership.ownedActionReadyAt !== undefined)
        s.supportCast.battleClockOwnership.ownedActionReadyAt = shift(s.supportCast.battleClockOwnership.ownedActionReadyAt);
      if (s.supportCast.battleClockOwnership.ownedNextSkillAt !== undefined)
        s.supportCast.battleClockOwnership.ownedNextSkillAt = shift(s.supportCast.battleClockOwnership.ownedNextSkillAt);
    }
  }
  s.restUntil = s.restUntil > 0 ? shift(s.restUntil) : 0;
  s.potionReadyAt = shift(s.potionReadyAt);
  for (const id of Object.keys(s.skillReadyAt)) s.skillReadyAt[id] = shift(s.skillReadyAt[id]);
  if (s.elementalField) {
    s.elementalField.placedAt = shift(s.elementalField.placedAt);
    s.elementalField.expiresAt = shift(s.elementalField.expiresAt);
    for (const entry of Object.values(s.elementalField.occupants)) {
      entry.enteredAt = shift(entry.enteredAt);
      entry.statusExpiresAt = shift(entry.statusExpiresAt);
    }
  }
  for (const placement of s.groundPlacements ?? []) {
    placement.placedAt = shift(placement.placedAt);
    placement.expiresAt = shift(placement.expiresAt);
    placement.battleStartedAt = optional(placement.battleStartedAt);
    for (const cell of Object.keys(placement.cellExpiresAt ?? {}))
      placement.cellExpiresAt![cell] = shift(placement.cellExpiresAt![cell]);
  }
  for (const buff of Object.values(s.buffs)) {
    buff.expiresAt = shift(buff.expiresAt);
    buff.startsAt = optional(buff.startsAt);
  }
  for (const status of Object.values(s.playerStatuses ?? {})) {
    if (!status) continue;
    status.startsAt = shift(status.startsAt); status.expiresAt = shift(status.expiresAt);
    status.nextTickAt = optional(status.nextTickAt);
  }
  for (const id of Object.keys(s.combatEffects?.buffDrainAt ?? {}))
    s.combatEffects!.buffDrainAt![id] = shift(s.combatEffects!.buffDrainAt![id]);
  if (s.combatEffects?.combo) s.combatEffects.combo.expiresAt = shift(s.combatEffects.combo.expiresAt);
  if (s.combatEffects?.bladeStopWait) {
    const wait = s.combatEffects.bladeStopWait;
    const originalStart = wait.startsAt ?? wait.expiresAt - bladeStopRules(wait.level).waitMs;
    wait.startsAt = shift(originalStart);
    wait.expiresAt = shift(wait.expiresAt);
  }
  if (s.combatEffects?.bladeStopLink) s.combatEffects.bladeStopLink.expiresAt = shift(s.combatEffects.bladeStopLink.expiresAt);
  for (const ground of [s.combatEffects?.pneumaGround, s.combatEffects?.safetyWallGround, ...(s.combatEffects?.defensiveGrounds ?? [])])
    if (ground) ground.expiresAt = shift(ground.expiresAt);
  if (s.combatEffects?.endure) s.combatEffects.endure.expiresAt = shift(s.combatEffects.endure.expiresAt);
  if (s.combatEffects?.berserk) s.combatEffects.berserk.nextTickAt = shift(s.combatEffects.berserk.nextTickAt);
  if (s.combatEffects?.tensionRelax) s.combatEffects.tensionRelax.nextTickAt = shift(s.combatEffects.tensionRelax.nextTickAt);
  if (s.combatEffects?.regenBlockedUntil) s.combatEffects.regenBlockedUntil = shift(s.combatEffects.regenBlockedUntil);
  if (s.fieldHero) {
    s.fieldHero.startedAt = shift(s.fieldHero.startedAt);
    s.fieldHero.arrivedAt = shift(s.fieldHero.arrivedAt);
    s.fieldHero.moveBlockedUntil = optional(s.fieldHero.moveBlockedUntil);
  }
  // JSON saves can contain separate copies of a population enemy and combat enemy.
  const actors = new Set([...(s.fieldPopulation?.enemies ?? []), ...(s.battle?.enemies ?? [])]);
  for (const enemy of actors) {
    enemy.startedAt = shift(enemy.startedAt); enemy.arrivedAt = shift(enemy.arrivedAt);
    enemy.enemyNextAttackAt = shift(enemy.enemyNextAttackAt);
    enemy.approachPausedAt = optional(enemy.approachPausedAt);
    if (enemy.npcCombat) {
      enemy.npcCombat.targetReleasedAt=optional(enemy.npcCombat.targetReleasedAt);
      enemy.npcCombat.nextTargetCheckAt=optional(enemy.npcCombat.nextTargetCheckAt);
      enemy.npcCombat.nextWanderAt=optional(enemy.npcCombat.nextWanderAt);
      enemy.npcCombat.pendingAttackerAt=optional(enemy.npcCombat.pendingAttackerAt);
      for (const id of Object.keys(enemy.npcCombat.readyAt)) enemy.npcCombat.readyAt[Number(id)] = shift(enemy.npcCombat.readyAt[Number(id)]);
      for (const id of Object.keys(enemy.npcCombat.lastUsedAt ?? {})) enemy.npcCombat.lastUsedAt![Number(id)] = shift(enemy.npcCombat.lastUsedAt![Number(id)]);
      if (enemy.npcCombat.cast) { enemy.npcCombat.cast.startedAt = shift(enemy.npcCombat.cast.startedAt); enemy.npcCombat.cast.endsAt = shift(enemy.npcCombat.cast.endsAt);
        const ownership=enemy.npcCombat.cast.clockOwnership;
        if(ownership){ownership.attackReadyAt=shift(ownership.attackReadyAt);ownership.previousAttackReadyAt=shift(ownership.previousAttackReadyAt);}
      }
    }
    for (const status of Object.values(enemy.statuses ?? {})) {
      status.expiresAt = shift(status.expiresAt); status.startsAt = optional(status.startsAt);
      status.petrifiesAt = optional(status.petrifiesAt); status.nextTickAt = optional(status.nextTickAt);
    }
  }
  for (const respawn of s.fieldPopulation?.respawns ?? []) respawn.at = shift(respawn.at);
  if (s.battle) {
    const b = s.battle;
    b.startedAt = shift(b.startedAt); b.playerNextAttackAt = shift(b.playerNextAttackAt);
    b.playerNextSkillAt = optional(b.playerNextSkillAt); b.playerActionReadyAt = optional(b.playerActionReadyAt);
    b.enemyNextAttackAt = shift(b.enemyNextAttackAt); b.deadlineAt = optional(b.deadlineAt);
    b.fieldDecisionAt = optional(b.fieldDecisionAt);
    if (b.cast) { b.cast.startedAt = shift(b.cast.startedAt); b.cast.endsAt = shift(b.cast.endsAt);
      shiftSkillOwnership(b.cast.skillClockOwnership);
      const ownership=b.cast.clockOwnership;
      if(ownership) for(const key of Object.keys(ownership) as (keyof typeof ownership)[]) ownership[key]=optional(ownership[key]);
    }
    for (const ground of b.groundEffects ?? []) { ground.nextTickAt = shift(ground.nextTickAt); ground.expiresAt = shift(ground.expiresAt); }
    for (const unit of b.skillUnits ?? []) {
      unit.placedAt = shift(unit.placedAt); unit.nextTickAt = shift(unit.nextTickAt); unit.expiresAt = shift(unit.expiresAt);
      unit.nextSpDrainAt = optional(unit.nextSpDrainAt);
      for (const id of Object.keys(unit.targetTickAt ?? {})) unit.targetTickAt![id] = shift(unit.targetTickAt![id]);
    }
    for (const trap of b.traps ?? []) {
      trap.placedAt = shift(trap.placedAt); trap.nextTickAt = shift(trap.nextTickAt);
      trap.expiresAt = shift(trap.expiresAt); trap.triggeredAt = optional(trap.triggeredAt);
    }
    for (const delayed of b.delayedSkills ?? []) delayed.endsAt = shift(delayed.endsAt);
  }
  s.status = s.pausedStatus ?? (s.battle?.challengeId ? "challenge" : s.areaId ? "hunting" : "town");
  s.lastSimulatedAt = Math.max(s.lastSimulatedAt, now);
  delete s.pausedStatus; delete s.pausedAt;
}
export function getSnapshot(
  state: GameState,
  catalog: Catalog,
  now: number,
): GameSnapshot {
  const copy = structuredClone(state);
  reconcileFalcon(copy,catalog);
  updateQuests(copy, catalog);
  copy.pendingAreaId ??= null;
  copy.huntFocus ??= {};
  reconcileHuntFocus(copy, catalog);
  copy.areaActivity ??= {};
  pruneAreaActivity(copy, now);
  return {
    state: copy,
    stats: derivedStats(copy, catalog),
    serverTime: now,
    catalogVersion: catalog.version,
    availableClasses: availableClasses(copy, catalog),
    offlineSummary: structuredClone(copy.offlineSummary),
  };
}
