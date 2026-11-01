import { describe, expect, it, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { NativeActorsBridge, canRecoverActionOwnership } from '../web/assets/nativeActors';
import { EnemyActionPresentation } from '../web/assets/enemyActionPresentation';
import { targetHealthAt } from '../web/assets/combatPresentation';
import { shiftCorpsePresentation } from '../web/assets/corpsePresentation';

const scene = readFileSync(new URL('../web/components/Scene.tsx', import.meta.url), 'utf8');
const camera: any = { map: 'fixture', modelView: [], projection: [], focus: [.5, 0, .5], viewport: { width: 100, height: 100 } };
const layer = { index: 0, type: 0, x: 0, y: 0, mirror: false, scaleX: 1, scaleY: 1, rotation: 0,
  color: [255, 255, 255, 255] };
const part = (base: number) => ({
  sprite: { indexedCount: 4, frames: Array.from({ length: 4 }, (_, i) => ({ width: 1, height: 1,
    rgba: new Uint8ClampedArray([base + i, 0, 0, 255]), type: 0 })) },
  action: { actions: Array.from({ length: 40 }, () => ({ delayMs: 100, frames: [{ layers: [layer], anchors: [] }] })) },
});
const actor: any = { kind: 'monster', fallback: false, body: part(10), head: part(20), weapon: part(30), weaponTrail: part(40) };
const paint: any = { id: 'hero', actor, action: 'attack', world: [.5, 0, .5], scale: 1, direction: 6,
  elapsed: 0, bottom: 0, motionMs: 300 };

function sceneNativeState(enemy: boolean) {
  const marker = 'nativeState: (cue, facing) => {';
  let start = -1;
  for (let i = 0; i <= Number(enemy); i++) start = scene.indexOf(marker, start + 1);
  if (start < 0) throw new Error(`Scene ${enemy ? 'enemy' : 'hero'} nativeState callback missing`);
  const open = scene.indexOf('{', start);
  let depth = 0, close = -1;
  for (let i = open; i < scene.length; i++) {
    if (scene[i] === '{') depth++;
    else if (scene[i] === '}' && --depth === 0) { close = i; break; }
  }
  if (close < 0) throw new Error('Unbalanced Scene nativeState callback');
  const property = scene.slice(start, close + 1);
  const js = ts.transpileModule(`const nativeState = ({ ${property} }).nativeState;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return new Function('scope', `with (scope) { ${js}; return nativeState; }`);
}
const heroNativeState = sceneNativeState(false);
const enemyNativeState = sceneNativeState(true);

function warmBridge() {
  let now = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const messages: any[] = [];
  const bridge = new NativeActorsBridge({ postMessage: (data: any) => messages.push(data) } as any, 'https://fixture', 'fixture');
  const envelope = { map: 'fixture', session: messages[0].session };
  bridge.receive({ ...envelope, type: 'ragidle-map-actors-ready', version: 2 });
  bridge.submit([paint], camera, 100, 100, now);
  const frames = messages.filter(message => message.type === 'ragidle-map-actor-frames')
    .flatMap(message => message.frames.map((frame: any) => frame.id));
  bridge.receive({ ...envelope, type: 'ragidle-map-actors-rendered', sequence: 1, actors: ['hero'], frames });
  return {
    bridge, envelope, frames, messages,
    setNow(value: number) { now = value; },
    loseOwnership(sequence: number) {
      bridge.receive({ ...envelope, type: 'ragidle-map-actors-rendered', sequence, actors: [], frames });
    },
    ack(sequence: number, actors: string[] = ['hero']) {
      bridge.receive({ ...envelope, type: 'ragidle-map-actors-rendered', sequence, actors, frames });
    },
  };
}

function callSceneNativeState(enemy: boolean, bridge: NativeActorsBridge, cue: any, time: number) {
  const scope = enemy ? { camera, time, canRecoverActionOwnership, hasWorld: true, motion: { matches: false }, nativeActors: { current: bridge },
    id: 'hero', actor } : { camera, time, canRecoverActionOwnership, heroPlacement: { world: paint.world }, motion: { matches: false },
    nativeActors: { current: bridge }, current: { id: 'hero' }, heroActor: actor,
    getCombatActorAction: (action: string) => action };
  return (enemy ? enemyNativeState : heroNativeState)(scope)(cue, 6);
}

afterEach(() => vi.restoreAllMocks());

describe('native action ownership recovery through Scene and NativeActorsBridge', () => {
  it.each([['stale ACK', 1450, false], ['fresh ACK without actor ownership', 1100, true]] as const)(
    'keeps a previously warmed %s action pending for the %s Scene consumer',
    (_condition, time, dropOwnership) => {
      const fixture = warmBridge();
      if (dropOwnership) { fixture.setNow(time); fixture.loseOwnership(2); }
      const cue = { actorAction: 'attack', skill: undefined };
      expect(callSceneNativeState(false, fixture.bridge, cue, time)).toBe('pending');
      expect(callSceneNativeState(true, fixture.bridge, cue, time)).toBe('pending');
    },
  );

  it('submits the recovered attack from frame zero and moves hit, HP and corpse associations together', () => {
    const fixture = warmBridge(), now = 1450;
    const cue: any = { id: 1, actionId: 'hero-swing', actionAt: 1000, sourceActorId: 'hero', targetActorId: 'mob',
      actorAction: 'attack', start: 1000, effectStart: 1000, impact: 1300, actionDuration: 600, duration: 800,
      motionMs: 300, hit: true, amount: 100, targetHpBefore: 100, presented: true };
    const next: any = { ...cue, id: 2, actionId: 'hero-next', actionAt: 1100, targetActorId: 'other',
      start: 1100, effectStart: 1100, impact: 1400 };
    const dot: any = { ...cue, id: 99, actionId: 'dot', targetActorId: 'mob', actorAction: 'none',
      start: 1020, effectStart: 1020, impact: 1320 };
    const cues = [cue, next, dot], marks = new Map(), presentation = new EnemyActionPresentation();
    const effects = { current: [{ id: 1, start: 1300 }, { id: 99, start: 1320 }] };
    const groupHistory = { current: new Map([['mob', { presentationCueId: 1, deadAt: 1300, until: 3300 }],
      ['dot-mob', { presentationCueId: 99, deadAt: 1320, until: 3320 }]]) };
    const defeatedOpponent = { current: { presentationCueId: 1, deadAt: 1300, until: 3300 } };
    const lootCues = { current: [{ presentationCueId: 1, start: 1300, until: 6300 },
      { presentationCueId: 99, start: 1320, until: 6320 }] };
    const shiftAssociates = new Function('scope', `with (scope) { ${ts.transpileModule(
      scene.slice(scene.indexOf('  const shiftPresentationAssociates ='), scene.indexOf('\n  useEffect', scene.indexOf('  const shiftPresentationAssociates ='))),
      { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText}; return shiftPresentationAssociates; }`)({
        effects, groupHistory, defeatedOpponent, lootCues, shiftCorpsePresentation,
      });
    const tick = (time: number) => {
      fixture.setNow(time);
      const frame = presentation.frame(cues, marks, 'hero', time, { decoded: true, direction: 6,
        hasPose: () => true, playbackDuration: () => 600,
        nativeState: (candidate, facing) => callSceneNativeState(false, fixture.bridge,
          { actorAction: candidate.actorAction, skill: undefined }, time) });
      if (frame) shiftAssociates(frame.moved);
      const submitted = fixture.bridge.submit(frame?.canvasOnly ? [] : [{ ...paint, elapsed: frame?.elapsed ?? 0 }],
        camera, 100, 100, time);
      return { frame, submitted };
    };

    const first = tick(now);
    expect(first.frame).toMatchObject({ elapsed: 0, waited: 0, canvasOnly: false });
    expect(first.frame!.moved.get(1)).toBe(450);
    expect(cue.impact).toBe(1750);
    expect(fixture.messages.at(-1).actors.map((entry: any) => entry.id)).toContain('hero');
    expect(first.submitted.has('hero')).toBe(false);

    fixture.setNow(1490);
    fixture.ack(2);
    const recovered = tick(1490);
    expect(recovered.frame).toMatchObject({ elapsed: 0, waited: 40, canvasOnly: false });
    expect(recovered.submitted.has('hero')).toBe(true);
    expect(cue.start).toBe(1490); expect(cue.impact).toBe(1790); expect(next.start).toBe(1590);
    expect(cue.actionAt).toBe(1000); expect(cue.motionMs).toBe(300);
    expect(dot.impact).toBe(1320);
    expect(targetHealthAt(0, 100, cues, 'mob', 1789)).toBe(100);
    expect(targetHealthAt(0, 100, cues, 'mob', 1790)).toBe(0);
    expect(effects.current[0].start).toBe(1790);
    expect(groupHistory.current.get('mob')).toMatchObject({ deadAt: 1790, until: 3790 });
    expect(defeatedOpponent.current).toMatchObject({ deadAt: 1790, until: 3790 });
    expect(lootCues.current[0]).toMatchObject({ start: 1790, until: 6790 });
    expect(effects.current[1].start).toBe(1320);
    expect(groupHistory.current.get('dot-mob')).toMatchObject({ deadAt: 1320, until: 3320 });
    expect(lootCues.current[1]).toMatchObject({ start: 1320, until: 6320 });
  });

  it('falls back after 450ms without ACK and keeps that cue on Canvas after ownership returns', () => {
    const fixture = warmBridge(), cue: any = { id: 1, actionId: 'hero-swing', actionAt: 1000,
      sourceActorId: 'hero', targetActorId: 'mob', actorAction: 'attack', start: 1000, effectStart: 1000,
      impact: 1300, actionDuration: 600, duration: 800, motionMs: 300, hit: true,
      amount: 100, targetHpBefore: 100, presented: true };
    const cues = [cue], marks = new Map(), presentation = new EnemyActionPresentation();
    const effects = { current: [{ id: 1, start: 1300 }] };
    const groupHistory = { current: new Map([['mob', { presentationCueId: 1, deadAt: 1300, until: 3300 }]]) };
    const defeatedOpponent = { current: { presentationCueId: 1, deadAt: 1300, until: 3300 } };
    const lootCues = { current: [{ presentationCueId: 1, start: 1300, until: 6300 }] };
    const shiftAssociates = new Function('scope', `with (scope) { ${ts.transpileModule(
      scene.slice(scene.indexOf('  const shiftPresentationAssociates ='), scene.indexOf('\n  useEffect', scene.indexOf('  const shiftPresentationAssociates ='))),
      { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText}; return shiftPresentationAssociates; }`)({
        effects, groupHistory, defeatedOpponent, lootCues, shiftCorpsePresentation,
      });
    const tick = (time: number) => {
      fixture.setNow(time);
      const frame = presentation.frame(cues, marks, 'hero', time, { decoded: true, direction: 6,
        hasPose: () => true, playbackDuration: () => 600,
        nativeState: (candidate) => callSceneNativeState(false, fixture.bridge,
          { actorAction: candidate.actorAction, skill: undefined }, time) });
      if (frame) shiftAssociates(frame.moved);
      const submitted = fixture.bridge.submit(frame?.canvasOnly ? [] : [{ ...paint, elapsed: frame?.elapsed ?? 0 }],
        camera, 100, 100, time);
      return { frame, submitted };
    };

    tick(1450);
    for (let time = 1500; time <= 1900; time += 50) {
      const pending = tick(time);
      if (time < 1900) {
        expect(pending.frame).toMatchObject({ elapsed: 0, canvasOnly: false });
        expect(fixture.messages.at(-1).actors.map((entry: any) => entry.id)).toContain('hero');
      } else {
        expect(pending.frame).toMatchObject({ elapsed: 0, waited: 450, canvasOnly: true });
        expect(pending.submitted.has('hero')).toBe(false);
        expect(fixture.messages.at(-1).actors).toEqual([]);
      }
    }
    expect(cue.impact).toBe(2200);
    expect(targetHealthAt(0, 100, cues, 'mob', 2199)).toBe(100);
    expect(targetHealthAt(0, 100, cues, 'mob', 2200)).toBe(0);
    expect(effects.current[0].start).toBe(2200);
    expect(groupHistory.current.get('mob')).toMatchObject({ deadAt: 2200, until: 4200 });
    expect(defeatedOpponent.current).toMatchObject({ deadAt: 2200, until: 4200 });
    expect(lootCues.current[0]).toMatchObject({ start: 2200, until: 7200 });

    fixture.setNow(1900);
    fixture.ack(2);
    const later = tick(1950);
    expect(later.frame).toMatchObject({ elapsed: 50, waited: 450, canvasOnly: true });
    expect(later.submitted.has('hero')).toBe(false);
  });

  it('does not wait for an unsupported, cold, failed or unavailable Scene paint surface', () => {
    const coldMessages: any[] = [];
    const cold = new NativeActorsBridge({ postMessage: (data: any) => coldMessages.push(data) } as any, 'https://fixture', 'fixture');
    const envelope = { map: 'fixture', session: coldMessages[0].session };
    cold.receive({ ...envelope, type: 'ragidle-map-actors-ready', version: 2 });
    expect(canRecoverActionOwnership(cold.actionOwnershipRecoveryState(paint, 1000))).toBe(false);
    expect(callSceneNativeState(false, cold, { actorAction: 'attack' }, 1000)).toBe('canvas');

    const unsupportedMessages: any[] = [];
    const unsupported = new NativeActorsBridge({ postMessage: (data: any) => unsupportedMessages.push(data) } as any,
      'https://fixture', 'fixture');
    expect(canRecoverActionOwnership(unsupported.actionOwnershipRecoveryState(paint, 1000))).toBe(false);
    expect(callSceneNativeState(false, unsupported, { actorAction: 'attack' }, 1000)).toBe('canvas');
    expect(callSceneNativeState(true, unsupported, { actorAction: 'attack' }, 1000)).toBe('canvas');

    const fixture = warmBridge();
    fixture.bridge.receive({ ...fixture.envelope, type: 'ragidle-map-actors-error', reason: 'draw failed' });
    expect(canRecoverActionOwnership(fixture.bridge.actionOwnershipRecoveryState(paint, 1100))).toBe(false);
    expect(callSceneNativeState(false, fixture.bridge, { actorAction: 'attack' }, 1100)).toBe('canvas');
    expect(callSceneNativeState(true, fixture.bridge, { actorAction: 'attack' }, 1100)).toBe('canvas');
    expect(heroNativeState({ camera, time: 1100, heroPlacement: { world: paint.world }, motion: { matches: true },
      canRecoverActionOwnership, nativeActors: { current: fixture.bridge }, current: { id: 'hero' }, heroActor: actor,
      getCombatActorAction: (action: string) => action })({ actorAction: 'attack' }, 6)).toBe('canvas');
    expect(heroNativeState({ camera: null, time: 1100, heroPlacement: { world: paint.world }, motion: { matches: false },
      canRecoverActionOwnership, nativeActors: { current: fixture.bridge }, current: { id: 'hero' }, heroActor: actor,
      getCombatActorAction: (action: string) => action })({ actorAction: 'attack' }, 6)).toBe('canvas');
    expect(enemyNativeState({ camera, time: 1100, hasWorld: true, motion: { matches: true },
      nativeActors: { current: fixture.bridge }, id: 'hero', actor })({ actorAction: 'attack' }, 6)).toBe('canvas');
    expect(enemyNativeState({ camera: null, time: 1100, hasWorld: true, motion: { matches: false },
      nativeActors: { current: fixture.bridge }, id: 'hero', actor })({ actorAction: 'attack' }, 6)).toBe('canvas');
    expect(enemyNativeState({ camera, time: 1100, hasWorld: false, motion: { matches: false },
      nativeActors: { current: fixture.bridge }, id: 'hero', actor })({ actorAction: 'attack' }, 6)).toBe('canvas');
  });
});
