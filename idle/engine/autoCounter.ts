/** Hercules 410b9738: map.c:2928..2988 / battle.c:6867..6877. GPL-3.0-or-later. */
type Point = { x: number; y: number };
const directions: Point[] = [
  { x: 0, y: 1 }, { x: -1, y: 1 }, { x: -1, y: 0 }, { x: -1, y: -1 },
  { x: 0, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 0 }, { x: 1, y: 1 },
];

/** Integer source cells, including map_calc_dir's asymmetric +1 boundary. */
export function sourceFacing(dx: number, dy: number, previous: Point = directions[0]): Point {
  let index: number;
  if (!dx && !dy) return { ...previous };
  if (dx >= 0 && dy >= 0) index = dx * 2 < dy || !dx ? 0 : dx > dy * 2 + 1 || !dy ? 6 : 7;
  else if (dx >= 0 && dy <= 0) index = dx * 2 < -dy || !dx ? 4 : dx > -dy * 2 + 1 || !dy ? 6 : 5;
  else if (dx <= 0 && dy <= 0) index = dx * 2 > dy || !dx ? 4 : dx < dy * 2 + 1 || !dy ? 2 : 3;
  else index = -dx * 2 < dy || !dx ? 0 : -dx > dy * 2 + 1 || !dy ? 2 : 1;
  return { ...directions[index] };
}

export function autoCounterBlocks(input: { defender: Point; attacker: Point; facing: Point; weaponRange: number }) {
  const dx = input.attacker.x - input.defender.x, dy = input.attacker.y - input.defender.y;
  const distance = Math.max(Math.abs(dx), Math.abs(dy));
  if (!distance) return true;
  if (distance > input.weaponRange + 1) return false;
  const target = sourceFacing(dx, dy), from = directions.findIndex(d => d.x === input.facing.x && d.y === input.facing.y);
  const to = directions.findIndex(d => d.x === target.x && d.y === target.y);
  const difference = (to - from + 8) % 8;
  return from >= 0 && (difference === 0 || difference === 1 || difference === 7);
}
