import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { BATTLE_CELLS_PER_UNIT, BATTLE_HERO } from '../shared/battleSpatial';
import { gridRoutePoint } from '../shared/fieldNavigation';
import { advanceGridRouteProgress, battleRouteTangent, nearestGridRouteProgress, projectBattlePoint } from '../web/assets/mapProjection';

const scene = readFileSync(new URL('../web/components/Scene.tsx', import.meta.url), 'utf8');
const start = scene.indexOf('      let fieldHeroPoint =');
const end = scene.indexOf('      const heroMovement =', start);
if (start < 0 || end < 0) throw new Error('Scene field route seam not found');
const source = scene.slice(start, end);
const sceneRoute = new Function('scope', `with (scope) { ${ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText} return { fieldHeroPoint, fieldHeroWorld, fieldHeroTangent, renderedHeroRoute: renderedHeroRoute.current }; }`);

const camera = { focus: [0, 0, 0] as [number, number, number], modelView: [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1], projection: [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1] } as any;
const origin = { x: 0, y: 0 };
const route = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }];
function frame(options: { map?: string; area?: string; now: number; time: number; status?: string; strike?: unknown; backslide?: { x: number; y: number }; route?: typeof route; ref?: { current: any } } ) {
  const movementRoute = options.route ?? route;
  const current: any = { areaId: options.area ?? 'field', status: options.status ?? 'hunting', fieldHero: {
    from: movementRoute[0], position: movementRoute.at(-1), movementRoute,
    startedAt: 0, arrivedAt: 1000,
  } };
  const renderedHeroRoute = options.ref ?? { current: null };
  const scope = {
    fieldPopulation: true, current, backslidingPoint: options.backslide, battleHeroAt: () => movementRoute[0], serverNow: options.now,
    time: options.time, strikePose: options.strike, mapName: options.map ?? 'prontera', renderedHeroRoute,
    renderedHeroGround: { current: null }, BATTLE_HERO, BATTLE_CELLS_PER_UNIT, FIELD_SCENE_ORIGIN: { x: 0, y: 0 },
    gridRoutePoint, advanceGridRouteProgress, nearestGridRouteProgress,
    camera, fieldOrigin: origin, projectBattlePoint, battleRouteTangent,
  };
  return sceneRoute(scope) as { fieldHeroPoint: { x: number; y: number }; fieldHeroWorld: number[]; fieldHeroTangent: number[]; renderedHeroRoute: any };
}

describe('actual Scene route presentation seam', () => {
  it('keeps route point and tangent aligned and freezes source progress during swings and pauses', () => {
    const initial = frame({ now: 0, time: 0 });
    const first = frame({ now: 500, time: 500, ref: { current: initial.renderedHeroRoute } });
    expect(first.fieldHeroPoint).toEqual({ x: 1, y: 0.5 });
    const swinging = frame({ now: 700, time: 700, strike: {}, ref: { current: first.renderedHeroRoute } });
    expect(swinging.fieldHeroPoint).toEqual({ x: 1, y: 0.5 });
    expect(swinging.fieldHeroTangent).toEqual(first.fieldHeroTangent);
    const paused = frame({ now: 900, time: 900, status: 'paused', ref: { current: swinging.renderedHeroRoute } });
    expect(paused.fieldHeroPoint).toEqual({ x: 1, y: 0.5 });
  });

  it('retargets from the previous rendered bend and resets route anchors on map changes', () => {
    const initial = frame({ now: 0, time: 0 });
    const first = frame({ now: 500, time: 500, ref: { current: initial.renderedHeroRoute } });
    const retarget = [{ x: 1, y: 0.5 }, { x: 2, y: 0.5 }, { x: 2, y: 1 }];
    const changed = frame({ now: 500, time: 600, route: retarget, ref: { current: first.renderedHeroRoute } });
    expect(changed.fieldHeroPoint).toEqual({ x: 1, y: 0.5 });
    const resumed = frame({ now: 700, time: 800, route: retarget, ref: { current: changed.renderedHeroRoute } });
    expect(resumed.fieldHeroPoint.x).toBeCloseTo(1.3);
    expect(resumed.fieldHeroPoint.y).toBeCloseTo(0.5);
    const reset = frame({ map: 'payon', now: 700, time: 900, route: retarget, ref: { current: resumed.renderedHeroRoute } });
    expect(reset.fieldHeroPoint).toEqual(retarget[0]);
  });

  it('does not let a Backsliding point be overwritten by the field route', () => {
    const point = { x: 0.3, y: 0.4 };
    const result = frame({ now: 500, time: 500, backslide: point });
    expect(result.fieldHeroPoint).toEqual(point);
  });
});
