import type { GameState } from '../shared/types.js';

/** The active player cast, whether it targets an enemy or the player. */
export type CurrentPlayerCast = {
  kind: 'battle' | 'support';
  skillId: string;
  level: number;
  startedAt: number;
  endsAt: number;
  actionId?: string;
  targetId?: string;
  position?: { x: number; y: number };
};

/** Pure view shared by simulation, controls, and presentation. */
export function currentPlayerCast(s: GameState, at: number): CurrentPlayerCast | undefined {
  const battle = s.battle?.cast;
  if (battle && battle.startedAt <= at && at < battle.endsAt)
    return { kind: 'battle', skillId: battle.skillId, level: battle.level,
      startedAt: battle.startedAt, endsAt: battle.endsAt, actionId: battle.actionId,
      targetId: battle.targetId, position: battle.position };
  const support = s.supportCast;
  if (support && support.startedAt <= at && at < support.endsAt)
    return { kind: 'support', skillId: support.skillId, level: support.level,
      startedAt: support.startedAt, endsAt: support.endsAt, actionId: support.actionId };
  return undefined;
}
