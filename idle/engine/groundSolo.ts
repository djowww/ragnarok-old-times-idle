/** Hercules pre-re ground-unit rules, commit 410b9738c049ab1825d67b36b072d837c1d0b33a.
 * skill.c:13946,14460,15085,21466; battle.c:431. GPL-3.0-or-later.
 * Idle persists these source clocks across reconnects (Hercules Spider Web is NoSave).
 */
import type { BattlePoint } from '../shared/battleSpatial.js';
import { BATTLE_CELLS_PER_UNIT } from '../shared/battleSpatial.js';
export const groundCell = (p: BattlePoint) => ({ x: Math.floor(p.x * BATTLE_CELLS_PER_UNIT), y: Math.floor(p.y * BATTLE_CELLS_PER_UNIT) });
export const cellPoint = (p: BattlePoint) => ({ x: (p.x + .5) / BATTLE_CELLS_PER_UNIT, y: (p.y + .5) / BATTLE_CELLS_PER_UNIT });
export function venomDustCells(center: BattlePoint): BattlePoint[] {
  const cell = groundCell(center);
  return [[-1, 0], [0, -1], [0, 0], [0, 1], [1, 0]].map(([x, y]) => cellPoint({ x: cell.x + x, y: cell.y + y }));
}
export function groundCovers(cells: BattlePoint[], point: BattlePoint, range: number) {
  const target = groundCell(point);
  return cells.some(p => { const cell = groundCell(p); return Math.max(Math.abs(cell.x - target.x), Math.abs(cell.y - target.y)) <= range; });
}
export interface SpiderWebStatus {
  level: number; startsAt: number; expiresAt: number; groundId: string; webCharges: number; webHeld: boolean;
}
export function captureSpiderWeb(current: SpiderWebStatus | undefined, id: string, at: number): SpiderWebStatus {
  if (current && current.expiresAt > at && current.webHeld)
    return { ...current, webCharges: current.webCharges + 1 };
  return { level: 1, startsAt: at, expiresAt: at + 8000, groundId: id, webCharges: 1, webHeld: true };
}
export function spiderWebFire(current: SpiderWebStatus | undefined, element: string, at: number) {
  if (!current || current.expiresAt <= at || element !== 'fire') return { multiplier: 1, status: current };
  const charges = current.webCharges - 1;
  return { multiplier: current.webCharges > 0 ? 2 : 1,
    status: charges > 0 ? { ...current, webHeld: false, webCharges: charges } : undefined };
}
/** Exact next departure from this logical cell during the saved straight segment.
 * Adds at most 1 ms for the negative-direction boundary, whose floor is inclusive.
 */
export function groundDepartureAt(from: BattlePoint, to: BattlePoint, startedAt: number, arrivedAt: number,
  cell: BattlePoint, at: number): number | undefined {
  if (arrivedAt <= at || arrivedAt <= startedAt) return;
  const c = groundCell(cell), candidates: number[] = [];
  for (const axis of ['x', 'y'] as const) {
    const delta = to[axis] - from[axis];
    if (!delta || groundCell(to)[axis] === c[axis]) continue;
    const boundary = (c[axis] + (delta > 0 ? 1 : 0)) / BATTLE_CELLS_PER_UNIT;
    const t = Math.ceil(startedAt + (boundary - from[axis]) / delta * (arrivedAt - startedAt)) + (delta < 0 ? 1 : 0);
    if (t > at && t <= arrivedAt) candidates.push(t);
  }
  return candidates.length ? Math.min(...candidates) : undefined;
}
