import type { BattlePoint } from '../shared/battleSpatial.js';
import { groundCell, cellPoint, groundCovers } from './groundSolo.js';

export const SLOW_GRACE_DURATION_MS = 180_000;
export const SLOW_GRACE_INTERVAL_MS = 3_000;
export const SLOW_GRACE_OUTSIDE_MS = 20_000;
export const SLOW_GRACE_SP_DRAIN_MS = 10_000;

/** skill.c:13567, status.c:5859. The source adds 10x this value to ASPD rate,
 * which translates to the same percent increase in monster attack interval. */
export function slowGraceValues(level: number, dex: number, agi: number, dancingLesson: number) {
  return {
    attackDelayPct: Math.trunc(dex / 10) + 3 * level + 5 + dancingLesson,
    moveSlowPct: Math.trunc(agi / 10) + 3 * level + 5 + dancingLesson,
  };
}

/** skill.c:21416-21422, Layout 3 is a centered 7-by-7 cell square. */
export function slowGraceCells(center: BattlePoint): BattlePoint[] {
  const origin = groundCell(center), cells: BattlePoint[] = [];
  for (let dy = -3; dy <= 3; dy++)
    for (let dx = -3; dx <= 3; dx++)
      cells.push(cellPoint({ x: origin.x + dx, y: origin.y + dy }));
  return cells;
}

export function slowGraceCovers(cells: BattlePoint[], point: BattlePoint) {
  return groundCovers(cells, point, 0);
}

export function resolveSlowGraceDrain(nextAt: number, expiresAt: number, at: number, sp: number) {
  if (at < nextAt || at >= expiresAt)
    return { due: false, nextAt, cost: 0, end: false };
  if (sp < 1)
    return { due: true, nextAt, cost: 0, end: true };
  return { due: true, nextAt: nextAt + SLOW_GRACE_SP_DRAIN_MS, cost: 1, end: false };
}
