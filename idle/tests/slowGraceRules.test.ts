import { describe, expect, it } from 'vitest';
import { BATTLE_CELLS_PER_UNIT } from '../shared/battleSpatial.js';
import { resolveSlowGraceDrain, slowGraceCells, slowGraceCovers, slowGraceValues } from '../engine/slowGraceRules.js';

function tile(center: { x: number; y: number }, dx: number, dy = 0) {
  const x = Math.floor(center.x * BATTLE_CELLS_PER_UNIT) + dx;
  const y = Math.floor(center.y * BATTLE_CELLS_PER_UNIT) + dy;
  return { x: (x + 0.5) / BATTLE_CELLS_PER_UNIT, y: (y + 0.5) / BATTLE_CELLS_PER_UNIT };
}

describe('Slow Grace source rules', () => {
  it('derives ASPD and movement slow from DEX, AGI, skill level and Dance Lessons', () => {
    expect(slowGraceValues(5, 75, 66, 2)).toEqual({ attackDelayPct: 29, moveSlowPct: 28 });
    expect(slowGraceValues(1, 9, 9, 0)).toEqual({ attackDelayPct: 8, moveSlowPct: 8 });
    expect(slowGraceValues(10, 99, 99, 10)).toEqual({ attackDelayPct: 54, moveSlowPct: 54 });
  });

  it('creates the exact centered 7x7 source layout and includes only its cells', () => {
    const center = { x: 0.5, y: 0.5 };
    const cells = slowGraceCells(center);
    expect(cells).toHaveLength(49);
    expect(slowGraceCovers(cells, tile(center, -3, 3))).toBe(true);
    expect(slowGraceCovers(cells, tile(center, 3, -3))).toBe(true);
    expect(slowGraceCovers(cells, tile(center, 4))).toBe(false);
    expect(slowGraceCovers(cells, { x: 9.999 / BATTLE_CELLS_PER_UNIT, y: 6.5 / BATTLE_CELLS_PER_UNIT })).toBe(true);
    expect(slowGraceCovers(cells, { x: 10 / BATTLE_CELLS_PER_UNIT, y: 6.5 / BATTLE_CELLS_PER_UNIT })).toBe(false);
  });

  it('drains one SP at each 10-second source deadline and ends when that charge fails', () => {
    expect(resolveSlowGraceDrain(10_000, 180_000, 9_999, 4)).toEqual({ due: false, nextAt: 10_000, cost: 0, end: false });
    expect(resolveSlowGraceDrain(10_000, 180_000, 10_000, 4)).toEqual({ due: true, nextAt: 20_000, cost: 1, end: false });
    expect(resolveSlowGraceDrain(20_000, 180_000, 20_000, 0)).toEqual({ due: true, nextAt: 20_000, cost: 0, end: true });
    expect(resolveSlowGraceDrain(180_000, 180_000, 180_000, 4)).toEqual({ due: false, nextAt: 180_000, cost: 0, end: false });
  });
});
