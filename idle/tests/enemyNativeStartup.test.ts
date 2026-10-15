import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { NativeActorsBridge } from '../web/assets/nativeActors';
import { EnemyActionPresentation } from '../web/assets/enemyActionPresentation';

const camera: any = { map: 'fixture', modelView: [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],
  projection: [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1], focus: [.5,0,.5], viewport: { width: 100, height: 100 } };
function fixture() {
  let now = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const patch = readFileSync(new URL('../../docker/web-client/mapviewer-idle.patch', import.meta.url), 'utf8');
  const source = patch.split('@@ -0,0 +1,')[1].split('\n').slice(1).filter(l => l.startsWith('+'))
    .map(l => l.slice(1)).join('\n').split('export default')[0].replace(/^import .*;$/gm, '');
  const messages: any[] = [], acks: any[] = [];
  const gl: any = { NO_ERROR: 0, getError: () => 0, isContextLost: () => false, getParameter: () => false, createTexture: () => ({}) };
  for (const name of ['deleteTexture','activeTexture','bindTexture','pixelStorei','texImage2D','texParameteri','enable','depthMask']) gl[name] = () => {};
  const api = runInNewContext(source + '\n({receive,render})', { Uint8ClampedArray, performance,
    window: { parent: { postMessage: (data: any) => acks.push(data) } }, Altitude: { width: 400, height: 400 }, Ground: { getShadowFactor: () => 1 }, WebGL: {},
    SpriteRenderer: { bind3DContext: () => {}, unbind: () => {}, runWithDepth: (_a:any,_b:any,_c:any,fn:any) => fn(),
      position: { set: () => {} }, offset: { set: () => {} }, size: { set: () => {} }, color: { set: () => {} }, image: {}, render: () => {} } });
  const bridge = new NativeActorsBridge({ postMessage: (data: any) => messages.push(data) } as any, 'https://fixture', 'fixture');
  const frame = (value: number) => ({ width: 1, height: 1, rgba: new Uint8ClampedArray([value,0,0,255]), type: 0 });
  const actor: any = { kind: 'monster', fallback: false, body: { sprite: { indexedCount: 4, frames: [10,11,12,13].map(frame) },
    action: { actions: Array.from({ length: 40 }, (_,i) => ({ delayMs: 100, frames: (i===22?[1,2,3]:[0]).map(index => ({ anchors: [],
      layers: [{ index, type: 0, x: 0, y: 0, mirror: false, scaleX: 1, scaleY: 1, rotation: 0, color: [255,255,255,255] }] })) })) } } };
  const paint: any = { id: 'mob', actor, action: 'idle', world: [.5,0,.5], scale: 1, direction: 6, elapsed: 0, bottom: 0, motionMs: 300 };
  const withheld: any[] = [];
  const send = (release = false) => {
    for (const message of messages.splice(0)) {
      if (message.type === 'ragidle-map-actor-frames') {
        const cold = message.frames.filter((f:any) => f.rgba[0] !== 10);
        withheld.push(...cold);
        api.receive({ ...message, frames: release ? message.frames : message.frames.filter((f:any) => f.rgba[0] === 10) }, 'https://fixture', 'fixture', gl);
      } else api.receive(message, 'https://fixture', 'fixture', gl);
    }
    if (release && withheld.length) api.receive({ type:'ragidle-map-actor-frames', map:'fixture', session:bridgeSession, frames:withheld.splice(0) }, 'https://fixture', 'fixture', gl);
    api.render(now, gl, [], [], {});
    for (const ack of acks.splice(0)) bridge.receive(ack);
  };
  const bridgeSession = messages[0].session;
  send(); bridge.submit([paint], camera, 100, 100, now); send();
  const cue = { id:1, actionId:'attack-1', actionAt:1000, sourceActorId:'mob', actorAction:'attack' as const,
    start:1000, effectStart:1000, impact:1300, actionDuration:300, presented:true };
  const gate = new EnemyActionPresentation(), marks = new Map();
  const tick = (at:number, release = false) => {
    now = at;
    if (release) send(true);
    const attack = { ...paint, action:'attack' };
    const result = gate.frame([cue], marks, 'mob', now, { decoded:true, direction:6, hasPose:()=>true, playbackDuration:()=>300,
      nativeState:()=> bridge.canPaintActionNatively(attack,now) ? 'ready' : bridge.areActionTexturesReady(attack,now) ? 'canvas' : 'pending' })!;
    const owned = bridge.submit(result.canvasOnly ? [] : [{ ...attack, elapsed:result.elapsed }], camera, 100, 100, now);
    send(release);
    return { result, owned };
  };
  return { tick, cue, bridge };
}
afterEach(() => vi.restoreAllMocks());
describe('monster startup with the real native retained-pose protocol', () => {
  it('keeps a fresh idle ACK from spending the attack before textures arrive', () => {
    const f = fixture(); f.tick(1000);
    expect(f.bridge.getDiagnostics('mob')).toMatchObject({ poseHeld:true });
    expect(f.tick(1100).result).toMatchObject({ elapsed:0, waited:100, canvasOnly:false });
    expect(f.tick(1140,true).result).toMatchObject({ elapsed:0, waited:140, canvasOnly:false });
    expect(f.cue.impact).toBe(1440);
    expect(f.tick(1240,true).result.elapsed).toBe(100);
    expect(f.bridge.getDiagnostics('mob')).toMatchObject({ poseHeld:false });
  });
  it('removes retained idle ownership after the finite wait and never hands that attack back to native', () => {
    const f = fixture();
    for (let at = 1000; at < 1450; at += 50) {
      f.tick(at); expect(f.bridge.getDiagnostics('mob').poseHeld).toBe(true);
    }
    const timeout = f.tick(1450);
    expect(timeout.result).toMatchObject({ elapsed:0, waited:450, canvasOnly:true });
    expect(timeout.owned.has('mob')).toBe(false);
    expect(f.bridge.getDiagnostics('mob')).toMatchObject({ drawnPose:null, poseHeld:null });
    expect(f.tick(1500,true).result).toMatchObject({ elapsed:50, canvasOnly:true });
    expect(f.cue.actionAt).toBe(1000); expect(f.cue.impact).toBe(1750);
  });
});
