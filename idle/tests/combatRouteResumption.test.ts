import { describe, expect, it } from 'vitest';
import { advanceGridRouteProgress, nearestGridRouteProgress } from '../web/assets/mapProjection';
import { gridRoutePoint } from '../shared/fieldNavigation';

describe('combat route resumption', () => {
  const bend = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }];

  it('resumes at rendered route progress and follows source bends at source speed', () => {
    const closest = nearestGridRouteProgress(bend, { x: 0.5, y: 0 });
    expect(closest.progress).toBeCloseTo(1 / 6);
    expect(closest.distance).toBeCloseTo(0);
    const resumed = advanceGridRouteProgress(closest.progress, 1, 250, 1_000);
    expect(resumed).toBeCloseTo(5 / 12);
    expect(gridRoutePoint(bend, resumed)).toMatchObject({ x: 1, y: 0.25 });
  });

  it('does not advance while the scene clock is paused and follows a changed target from the shared point', () => {
    const changedTarget = [{ x: 1, y: 0.25 }, { x: 1, y: 1 }, { x: 2, y: 1 }];
    const closest = nearestGridRouteProgress(changedTarget, { x: 1, y: 0.25 });
    expect(closest.progress).toBe(0);
    expect(advanceGridRouteProgress(closest.progress, 1, 0, 1_000)).toBe(0);
    const resumed = advanceGridRouteProgress(closest.progress, 1, 200, 1_000);
    expect(gridRoutePoint(changedTarget, resumed).x).toBeCloseTo(1);
    expect(gridRoutePoint(changedTarget, resumed).y).toBeCloseTo(0.6);
  });
});
