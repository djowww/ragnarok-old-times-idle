import type { Catalog, GameState, Skill } from '../shared/types.js';
import { cancelClassicBuff, classicBuffActive } from './classicBuffs.js';
import { event } from './state.js';

export const TRICK_DEAD_SOURCE = 'NV_TRICKDEAD';
export const TRICK_DEAD_EXPIRY = Number.MAX_SAFE_INTEGER;

export function trickDeadActive(s: GameState, c: Catalog, at: number): boolean {
  return classicBuffActive(s, c, TRICK_DEAD_SOURCE, at);
}

export function applyTrickDead(s: GameState, c: Catalog, skill: Skill, level: number, at: number): void {
  cancelClassicBuff(s, c, TRICK_DEAD_SOURCE);
  s.buffs[skill.id] = { startsAt: at, expiresAt: TRICK_DEAD_EXPIRY, effects: {} };
  ((s.combatEffects ??= {}).buffLevels ??= {})[skill.id] = level;
}

export function clearTrickDead(s: GameState, c: Catalog, at?: number): void {
  const id = Object.keys(s.buffs).find(skillId =>
    (c.skills[skillId]?.sourceName ?? c.skills[skillId]?.mechanic ?? skillId).toUpperCase() === TRICK_DEAD_SOURCE);
  cancelClassicBuff(s, c, TRICK_DEAD_SOURCE);
  if (id && at !== undefined && Number.isFinite(at)) {
    event(s, at, 'posture-ended', c.skills[id]?.name ?? 'Play Dead', undefined, 'player', {
      skillId: id, statusName: TRICK_DEAD_SOURCE, sourceActorId: s.id, targetActorId: s.id, actorAction: 'none',
    });
  }
}
