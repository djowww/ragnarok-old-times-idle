/** Hercules 410b9738c049ab1825d67b36b072d837c1d0b33a:
 * skill.c:17857..18012, unit.c:66..67, battle.c:2145..2156.
 * GPL-3.0-or-later.
 */
export type BrandishFlag = 1 | 2 | 3 | 4;
export type BrandishBattleCell = { x: number; y: number };
export type BrandishCell = BrandishBattleCell & { flag: BrandishFlag };

// Source NORTH is (0,+1). Diagonal first rows are literal source offsets,
// including NORTHWEST's unequal spacing; do not derive them by rotation.
const firstRows: Record<string, readonly (readonly [number, number])[]> = {
  '0,1': [[-2, -1], [-1, -1], [0, -1], [1, -1], [2, -1]],
  '-1,1': [[-1, -4], [0, -3], [1, -1], [2, 0], [3, 1]],
  '-1,0': [[1, 2], [1, 1], [1, 0], [1, -1], [1, -2]],
  '-1,-1': [[3, -1], [2, 0], [1, 1], [0, 2], [-1, 3]],
  '0,-1': [[-2, 1], [-1, 1], [0, 1], [1, 1], [2, 1]],
  '1,-1': [[1, 3], [0, 2], [-1, 1], [-2, 0], [-3, -1]],
  '1,0': [[-1, 2], [-1, 1], [-1, 0], [-1, -1], [-1, -2]],
  '1,1': [[-3, 1], [-2, 0], [-1, -1], [0, -2], [1, -3]],
};

/** Target integer source cell, eight-way source facing offset, learned level 1..10.
 * Returns one attack entry per cell in Hercules traversal order.
 */
export function brandishCells(target: BrandishBattleCell, facing: BrandishBattleCell, level: number): BrandishCell[] {
  const first = firstRows[`${facing.x},${facing.y}`];
  const cells: BrandishCell[] = [];
  const row = (distance: number, flag: BrandishFlag, start = 0, end = 5) => {
    for (let index = start; index < end; index++) {
      const [x, y] = first[index];
      cells.push({ x: target.x + x + facing.x * distance, y: target.y + y + facing.y * distance, flag });
    }
  };
  if (level > 9) row(4, 4, 1, 4);
  if (level > 6) row(3, 3);
  if (level > 3) row(2, 2);
  row(1, 1);
  row(0, 1);
  return cells;
}

/** Physical skill ratio in percent; each positive C integer division truncates independently. */
export function brandishRatio(level: number, flag: BrandishFlag): number {
  const base = 100 + 20 * level;
  let ratio = base;
  if (flag === 1 && level > 3) ratio += Math.trunc(base / 2);
  if (flag === 1 && level > 6) ratio += Math.trunc(base / 4);
  if (flag === 1 && level > 9) ratio += Math.trunc(base / 8);
  if (flag === 2 && level > 6) ratio += Math.trunc(base / 2);
  if (flag === 2 && level > 9) ratio += Math.trunc(base / 4);
  if (flag === 3 && level > 9) ratio += Math.trunc(base / 2);
  return ratio;
}
