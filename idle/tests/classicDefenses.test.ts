import { describe, expect, it } from 'vitest';
import { createPneuma, pneumaBlocks, defenderDamage, defenderStats, toggleDefender, createEndure, endureHit, endureMdef, defenseHitMotion } from '../engine/classicDefenses';

describe('pinned pre-renewal defensive statuses', () => {
  it('anchors Pneuma to nine ground cells for ten seconds', () => {
    const p = createPneuma({ x: 5, y: 8 }, 100)!;
    expect(p.cells).toHaveLength(9);
    expect(pneumaBlocks(p, { x: 6, y: 9 }, 10099, { long: true, weapon: true })).toBe(true);
    expect(pneumaBlocks(p, { x: 7, y: 9 }, 101, { long: true, weapon: true })).toBe(false);
    expect(pneumaBlocks(p, { x: 5, y: 8 }, 10100, { long: true, weapon: true })).toBe(false);
    expect(pneumaBlocks(p, { x: 5, y: 8 }, 101, { long: true, magic: true })).toBe(false);
    expect(pneumaBlocks(p, { x: 5, y: 8 }, 101, { weapon: true })).toBe(false);
    expect(createPneuma({ x: 5, y: 8 }, 100, [{ x: 6, y: 8 }])).toBeUndefined();
  });
  it('uses integer ranged weapon damage and pre-renewal additive ASPD delay rate', () => {
    expect(defenderDamage(101, 5, { long: true, weapon: true })).toBe(20);
    expect(defenderDamage(101, 1, { long: true, weapon: true })).toBe(80);
    expect(defenderDamage(101, 5, { long: true, magic: true })).toBe(101);
    expect(defenderStats(1, 150, 900)).toEqual({ cellSpeedMs: 200, aspdRate: 1100 });
    expect(defenderStats(5, 250, 900)).toEqual({ cellSpeedMs: 250, aspdRate: 900 });
    const d = toggleDefender(undefined, 3, 100)!;
    expect(d).toEqual({ level: 3, expiresAt: 180100 });
    expect(toggleDefender(d, 3, 200)).toBeUndefined();
  });
  it('keeps Hercules seven counter charges and its strict negative termination', () => {
    let e = createEndure(10, 100)!;
    expect(e.expiresAt).toBe(37100);
    expect(endureMdef(e, 100)).toBe(10);
    expect(endureMdef(e, 37100)).toBe(0);
    expect(endureHit(e, 200, { damage: 0 })).toEqual(e);
    expect(endureHit(e, 200, { damage: 1, sourcePlayer: true })).toEqual(e);
    for (let i = 0; i < 7; i++) e = endureHit(e, 200, { damage: 1 })!;
    expect(e.charges).toBe(0);
    expect(endureHit(e, 200, { damage: 1 })).toBeUndefined();
    expect(defenseHitMotion(300, e, 200)).toBe(0);
    expect(defenseHitMotion(300, e, 37100)).toBe(300);
    expect(defenseHitMotion(300, undefined, 200, { targetBoss: true })).toBe(0);
    expect(defenseHitMotion(300, e, 200, { gvg: true })).toBe(300);
  });
});
