/** Hercules410b9738 unit.c1856/1996/2542/2679, skill.c6612/6729/12156; GPL-3.0-or-later. */
import type { Catalog, GameState, Skill, SkillClockOwnership } from '../shared/types.js';
import { derivedStats } from './stats.js';

/** Actor canact survives encounter replacement; animation and AFK polling do not write it. */
export function beginSkillAction(s: GameState, at: number, castMs: number, motionMs: number): SkillClockOwnership {
  const previousReadyAt = s.playerCanActAt;
  const readyAt = at + Math.max(castMs, motionMs, 100);
  s.playerCanActAt = readyAt;
  return { readyAt, ...(previousReadyAt !== undefined && { previousReadyAt }) };
}
export function finishSkillAction(s: GameState, at: number, delayMs: number): void {
  s.playerCanActAt = Math.max(s.playerCanActAt ?? at, at + delayMs);
}
export function cancelSkillAction(s: GameState, ownership: SkillClockOwnership | undefined, at: number): void {
  if (ownership && s.playerCanActAt === ownership.readyAt)
    s.playerCanActAt = Math.max(at, ownership.previousReadyAt ?? at);
}
export function sourceAfterCastDelay(s: GameState, c: Catalog, skill: Skill, level: number): number {
  const stats = derivedStats(s, c), source = skill.afterCastDelayMs?.[level - 1] ?? skill.afterCastDelayMs?.at(-1) ?? 0;
  let delay = source < 0 ? -source + stats.attackMotionMs : source;
  if (['MO_TRIPLEATTACK','MO_CHAINCOMBO','MO_COMBOFINISH','CH_TIGERFIST','CH_CHAINCRUSH'].includes(skill.sourceName ?? ''))
    delay -= 4 * (stats.attributes?.agi ?? s.stats.agi) + 2 * (stats.attributes?.dex ?? s.stats.dex);
  return Math.max(0, Math.floor(delay * (1 - Math.min(100, stats.effects.afterCastReductionPct ?? 0) / 100)));
}

/** Resolution owns payment/effects; source delay is committed only after a valid cast-end. */
export function resolveOwnSkillAction(s: GameState, c: Catalog, cast: NonNullable<GameState['supportCast']>, at: number,
  resolve: () => boolean | undefined): boolean {
  const succeeded = resolve() === true, skill = c.skills[cast.skillId];
  if (succeeded && skill) finishSkillAction(s, at, sourceAfterCastDelay(s, c, skill, cast.level));
  else if ((skill?.afterCastDelayMs?.[cast.level - 1] ?? skill?.afterCastDelayMs?.at(-1) ?? 0) !== 0)
    cancelSkillAction(s, cast.skillClockOwnership, at);
  return succeeded;
}
