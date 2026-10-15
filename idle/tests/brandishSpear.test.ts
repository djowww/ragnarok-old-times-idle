import { describe, expect, it } from 'vitest';
import { brandishCells, brandishRatio } from '../engine/brandishSpear';

// Independent literal offsets transcribed from skill.c:17857..18012. Each row
// retains source foreachincell order; a rotated rectangle loses the NW gap.
type Row = { flag: 1 | 2 | 3 | 4; points: [number, number][] };
const shapes: { name: string; facing: { x: number; y: number }; rows: Row[] }[] = [
  { name: 'north', facing: { x: 0, y: 1 }, rows: [
    { flag: 4, points: [[-1,3],[0,3],[1,3]] },
    { flag: 3, points: [[-2,2],[-1,2],[0,2],[1,2],[2,2]] },
    { flag: 2, points: [[-2,1],[-1,1],[0,1],[1,1],[2,1]] },
    { flag: 1, points: [[-2,0],[-1,0],[0,0],[1,0],[2,0],[-2,-1],[-1,-1],[0,-1],[1,-1],[2,-1]] },
  ] },
  { name: 'northwest', facing: { x: -1, y: 1 }, rows: [
    { flag: 4, points: [[-4,1],[-3,3],[-2,4]] },
    { flag: 3, points: [[-4,-1],[-3,0],[-2,2],[-1,3],[0,4]] },
    { flag: 2, points: [[-3,-2],[-2,-1],[-1,1],[0,2],[1,3]] },
    { flag: 1, points: [[-2,-3],[-1,-2],[0,0],[1,1],[2,2],[-1,-4],[0,-3],[1,-1],[2,0],[3,1]] },
  ] },
  { name: 'west', facing: { x: -1, y: 0 }, rows: [
    { flag: 4, points: [[-3,1],[-3,0],[-3,-1]] },
    { flag: 3, points: [[-2,2],[-2,1],[-2,0],[-2,-1],[-2,-2]] },
    { flag: 2, points: [[-1,2],[-1,1],[-1,0],[-1,-1],[-1,-2]] },
    { flag: 1, points: [[0,2],[0,1],[0,0],[0,-1],[0,-2],[1,2],[1,1],[1,0],[1,-1],[1,-2]] },
  ] },
  { name: 'southwest', facing: { x: -1, y: -1 }, rows: [
    { flag: 4, points: [[-2,-4],[-3,-3],[-4,-2]] },
    { flag: 3, points: [[0,-4],[-1,-3],[-2,-2],[-3,-1],[-4,0]] },
    { flag: 2, points: [[1,-3],[0,-2],[-1,-1],[-2,0],[-3,1]] },
    { flag: 1, points: [[2,-2],[1,-1],[0,0],[-1,1],[-2,2],[3,-1],[2,0],[1,1],[0,2],[-1,3]] },
  ] },
  { name: 'south', facing: { x: 0, y: -1 }, rows: [
    { flag: 4, points: [[-1,-3],[0,-3],[1,-3]] },
    { flag: 3, points: [[-2,-2],[-1,-2],[0,-2],[1,-2],[2,-2]] },
    { flag: 2, points: [[-2,-1],[-1,-1],[0,-1],[1,-1],[2,-1]] },
    { flag: 1, points: [[-2,0],[-1,0],[0,0],[1,0],[2,0],[-2,1],[-1,1],[0,1],[1,1],[2,1]] },
  ] },
  { name: 'southeast', facing: { x: 1, y: -1 }, rows: [
    { flag: 4, points: [[4,-2],[3,-3],[2,-4]] },
    { flag: 3, points: [[4,0],[3,-1],[2,-2],[1,-3],[0,-4]] },
    { flag: 2, points: [[3,1],[2,0],[1,-1],[0,-2],[-1,-3]] },
    { flag: 1, points: [[2,2],[1,1],[0,0],[-1,-1],[-2,-2],[1,3],[0,2],[-1,1],[-2,0],[-3,-1]] },
  ] },
  { name: 'east', facing: { x: 1, y: 0 }, rows: [
    { flag: 4, points: [[3,1],[3,0],[3,-1]] },
    { flag: 3, points: [[2,2],[2,1],[2,0],[2,-1],[2,-2]] },
    { flag: 2, points: [[1,2],[1,1],[1,0],[1,-1],[1,-2]] },
    { flag: 1, points: [[0,2],[0,1],[0,0],[0,-1],[0,-2],[-1,2],[-1,1],[-1,0],[-1,-1],[-1,-2]] },
  ] },
  { name: 'northeast', facing: { x: 1, y: 1 }, rows: [
    { flag: 4, points: [[2,4],[3,3],[4,2]] },
    { flag: 3, points: [[0,4],[1,3],[2,2],[3,1],[4,0]] },
    { flag: 2, points: [[-1,3],[0,2],[1,1],[2,0],[3,-1]] },
    { flag: 1, points: [[-2,2],[-1,1],[0,0],[1,-1],[2,-2],[-3,1],[-2,0],[-1,-1],[0,-2],[1,-3]] },
  ] },
];

describe('Brandish Spear source cells', () => {
  // Catches incorrect direction lookup, diagonal symmetry, tier boundaries,
  // row shifting, traversal order, flag assignment, and repeated cell attacks.
  for (const shape of shapes) {
    for (const tier of [
      { levels: [1, 2, 3], maxFlag: 1, count: 10 },
      { levels: [4, 5, 6], maxFlag: 2, count: 15 },
      { levels: [7, 8, 9], maxFlag: 3, count: 20 },
      { levels: [10], maxFlag: 4, count: 23 },
    ]) {
      for (const level of tier.levels) {
        it(`uses literal ${shape.name} cell shape at level ${level}`, () => {
          const cells = brandishCells({ x: 0, y: 0 }, shape.facing, level);
          const want = shape.rows.filter(row => row.flag <= tier.maxFlag)
            .flatMap(row => row.points.map(([x, y]) => ({ x, y, flag: row.flag })));
          expect(cells).toEqual(want);
          expect(cells).toHaveLength(tier.count);
          expect(new Set(cells.map(cell => `${cell.x},${cell.y}`)).size).toBe(tier.count);
        });
      }
    }
  }

  it('anchors offsets to the target integer cell without mutating inputs', () => {
    const target = { x: 18, y: -12 }, facing = { x: 0, y: 1 };
    expect(brandishCells(target, facing, 1)).toEqual([
      { x: 16, y: -12, flag: 1 }, { x: 17, y: -12, flag: 1 }, { x: 18, y: -12, flag: 1 },
      { x: 19, y: -12, flag: 1 }, { x: 20, y: -12, flag: 1 },
      { x: 16, y: -13, flag: 1 }, { x: 17, y: -13, flag: 1 }, { x: 18, y: -13, flag: 1 },
      { x: 19, y: -13, flag: 1 }, { x: 20, y: -13, flag: 1 },
    ]);
    expect(target).toEqual({ x: 18, y: -12 });
    expect(facing).toEqual({ x: 0, y: 1 });
  });
});

describe('Brandish Spear source damage ratio', () => {
  // Literal ratios catch strongest-flag reuse, wrong level thresholds, and
  // rounding the combined fraction instead of each C integer division.
  for (const [level, ratios] of [
    [1, [120, 120, 120, 120]], [2, [140, 140, 140, 140]], [3, [160, 160, 160, 160]],
    [4, [270, 180, 180, 180]], [5, [300, 200, 200, 200]], [6, [330, 220, 220, 220]],
    [7, [420, 360, 240, 240]], [8, [455, 390, 260, 260]], [9, [490, 420, 280, 280]],
    [10, [562, 525, 450, 300]],
  ] as const) {
    for (const flag of [1, 2, 3, 4] as const) {
      it(`uses ${ratios[flag - 1]} percent for level ${level} flag ${flag}`, () => {
        expect(brandishRatio(level, flag)).toBe(ratios[flag - 1]);
      });
    }
  }
});
