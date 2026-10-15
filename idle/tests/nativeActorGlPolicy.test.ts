import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NativeActorsBridge } from '../web/assets/nativeActors';
afterEach(() => vi.restoreAllMocks());

// Exercise the shipped patch, with only the external GL/renderer/clock boundary replaced.
const patch = readFileSync(new URL('../../docker/web-client/mapviewer-idle.patch', import.meta.url), 'utf8');
const section = patch.split('diff --git a/src/Renderer/IdleActors.js')[1].split('\ndiff --git ')[0];
const source = section.split('\n').filter(line => line.startsWith('+') && !line.startsWith('+++'))
  .map(line => line.slice(1)).join('\n').split('export default')[0].replace(/^import .*;$/gm, '');
const session = '00000000-0000-0000-0000-000000000001';
const frame = (id: string, width = 1, height = 1) => ({ id, width, height, rgba: new Uint8ClampedArray(width * height * 4) });
const pose = (ids = ['f1']) => ({ id: 'hero', poseToken: ids.join(','), world: [.5, 0, .5],
  layers: ids.map(id => ({ frame: id, x: 0, y: 0, width: 1, height: 1, angle: 0, color: [1, 1, 1, 1] })) });

function fixture(sessionId = session, forward?: (message: any) => void) {
  let now = 0, lost = false, serial = 0, timerId = 0, sequence = 0;
  const messages: any[] = [], calls: any[][] = [], allocated: object[] = [], deleted: object[] = [];
  const timers = new Map<number, { callback: () => void; at: number }>();
  const listeners = new Map<string, Set<() => void>>();
  const stores = new Map<any, any>([['flip', true], ['premultiply', true]]);
  const gl: any = {
    NO_ERROR: 0, INVALID_OPERATION: 1282, UNPACK_FLIP_Y_WEBGL: 'flip', UNPACK_PREMULTIPLY_ALPHA_WEBGL: 'premultiply',
    TEXTURE0: 'texture0', TEXTURE_2D: 'texture2d', ARRAY_BUFFER: 'array', DEPTH_TEST: 'depth', BLEND: 'blend',
    SRC_ALPHA: 'alpha', ONE_MINUS_SRC_ALPHA: 'inverse',
    canvas: { addEventListener: (name: string, callback: () => void) => {
      if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name)!.add(callback);
    }, removeEventListener: (name: string, callback: () => void) => listeners.get(name)?.delete(callback) },
    isContextLost: () => lost,
    getError: () => { calls.push(['getError', now]); return 0; },
    getParameter: (key: string) => stores.get(key),
    pixelStorei: (key: string, value: boolean) => { calls.push(['pixelStorei', key, value]); stores.set(key, value); },
    createTexture: () => { const texture = { texture: ++serial }; allocated.push(texture); return texture; },
    deleteTexture: (texture: object) => { deleted.push(texture); calls.push(['deleteTexture', texture]); },
  };
  for (const name of ['activeTexture', 'bindTexture', 'texImage2D', 'texParameteri', 'enable', 'depthMask',
    'blendFunc', 'colorMask', 'bindBuffer', 'useProgram', 'disableVertexAttribArray', 'deleteProgram', 'deleteBuffer']) {
    gl[name] = (...args: any[]) => calls.push([name, ...args]);
  }
  const sprite: any = { image: {}, bind3DContext: () => {}, unbind: () => calls.push(['unbind']),
    runWithDepth: (_a: any, _b: any, _c: any, action: () => void) => action(), render: () => calls.push(['draw']) };
  for (const name of ['position', 'offset', 'size', 'color']) sprite[name] = { set: () => {} };
  const api = runInNewContext(source + '\n({receive, render, release})', {
    Uint8ClampedArray, performance: { now: () => now },
    setTimeout: (callback: () => void, delay: number) => { const id = ++timerId; timers.set(id, { callback, at: now + delay }); return id; },
    clearTimeout: (id: number) => timers.delete(id),
    window: { parent: { postMessage: (data: any) => { messages.push(data); calls.push(['message', data.type]); forward?.(data); } } },
    Altitude: { width: 400, height: 400 }, Ground: { getShadowFactor: () => 1 }, WebGL: {}, SpriteRenderer: sprite,
  });
  const receive = (data: any) => api.receive({ map: 'fixture', session: sessionId, ...data }, 'https://fixture', 'fixture', gl);
  const render = () => api.render(now, gl, [], [], {});
  const sendPose = (ids = ['f1']) => receive({ type: 'ragidle-map-actors', sequence: ++sequence, actors: [pose(ids)] });
  const upload = (frames: any[]) => receive({ type: 'ragidle-map-actor-frames', frames });
  const fireDue = () => { for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.callback(); } };
  receive({ type: 'ragidle-map-actors-init' });
  return { api, gl, sprite, messages, calls, allocated, deleted, stores, timers, listeners, receive, render, sendPose, upload, fireDue,
    at: (value: number) => { now = value; }, lose: () => { lost = true; },
    event: () => { for (const callback of [...listeners.get('webglcontextlost') ?? []]) callback(); },
    acks: () => messages.filter(m => m.type === 'ragidle-map-actors-rendered'),
    errors: () => messages.filter(m => m.type === 'ragidle-map-actors-error'),
    checks: () => calls.filter(c => c[0] === 'getError'),
  };
}

function expectReleased(f: ReturnType<typeof fixture>) {
  expect(f.errors()).toHaveLength(1);
  expect(f.deleted).toEqual(f.allocated);
  expect(f.stores.get('flip')).toBe(true);
  expect(f.stores.get('premultiply')).toBe(true);
  expect(f.sprite.image).toEqual({ texture: null, palette: null });
  expect(f.sprite.sprite).toBeNull();
  expect(f.calls).toContainEqual(['depthMask', true]);
  expect(f.calls).toContainEqual(['colorMask', true, true, true, true]);
  expect(f.calls).toContainEqual(['useProgram', null]);
  expect(f.calls).toContainEqual(['enable', 'depth']);
  expect(f.calls).toContainEqual(['enable', 'blend']);
  expect(f.calls).toContainEqual(['blendFunc', 'alpha', 'inverse']);
  expect(f.calls).toContainEqual(['activeTexture', 'texture0']);
  expect(f.calls).toContainEqual(['bindTexture', 'texture2d', null]);
  expect(f.calls).toContainEqual(['bindBuffer', 'array', null]);
  expect(f.sprite).toMatchObject({ depth: 0, shadow: 1, zIndex: 1, disableDepthCorrection: false });
  const before = f.acks().length;
  f.render();
  expect(f.acks()).toHaveLength(before);
}

describe('native upload batch validation', () => {
  it('keeps the complete renderer source inside its declared patch hunk', () => {
    const hunk = section.match(/^@@ -0,0 \+1,(\d+) @@/m);
    const addedSourceLines = section.split('\n').filter(line => line.startsWith('+') && !line.startsWith('+++')).length;
    expect(hunk).not.toBeNull();
    expect(Number(hunk?.[1])).toBe(addedSourceLines);
  });
  it('uploads and draws a complete packet without synchronous GL error reads', () => {
    const f = fixture(); f.upload([frame('f1'), frame('f2'), frame('f3')]);
    expect(f.checks()).toHaveLength(0);
    expect(f.acks()).toHaveLength(0);
    f.sendPose(['f1', 'f2', 'f3']); f.render();
    expect(f.acks().at(-1)).toMatchObject({ actors: ['hero'], frames: ['f1', 'f2', 'f3'] });
    expect(f.stores.get('flip')).toBe(true); expect(f.stores.get('premultiply')).toBe(true);
    const checks = f.checks().length;
    f.upload([frame('f1'), frame('f2')]); f.upload([]);
    expect(f.checks()).toHaveLength(checks);
  });
  it.each([1, 2, 3])('releases the whole packet when upload %i throws without reading GL errors', failAt => {
    const f = fixture(); let uploaded = 0;
    f.gl.texImage2D = () => { if (++uploaded === failAt) throw Error('injected upload'); };
    f.upload([frame('f1'), frame('f2'), frame('f3')]);
    expect(uploaded).toBe(failAt); expect(f.checks()).toHaveLength(0);
    expectReleased(f); expect(f.acks()).toHaveLength(0);
  });
  it('rejects context loss during an upload before any actor ACK', () => {
    const f = fixture(); f.gl.texImage2D = () => f.lose();
    f.upload([frame('f1')]);
    expect(f.checks()).toHaveLength(0);
    expectReleased(f);
  });
  it('owns and releases partial allocations when an upload throws', () => {
    const f = fixture(); let uploaded = 0;
    f.gl.texImage2D = () => { if (++uploaded === 2) throw Error('injected upload'); };
    f.upload([frame('f1'), frame('f2'), frame('f3')]);
    expect(f.allocated).toHaveLength(2); expectReleased(f);
  });
  it('restores state when allocation fails after an earlier texture', () => {
    const f = fixture(); const allocate = f.gl.createTexture; let count = 0;
    f.gl.createTexture = () => ++count === 2 ? null : allocate();
    f.upload([frame('f1'), frame('f2')]); expectReleased(f);
  });
  it('continues cleanup when deleting one texture throws', () => {
    const f = fixture(); const remove = f.gl.deleteTexture;
    f.gl.deleteTexture = (texture: object) => { remove(texture); throw Error('lost resource'); };
    let uploads = 0; f.gl.texImage2D = () => { if (++uploads === 2) throw Error('injected upload'); };
    f.upload([frame('f1'), frame('f2')]);
    expect(f.deleted).toHaveLength(2); expectReleased(f);
    f.api.release(f.gl); expect(f.deleted).toHaveLength(2);
  });
  it('keeps the 8 MiB packet cap and rejects malformed textures without allocating', () => {
    const f = fixture(); f.upload([{ ...frame('f0'), width: 0 }, frame('f1', 1024, 1024), frame('f2', 1024, 1024), frame('f3')]);
    expect(f.allocated).toHaveLength(2); expect(f.checks()).toHaveLength(0);
    f.sendPose(['f1', 'f2']); f.render(); expect(f.acks().at(-1).frames).toEqual(['f1', 'f2']);
  });
  it('evicts unprotected frames while retaining an active frame at the 512-texture cap', () => {
    const f = fixture(); f.upload(Array.from({ length: 512 }, (_, i) => frame(`f${i + 1}`)));
    f.sendPose(); f.render(); f.at(1); f.upload([frame('f513')]); f.at(51); f.render();
    expect(f.deleted).toEqual([f.allocated[1]]);
    expect(f.acks().at(-1).frames).toHaveLength(512);
    expect(f.acks().at(-1).frames).toContain('f1'); expect(f.acks().at(-1).evicted).toEqual(['f2']);
  });
  it('fails required capacity without evicting 32 MiB of protected frames', () => {
    const f = fixture();
    for (let i = 1; i <= 8; i += 2) f.upload([frame(`f${i}`, 1024, 1024), frame(`f${i + 1}`, 1024, 1024)]);
    f.sendPose(Array.from({ length: 8 }, (_, i) => `f${i + 1}`)); f.render();
    f.upload([frame('f9')]); expect(f.allocated).toHaveLength(8); expect(f.deleted).toHaveLength(0);
    f.sendPose(Array.from({ length: 9 }, (_, i) => `f${i + 1}`)); f.render(); expectReleased(f);
  });
});

function active() { const f = fixture(); f.upload([frame('f1')]); f.sendPose(); f.render(); return f; }

describe('native draw validation without periodic GL polling', () => {
  it('keeps actor acknowledgements fresh without recurrent synchronous GL queries', () => {
    const f = active(); const checks = f.checks().length;
    for (const tick of [10, 50, 100, 150, 199, 200, 400, 600]) {
      f.at(tick); f.sendPose(); f.render();
    }
    expect(f.acks().at(-1)?.actors).toEqual(['hero']);
    expect(f.checks()).toHaveLength(checks);
    expect(f.timers.size).toBe(0);
  });

  it('releases stale actor ownership after regular slow frames without polling GL', () => {
    const f = active(); const checks = f.checks().length;
    for (const tick of [100, 200, 300, 351]) { f.at(tick); f.render(); }
    expect(f.acks().at(-1)?.actors).toEqual([]);
    expect(f.checks()).toHaveLength(checks);
    expect(f.timers.size).toBe(0);
  });

  it('tolerates one slow frame but releases actors when the pause continues', () => {
    const f = active(); const checks = f.checks().length;
    f.at(600); f.render();
    expect(f.acks().at(-1)?.actors).toEqual(['hero']);
    f.at(1_000); f.render();
    expect(f.acks().at(-1)?.actors).toEqual([]);
    expect(f.checks()).toHaveLength(checks);
    expect(f.timers.size).toBe(0);
  });

  it('caps adaptive actor freshness after an exceptionally long pause', () => {
    const f = active(); const checks = f.checks().length;
    f.at(5_000); f.render();
    expect(f.acks().at(-1)?.actors).toEqual([]);
    expect(f.checks()).toHaveLength(checks);
    expect(f.timers.size).toBe(0);
  });

  it('keeps a healthy context alive after a long pause without a watchdog', () => {
    const f = active(); const checks = f.checks().length;
    f.at(60_000); f.sendPose(); f.render(); f.fireDue();
    expect(f.acks().at(-1)?.actors).toEqual(['hero']);
    expect(f.checks()).toHaveLength(checks);
    expect(f.errors()).toHaveLength(0);
    expect(f.timers.size).toBe(0);
  });

  it('reacts to context loss immediately without a polling timer', () => {
    const f = active(); f.at(1); f.lose(); f.event();
    expect(f.errors()).toHaveLength(1);
    expect(f.listeners.get('webglcontextlost')?.size).toBe(0);
    expect(f.timers.size).toBe(0);
  });

  it('rejects a lost context at render entry before another ACK', () => {
    const f = active(); const acks = f.acks().length;
    f.at(1); f.lose(); f.sendPose(); f.render();
    expect(f.errors()).toHaveLength(1);
    expect(f.acks()).toHaveLength(acks);
    expect(f.timers.size).toBe(0);
  });

  it('releases listeners and resources idempotently without stale timer effects', () => {
    const f = active();
    f.api.release(f.gl); f.api.release(f.gl); f.at(1_000); f.fireDue(); f.event();
    expect(f.deleted).toEqual(f.allocated);
    expect(f.errors()).toHaveLength(0);
    expect(f.timers.size).toBe(0);
    expect(f.listeners.get('webglcontextlost')?.size).toBe(0);
  });

  it('registers one context-lost listener across repeated init', () => {
    const f = active(); f.receive({ type: 'ragidle-map-actors-init' });
    f.receive({ type: 'ragidle-map-actors-init' });
    expect(f.listeners.get('webglcontextlost')?.size).toBe(1);
    expect(f.timers.size).toBe(0);
  });
});

describe('native GL policy ownership integration', () => {
  it('does not read GL errors during cold draws, upload, or first positive ACK', () => {
    const f = fixture(); f.sendPose(); f.render(); const checks = f.checks().length;
    f.at(50); f.render(); f.at(100); f.render(); expect(f.checks()).toHaveLength(checks);
    f.upload([frame('f1')]); expect(f.checks()).toHaveLength(checks);
    f.at(101); f.render(); expect(f.checks()).toHaveLength(checks);
    expect(f.acks().at(-1).actors).toEqual(['hero']);
  });
  it('releases the original GL resources when a new context replaces the same session', () => {
    const f = active(); const callback = [...f.timers.values()][0]?.callback;
    const replacement = { ...f.gl, canvas: new EventTarget() };
    f.api.receive({ type: 'ragidle-map-actors-init', map: 'fixture', session }, 'https://fixture', 'fixture', replacement);
    expect(f.deleted).toEqual(f.allocated); expect(f.listeners.get('webglcontextlost')?.size).toBe(0);
    expect(f.timers.size).toBe(0); callback?.(); expect(f.errors()).toHaveLength(0);
    f.api.release(replacement);
  });
  it('restores the renderer state after a JavaScript draw exception', () => {
    const f = active(); f.sprite.render = () => { throw Error('injected draw failure'); };
    f.at(1); f.render(); expectReleased(f); expect(f.timers.size).toBe(0);
  });
  it('keeps parent bridge ownership fresh without periodic synchronous GL polling', () => {
    let now = 0; vi.spyOn(performance, 'now').mockImplementation(() => now);
    const outbound: any[] = [];
    const bridge = new NativeActorsBridge({ postMessage: (message: any) => outbound.push(message) } as any, 'https://fixture', 'fixture');
    const f = fixture(outbound[0].session, message => bridge.receive(message));
    const actor: any = { kind: 'monster', fallback: false, body: {
      sprite: { indexedCount: 1, frames: [{ width: 1, height: 1, type: 0, rgba: new Uint8ClampedArray([1, 0, 0, 255]) }] },
      action: { actions: Array.from({ length: 40 }, () => ({ delayMs: 100, frames: [{ anchors: [], layers: [
        { index: 0, type: 0, x: 0, y: 0, mirror: false, scaleX: 1, scaleY: 1, rotation: 0, color: [255, 255, 255, 255] },
      ] }] })) },
    } };
    const paint: any = { id: 'hero', actor, action: 'idle', world: [.5, 0, .5], scale: 1, direction: 6, elapsed: 0, bottom: 0, motionMs: 300 };
    const camera: any = { map: 'fixture', modelView: [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],
      projection: [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1], focus: [.5,0,.5], viewport: { width: 100, height: 100 } };
    bridge.submit([paint], camera, 100, 100, now);
    for (const message of outbound.slice(1)) f.receive(message);
    f.render();
    expect(bridge.submit([paint], camera, 100, 100, now).has('hero')).toBe(true);
    const checks = f.checks().length;
    for (now = 100; now <= 2_000; now += 100) { f.at(now); f.sendPose(); f.render(); }
    expect(f.acks().at(-1)?.actors).toEqual(['hero']);
    expect(f.checks()).toHaveLength(checks);
    expect(f.timers.size).toBe(0);
    expect(bridge.getDiagnostics('hero', now)).toMatchObject({ failed: false, supported: true });
    expect(bridge.submit([paint], camera, 100, 100, now).has('hero')).toBe(true);
    bridge.dispose();
  });
});
