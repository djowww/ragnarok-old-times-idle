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
import { pruneAreaActivity, recordAreaActivity } from "../shared/hunt.js";
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
): Generator<void, GameState, void> {
  requireRule(
    Number.isFinite(now) && now >= 0,
    "INVALID_TIME",
    "Relógio inválido.",
  );
  const s = structuredClone(state);
  reconcileRemovedSkills(s, catalog);
  if (s.status === "paused") return s;
  const limit = s.lastSeenAt + 12 * 3600000;
  const until = Math.min(now, limit);
  // Quarter-second steps resolve short classic casts and high ASPD attacks.
  // The persisted clock preserves partial steps across browser polls/restarts.
  while (s.lastSimulatedAt + 250 <= until) {
    // A fully recovered avatar in town has no combat deadlines to process.
    // Skip empty offline ticks while preserving the same persisted clock.
    if (s.status === "town" && Object.keys(s.buffs).length === 0) {
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
    tick(s, catalog, s.lastSimulatedAt, 250);
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
): GameState {
  const steps = advanceStateSteps(state, catalog, now);
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}
export async function advanceStateCooperatively(
  state: GameState,
  catalog: Catalog,
  now: number,
): Promise<GameState> {
  const steps = advanceStateSteps(state, catalog, now);
  let step = steps.next();
  let batch = 0;
  while (!step.done) {
    if (++batch >= 250) {
      batch = 0;
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    step = steps.next();
  }
  return step.value;
}
export function applyCommand(
  state: GameState,
  catalog: Catalog,
  command: GameCommand,
  now: number,
): GameState {
  const s = advanceState(state, catalog, now);
  // A player intention after an offline pause discards the capped gap permanently.
  if (s.status === "paused") {
    if (command.type !== "dismissOffline") {
      resumePausedState(s, now);
    }
  }
  executeCommand(s, catalog, command, now);
  return s;
}

/** The capped gap is discarded once; active timers retain their remaining time. */
function resumePausedState(s: GameState, now: number) {
  const gap = Math.max(0, now - (s.pausedAt ?? s.lastSimulatedAt));
  const shift = (at: number) => Number.isFinite(at) ? at + gap : at;
  const optional = (at: number | undefined) => at === undefined ? undefined : shift(at);
  s.nextEncounterAt = shift(s.nextEncounterAt);
  s.restUntil = s.restUntil > 0 ? shift(s.restUntil) : 0;
  s.potionReadyAt = shift(s.potionReadyAt);
  for (const id of Object.keys(s.skillReadyAt)) s.skillReadyAt[id] = shift(s.skillReadyAt[id]);
  for (const buff of Object.values(s.buffs)) buff.expiresAt = shift(buff.expiresAt);
  for (const id of Object.keys(s.combatEffects?.buffDrainAt ?? {}))
    s.combatEffects!.buffDrainAt![id] = shift(s.combatEffects!.buffDrainAt![id]);
  if (s.combatEffects?.combo) s.combatEffects.combo.expiresAt = shift(s.combatEffects.combo.expiresAt);
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
    if (b.cast) { b.cast.startedAt = shift(b.cast.startedAt); b.cast.endsAt = shift(b.cast.endsAt); }
    for (const ground of b.groundEffects ?? []) { ground.nextTickAt = shift(ground.nextTickAt); ground.expiresAt = shift(ground.expiresAt); }
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
  updateQuests(copy, catalog);
  copy.pendingAreaId ??= null;
  copy.huntFocus ??= {};
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
