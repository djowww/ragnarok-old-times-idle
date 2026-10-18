import type { BattlePoint } from '../shared/battleSpatial.js';
import type { FieldNavigationRuntime } from './fieldNavigation.js';

/** Active noicewall flags in Hercules' pinned npc/mapflag/noicewall.txt. */
export const ICE_WALL_RESTRICTED_MAPS = new Set([
  ...['aldeg', 'gefg', 'payg', 'prtg', 'schg', 'arug'].flatMap(prefix =>
    Array.from({ length: 5 }, (_, index) => `${prefix}_cas0${index + 1}`)),
  'nguild_alde', 'nguild_gef', 'nguild_pay', 'nguild_prt', 'poring_w01', 'poring_w02',
]);

/** Hercules builds five directional cells centered on the selected ground tile. */
export function iceWallFootprint(hero: { x: number; y: number }, target: { x: number; y: number }) {
  const dx = target.x - hero.x, dy = target.y - hero.y;
  const ax = Math.abs(dx), ay = Math.abs(dy);
  const offsets = ax > ay * (1 + Math.SQRT2) ?
    [-2, -1, 0, 1, 2].map(value => ({ x: value / 12, y: 0 })) :
    ay > ax * (1 + Math.SQRT2) ?
      [-2, -1, 0, 1, 2].map(value => ({ x: 0, y: value / 12 })) :
      [-2, -1, 0, 1, 2].map(value => ({ x: value / 12, y: (dx * dy < 0 ? -value : value) / 12 }));
  return offsets.map(offset => ({ x: target.x + offset.x, y: target.y + offset.y }));
}

export function activeIceWallCells(
  navigation: FieldNavigationRuntime,
  areaId: string,
  units: readonly { skillId: string; expiresAt: number; cells: BattlePoint[] }[],
  sourceNames: Readonly<Record<string, { sourceName?: string } | undefined>>,
  at: number,
): Set<string> {
  const blocked = new Set<string>();
  for (const unit of units) {
    if (unit.expiresAt <= at || sourceNames[unit.skillId]?.sourceName !== 'WZ_ICEWALL') continue;
    for (const cell of unit.cells) {
      const grid = navigation.toGridPoint(areaId, cell);
      blocked.add(`${Math.floor(grid.x)},${Math.floor(grid.y)}`);
    }
  }
  return blocked;
}
