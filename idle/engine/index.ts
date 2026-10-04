import type { Catalog, GameCommand, GameSnapshot, GameState } from '../shared/types.js';
import { addItem, emptySummary, event, requireRule } from './state.js';
import { availableClasses, derivedStats, healFull } from './stats.js';
import { tick } from './combat.js';
import { executeCommand } from './commands.js';
import { updateQuests } from './progression.js';
import { pruneAreaActivity, recordAreaActivity } from '../shared/hunt.js';
export { GameError } from './state.js';
export function createInitialState(catalog: Catalog, now: number, name = 'Aventureiro'): GameState {
  requireRule(Number.isFinite(now) && now >= 0, 'INVALID_TIME', 'Relógio inválido.'); requireRule(catalog.classes.novice, 'INVALID_CATALOG', 'Catálogo sem Aprendiz.');
  const firstAid = catalog.classes.novice.skills.find(id => catalog.skills[id]?.kind === 'heal');
  const s: GameState = {
    schemaVersion: 1, id: 'local-idle', revision: 0, name: name.trim().slice(0, 24) || 'Aventureiro', gender: 'male', job: 'novice', family: null, branch: null, reborn: false,
    baseLevel: 1, jobLevel: 1, baseExp: 0, jobExp: 0, zeny: 200, hp: 1, sp: 1,
    stats: { str: 1, agi: 1, vit: 1, int: 1, dex: 1, luk: 1 }, statPoints: 20, skillPoints: 0,
    learnedSkills: firstAid ? { [firstAid]: 1 } : {}, rotation: firstAid ? [firstAid] : [], skillReadyAt: {}, buffs: {}, inventory: [], equipment: {},
    status: 'town', areaId: null, battle: null, nextEncounterAt: now, restUntil: 0,
    pendingAreaId: null, huntFocus: {}, areaActivity: {},
    autoPotion: { hpThreshold: 40, spThreshold: 20 }, potionReadyAt: 0, autoResume: false,
    bestiary: {}, visitedAreas: [], quests: {}, challengeCooldowns: {}, challengeAttempts: 0, challengeWins: {}, rewardedAttempts: [], highestRefine: 0,
    lastSimulatedAt: now, lastSeenAt: now, rngState: 0x52414749, nextItemId: 1, nextEventId: 1,
    totals: emptySummary(), contactTotals: emptySummary(), offlineSummary: null, events: [],
  };
  s.equipment.weapon = addItem(s, catalog, 1201, 1).uid; s.equipment.armor = addItem(s, catalog, 2301, 1).uid;
  addItem(s, catalog, 501, 20); addItem(s, catalog, 505, 5); healFull(s, catalog); updateQuests(s, catalog); event(s, now, 'welcome', 'Bem-vindo a Rune-Midgard!'); return s;
}
export function advanceState(state: GameState, catalog: Catalog, now: number): GameState {
  requireRule(Number.isFinite(now) && now >= 0, 'INVALID_TIME', 'Relógio inválido.'); const s = structuredClone(state);
  if (s.status === 'paused') return s;
  const limit = s.lastSeenAt + 12 * 3600000;
  const until = Math.min(now, limit);
  while (s.lastSimulatedAt + 1000 <= until) {
    const previousMinute = Math.floor(s.lastSimulatedAt / 60000);
    s.lastSimulatedAt += 1000; s.totals.elapsedMs += 1000;
    if (Math.floor(s.lastSimulatedAt / 60000) !== previousMinute) pruneAreaActivity(s, s.lastSimulatedAt);
    if (s.status === 'hunting' && s.areaId) recordAreaActivity(s, s.areaId, s.lastSimulatedAt, { elapsedMs: 1000 });
    tick(s, catalog, s.lastSimulatedAt);
  }
  pruneAreaActivity(s, until);
  if (now >= limit) { s.status = 'paused'; event(s, limit, 'offline', 'Limite offline de 12 horas atingido. Retome a caça para continuar.'); }
  updateQuests(s, catalog); return s;
}
export function applyCommand(state: GameState, catalog: Catalog, command: GameCommand, now: number): GameState {
  const s = advanceState(state, catalog, now);
  // A player intention after an offline pause discards the capped gap permanently.
  if (s.status === 'paused') { s.lastSimulatedAt = Math.max(s.lastSimulatedAt, now); if (command.type !== 'dismissOffline') { s.status = 'town'; s.battle = null; s.pendingAreaId = null; } }
  executeCommand(s, catalog, command, now); return s;
}
export function getSnapshot(state: GameState, catalog: Catalog, now: number): GameSnapshot {
  const copy = structuredClone(state); updateQuests(copy, catalog);
  copy.pendingAreaId ??= null; copy.huntFocus ??= {}; copy.areaActivity ??= {}; pruneAreaActivity(copy, now);
  return { state: copy, stats: derivedStats(copy, catalog), serverTime: now, catalogVersion: catalog.version, availableClasses: availableClasses(copy, catalog), offlineSummary: structuredClone(copy.offlineSummary) };
}
