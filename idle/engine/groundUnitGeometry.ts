import type { GridPoint } from '../shared/fieldNavigation.js';

export interface GroundShape { cells: GridPoint[]; range: number; pathCheck: boolean }
type Layout = { radius: number; range?: number; pathCheck?: boolean };
// Hercules410b9738 db/pre-re/skill_db.conf; omitted Layout/Range are zero.
const squares: Record<string, Layout> = {
  MG_SAFETYWALL: { radius: 0 }, AL_PNEUMA: { radius: 1 }, PF_SPIDERWEB: { radius: 0 },
  WZ_HEAVENDRIVE: { radius: 2, pathCheck: true }, WZ_QUAGMIRE: { radius: 2, pathCheck: true },
  HW_GRAVITATION: { radius: 2 }, WZ_VERMILION: { radius: 5, range: 1, pathCheck: true },
  SA_VOLCANO: { radius: 3, pathCheck: true }, SA_DELUGE: { radius: 3, pathCheck: true },
  SA_VIOLENTGALE: { radius: 3, pathCheck: true },
  BA_DISSONANCE: { radius: 3 }, BA_WHISTLE: { radius: 3 }, BA_ASSASSINCROSS: { radius: 3 },
  BA_POEMBRAGI: { radius: 3 }, BA_APPLEIDUN: { radius: 3 }, DC_HUMMING: { radius: 3 },
  DC_DONTFORGETME: { radius: 3 }, DC_FORTUNEKISS: { radius: 3 }, DC_SERVICEFORYOU: { radius: 3 },
  MG_THUNDERSTORM: { radius: 0, range: 2, pathCheck: true }, AC_SHOWER: { radius: 0, range: 2 },
  WZ_FIREPILLAR: { radius: 0, range: 1 }, WZ_METEOR: { radius: 0, range: 3, pathCheck: true },
  WZ_STORMGUST: { radius: 4, range: 1, pathCheck: true }, AM_DEMONSTRATION: { radius: 0, range: 1 },
  HT_SKIDTRAP: { radius: 0, range: 1 }, HT_LANDMINE: { radius: 0, range: 1 }, HT_ANKLESNARE: { radius: 0, range: 1 },
  HT_SANDMAN: { radius: 0, range: 1 }, HT_FLASHER: { radius: 0, range: 1 }, HT_FREEZINGTRAP: { radius: 0, range: 1 },
  HT_SHOCKWAVE: { radius: 0, range: 1 },
  HT_BLASTMINE: { radius: 0, range: 1 }, HT_CLAYMORETRAP: { radius: 0, range: 1 },
};
const valid = (p: GridPoint) => Number.isSafeInteger(p.x) && Number.isSafeInteger(p.y);

/** path.c121..182 weighted Bresenham; candidate to group center, no corner veto. */
export function sourceGroundPath(from: GridPoint, to: GridPoint, clear: (p: GridPoint) => boolean): boolean {
  let x = from.x, y = from.y, tx = to.x, ty = to.y, dx = tx - x;
  if (dx < 0) { [x, tx] = [tx, x]; [y, ty] = [ty, y]; dx = -dx; }
  const dy = ty - y, weight = Math.max(dx, Math.abs(dy));
  let wx = 0, wy = 0;
  while (x !== tx || y !== ty) {
    wx += dx; wy += dy;
    if (wx >= weight) { wx -= weight; x++; }
    if (wy >= weight) { wy -= weight; y++; }
    else if (wy < 0) { wy += weight; y--; }
    if (!clear({ x, y })) return false;
  }
  return true;
}

/** map.c map_calc_dir: the asymmetric +1 thresholds are intentional. */
function sourceDirection(from: GridPoint, to: GridPoint): number {
  const dx = to.x - from.x, dy = to.y - from.y;
  if (dx >= 0 && dy >= 0) {
    if (dx * 2 < dy || dx === 0) return dy === 0 ? 6 : 0;
    return dx > dy * 2 + 1 || dy === 0 ? 6 : 7;
  }
  if (dx >= 0 && dy <= 0) {
    if (dx * 2 < -dy || dx === 0) return 4;
    return dx > -dy * 2 + 1 || dy === 0 ? 6 : 5;
  }
  if (dx <= 0 && dy <= 0) {
    if (dx * 2 > dy || dx === 0) return 4;
    return dx < dy * 2 + 1 || dy === 0 ? 2 : 3;
  }
  if (-dx * 2 < dy || dx === 0) return 0;
  return -dx > dy * 2 + 1 || dy === 0 ? 2 : 1;
}

/** skill.c21465..21519,21589..21619: fixed cells, never radius approximations. */
export function sourceGroundShape(source: string, center: GridPoint, caster: GridPoint = center): GroundShape | undefined {
  if (!valid(center) || !valid(caster)) return undefined;
  let offsets: readonly (readonly [number, number])[], range = 0, pathCheck = false;
  const square = squares[source];
  if (square) {
    const cells: GridPoint[] = [];
    for (let y = -square.radius; y <= square.radius; y++) for (let x = -square.radius; x <= square.radius; x++)
      cells.push({ x: center.x + x, y: center.y + y });
    return { cells, range: square.range ?? 0, pathCheck: square.pathCheck ?? false };
  }
  if (source === 'MG_FIREWALL') {
    const direction = sourceDirection(caster, center); pathCheck = true;
    offsets = direction & 1 ? direction & 2 ? [[-1, 1], [-1, 0], [0, 0], [0, -1], [1, -1]] :
      [[1, 1], [1, 0], [0, 0], [0, -1], [-1, -1]] : direction % 4 === 0 ?
      [[-1, 0], [0, 0], [1, 0]] : [[0, -1], [0, 0], [0, 1]];
  } else if (source === 'PF_FOGWALL') {
    offsets = [-1, 0, 1].flatMap(y => [-2, -1, 0, 1, 2].map(x => [x, y] as const));
  } else if (source === 'CR_GRANDCROSS') {
    const dx = [0, 0, -1, 0, 1, -2, -1, 0, 1, 2, -4, -3, -2, -1, 0, 1, 2, 3, 4, -2, -1, 0, 1, 2, -1, 0, 1, 0, 0];
    const dy = [-4, -3, -2, -2, -2, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 2, 2, 2, 3, 4];
    offsets = dx.map((x, i) => [x, dy[i]] as const); pathCheck = true;
  } else if (source === 'AS_VENOMDUST') {
    offsets = [[-1, 0], [0, -1], [0, 0], [0, 1], [1, 0]]; range = 1;
  } else if (source === 'PR_SANCTUARY') {
    const dx = [-1,0,1,-2,-1,0,1,2,-2,-1,0,1,2,-2,-1,0,1,2,-1,0,1];
    const dy = [-2,-2,-2,-1,-1,-1,-1,-1,0,0,0,0,0,1,1,1,1,1,2,2,2];
    offsets = dx.map((x,i) => [x,dy[i]] as const); range = 1; pathCheck = true;
  } else if (source === 'PR_MAGNUS') {
    const dx = [-1,0,1,-1,0,1,-3,-2,-1,0,1,2,3,-3,-2,-1,0,1,2,3,-3,-2,-1,0,1,2,3,-1,0,1,-1,0,1];
    const dy = [-3,-3,-3,-2,-2,-2,-1,-1,-1,-1,-1,-1,-1,0,0,0,0,0,0,0,1,1,1,1,1,1,1,2,2,2,3,3,3];
    offsets = dx.map((x,i) => [x,dy[i]] as const); range = 1; pathCheck = true;
  } else return undefined;
  return { cells: offsets.map(([x, y]) => ({ x: center.x + x, y: center.y + y })), range, pathCheck };
}
