import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const patch = readFileSync(new URL('../../docker/web-client/mapviewer-idle.patch', import.meta.url), 'utf8');

function addedFileSource(path: string): string {
  const start = patch.indexOf(`diff --git a/${path} b/${path}`);
  if (start < 0) throw new Error(`Missing patch section for ${path}`);
  const end = patch.indexOf('\ndiff --git ', start + 1);
  const section = patch.slice(start, end < 0 ? undefined : end);
  const hunk = section.match(/@@ -0,0 \+\d+,\d+ @@\r?\n([\s\S]*)/);
  if (!hunk) throw new Error(`Missing added source for ${path}`);
  return hunk[1].split(/\r?\n/).filter(line => line.startsWith('+')).map(line => line.slice(1)).join('\n')
    .replace(/^import .*;\s*$/gm, '').replace(/^export default .*;\s*$/m, '');
}

function bridge(width: number, height: number) {
  const outgoing: any[] = [];
  const gl: any = new Proxy({ isContextLost: () => false }, {
    get: (target, key) => key in target ? target[key as keyof typeof target] : (() => undefined),
  });
  const source = addedFileSource('src/Renderer/IdleActors.js');
  const api = runInNewContext(`${source}\n({ receive, acceptedActorIds: () => actors.map(actor => actor.id), isMapWorldInBounds })`, {
    Uint8ClampedArray, performance, window: { parent: { postMessage: (data: unknown) => outgoing.push(data) } },
    Altitude: { width, height }, Ground: {}, WebGL: {}, SpriteRenderer: {},
  }) as { receive: Function; acceptedActorIds: () => string[]; isMapWorldInBounds: (world: number[]) => boolean };
  const glContext = gl;
  const map = 'fixture', session = '00000000-0000-0000-0000-000000000001', parentOrigin = 'https://fixture';
  const send = (data: Record<string, unknown>) => api.receive({ map, session, ...data }, parentOrigin, map, glContext);
  send({ type: 'ragidle-map-actors-init' });
  const drawActors = (sequence: number, positions: Array<{ id: string; world: number[] }>) => {
    const actors = positions.map(({ id, world }) => ({ id, poseToken: `pose-${id}`, world,
      layers: [{ frame: 'f1', x: 0, y: 0, width: 1, height: 1, angle: 0, color: [1, 1, 1, 1] }] }));
    send({ type: 'ragidle-map-actors', sequence, actors });
    return api.acceptedActorIds();
  };
  return { drawActors, isMapWorldInBounds: api.isMapWorldInBounds };
}

function followMessage(width: number, height: number) {
  const baseSpot = [10, 10, 0];
  const scope: any = {
    Altitude: { width, height }, idleSceneBaseSpot: baseSpot, idleSceneFollowWorld: null, idleSceneFollowTick: 0, idleSceneName: 'fixture',
    window: { parent: {}, location: { origin: 'https://fixture' } }, document: { referrer: 'https://fixture/game' },
    IdleActors: { receive: () => false, isMapWorldInBounds: bridge(width, height).isMapWorldInBounds }, Renderer: { getContext: () => ({}) },
    MapViewer: { spot: { position: [0, 0, 0] } },
    URL, Number, Math,
  };
  const mapViewerSection = patch.slice(0, patch.indexOf('diff --git a/src/Renderer/IdleActors.js'));
  const additions = mapViewerSection.split(/\r?\n/).filter(line => line.startsWith('+')).map(line => line.slice(1)).join('\n');
  const start = additions.indexOf('function idleSceneFollowMessage(event) {');
  const end = additions.indexOf('\nfunction idleSceneFollow(tick)', start);
  const cameraEnd = additions.indexOf('\nfunction idleSceneCameraZoom()', end);
  if (start < 0 || end < 0 || cameraEnd < 0) throw new Error('Missing MapViewer follow handlers in patch');
  const handler = additions.slice(start, end);
  const follow = additions.slice(end, cameraEnd);
  runInNewContext(`${handler}\n${follow}\nthis.dispatch = data => idleSceneFollowMessage({ source: window.parent, origin: 'https://fixture', data });\nthis.follow = () => idleSceneFollowWorld;\nthis.advance = tick => idleSceneFollow(tick);\nthis.cameraPosition = () => MapViewer.spot.position;`, scope);
  return scope as { dispatch: (data: unknown) => void; follow: () => number[] | null; advance: (tick: number) => void; cameraPosition: () => number[] };
}

describe('native map bounds use the loaded GAT extent', () => {
  it('keeps valid authoritative actor positions more than 24 cells from the map origin', () => {
    const viewer = bridge(400, 400);
    expect(viewer.drawActors(1, [{ id: 'patrol', world: [160.1, 0, 160.1] }])).toContain('patrol');
  });

  it('rejects actor positions outside GAT coordinates while accepting both edges of the first cell', () => {
    const viewer = bridge(400, 400);
    expect(viewer.drawActors(1, [
      { id: 'left-edge', world: [0, 0, 0.1] },
      { id: 'inside-first-cell', world: [0.1, 0, 0.1] },
      { id: 'inside-last-cell', world: [399.999, 0, 399.999] },
      { id: 'negative', world: [-0.01, 0, 0.1] },
      { id: 'past-width', world: [400, 0, 0.1] },
      { id: 'non-finite', world: [Number.NaN, 0, 0.1] },
    ])).toEqual(['left-edge', 'inside-first-cell', 'inside-last-cell']);
  });

  it('rejects native actors until valid GAT dimensions are available', () => {
    const viewer = bridge(0, 0);
    expect(viewer.drawActors(1, [{ id: 'before-map-load', world: [0.1, 0, 0.1] }])).toEqual([]);
    expect(bridge(400.5, 400).drawActors(1, [{ id: 'invalid-width', world: [0.1, 0, 0.1] }])).toEqual([]);
  });

  it('follows valid points across the loaded map while preserving camera half-cell conversion', () => {
    const viewer = followMessage(400, 400);
    viewer.dispatch({ type: 'ragidle-map-follow', map: 'fixture', world: [160.1, 7, 161.1] });
    expect(viewer.follow()).toEqual([160.1, 7, 161.1]);
    viewer.advance(16);
    const amount = 1 - Math.exp(-16 / 140);
    const [x, y, height] = viewer.cameraPosition();
    expect(x).toBeCloseTo(159.6 * amount, 10);
    expect(y).toBeCloseTo(160.6 * amount, 10);
    expect(height).toBeCloseTo(-7 * amount, 10);
  });

  it('does not follow non-finite or out-of-map coordinates', () => {
    for (const world of [[-0.01, 0, 0.1], [400, 0, 0.1], [0.1, 0, 400], [Number.NaN, 0, 0.1]]) {
      const viewer = followMessage(400, 400);
      viewer.dispatch({ type: 'ragidle-map-follow', map: 'fixture', world });
      expect(viewer.follow()).toBeNull();
    }
  });

  it('does not follow before positive integer GAT dimensions are ready', () => {
    const viewer = followMessage(0, 0);
    viewer.dispatch({ type: 'ragidle-map-follow', map: 'fixture', world: [0.1, 0, 0.1] });
    expect(viewer.follow()).toBeNull();
  });
});
