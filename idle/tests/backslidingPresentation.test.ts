import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import catalogJson from '../content/catalog.json';
import { createInitialState, getSnapshot } from '../engine/index.js';
import type { Catalog, GameState } from '../shared/types.js';
import Build from '../web/panels/Build.js';
import { backslidingFacingDirection, backslidingPresentationPoint } from '../web/assets/backslidingPresentation.js';
import { ActorActionPresentation } from '../web/assets/enemyActionPresentation.js';

const catalog = structuredClone(catalogJson) as unknown as Catalog;
const area = catalog.areas[0]!;
area.fieldNavigation = { map: area.map, origin: { x: 100, y: 100 }, homeOffsets: [] };

function setup(): GameState {
  const state = createInitialState(catalog, 0);
  state.job = 'thief'; state.learnedSkills.tf_backsliding = 1;
  state.status = 'hunting'; state.areaId = area.id;
  state.fieldHero = { areaId: area.id, from: { x: 4, y: 8 }, position: { x: 4, y: 8 },
    startedAt: 0, arrivedAt: 0, routeIndex: 0, phase: 'seeking' };
  return state;
}
function backSlideRow(state: GameState): string {
  const html = renderToStaticMarkup(createElement(Build, { catalog, snapshot: getSnapshot(state, catalog, 0),
    busy: false, command: async () => true, mode: 'skills' }));
  const skillAt = html.indexOf('Back Slide');
  const start = html.lastIndexOf('<article class="skill-row"', skillAt);
  const end = html.indexOf('</article>', skillAt) + '</article>'.length;
  return html.slice(start, end);
}

describe('Back Slide manual presentation', () => {
  it('slides directly from the captured origin to the clipped authoritative endpoint', () => {
    const motion = { origin: { x: 1, y: 1 }, destination: { x: 6, y: 4 }, startedAt: 100, nativePlaybackMs: 500 };
    expect(backslidingPresentationPoint(motion, 100)).toEqual(motion.origin);
    expect(backslidingPresentationPoint(motion, 350)).toEqual({ x: 3.5, y: 2.5 });
    expect(backslidingPresentationPoint(motion, 900)).toEqual(motion.destination);
    // The cue's source facing is immutable metadata; the animation never reads later playerFacing.
    const cueFacing = { x: 0, y: -1 };
    const laterPursuitFacing = { x: 1, y: 0 };
    expect(cueFacing).toEqual({ x: 0, y: -1 });
    expect(laterPursuitFacing).not.toEqual(cueFacing);
  });

  it('starts at the origin when cold actor textures first paint after the event', () => {
    const cue = { id: 1, actionId: 'hero:backslide:1000', actionAt: 1000, sourceActorId: 'hero',
      targetActorId: 'hero', actorAction: 'skill' as const, start: 1000, effectStart: 1000, impact: 1000,
      actionDuration: 300, duration: 300, motionMs: 200, presented: true, actionFacing: { x: 0, y: 1 } };
    const gate = new ActorActionPresentation();
    const frame = gate.frame([cue], new Map(), 'hero', 1450, { decoded: true, direction: 4,
      hasPose: () => true, playbackDuration: () => 300, nativeState: () => 'canvas' })!;
    const point = backslidingPresentationPoint({ origin: { x: 2, y: 3 }, destination: { x: 7, y: 3 },
      startedAt: frame.cue.start, nativePlaybackMs: frame.cue.actionDuration }, 1450);
    expect(cue.start).toBe(1450);
    expect(frame.elapsed).toBe(0);
    expect(point).toEqual({ x: 2, y: 3 });
    expect(frame.cue.actionFacing).toEqual({ x: 0, y: 1 });
  });

  it('holds at the origin through the native ACK wait, then advances without reversing', () => {
    const cue = { id: 1, actionId: 'hero:backslide:1000', actionAt: 1000, sourceActorId: 'hero',
      targetActorId: 'hero', actorAction: 'skill' as const, start: 1000, effectStart: 1000, impact: 1000,
      actionDuration: 300, duration: 300, motionMs: 200, presented: true, actionFacing: { x: 0, y: 1 } };
    const gate = new ActorActionPresentation(), marks = new Map();
    let point = { x: 2, y: 3 };
    for (let now = 1000; now <= 1450; now += 50) {
      const frame = gate.frame([cue], marks, 'hero', now, { decoded: true, direction: 4,
        hasPose: () => true, playbackDuration: () => 300, nativeState: () => 'pending' })!;
      point = backslidingPresentationPoint({ origin: { x: 2, y: 3 }, destination: { x: 7, y: 3 },
        startedAt: frame.cue.start, nativePlaybackMs: frame.cue.actionDuration }, now);
      expect(point).toEqual({ x: 2, y: 3 });
      expect(frame.cue.actionFacing).toEqual({ x: 0, y: 1 });
    }
    const released = gate.frame([cue], marks, 'hero', 1466, { decoded: true, direction: 1,
      hasPose: () => true, playbackDuration: () => 300, nativeState: () => 'ready' })!;
    const next = backslidingPresentationPoint({ origin: { x: 2, y: 3 }, destination: { x: 7, y: 3 },
      startedAt: released.cue.start, nativePlaybackMs: released.cue.actionDuration }, 1466);
    expect(released.elapsed).toBe(16);
    expect(next.x).toBeGreaterThan(point.x);
    expect(next.x).toBeLessThan(7);
  });

  it('uses one camera-projected action facing for native readiness and the painted pose', () => {
    const project = (point: { x: number; y: number }) => ({ x: -point.y, y: point.x });
    const direction = backslidingFacingDirection({ x: 4, y: 8 }, { x: 1, y: 0 }, project);
    expect(direction).toBe(0);
    expect(direction).not.toBe(backslidingFacingDirection({ x: 4, y: 8 }, { x: 1, y: 0 }));

    const cue = { id: 1, actionId: 'hero:backslide:1000', actionAt: 1000, sourceActorId: 'hero',
      targetActorId: 'hero', actorAction: 'skill' as const, start: 1000, effectStart: 1000, impact: 1000,
      actionDuration: 300, duration: 300, motionMs: 200, presented: true, actionFacing: { x: 1, y: 0 } };
    let nativeDirection: number | undefined;
    const frame = new ActorActionPresentation().frame([cue], new Map(), 'hero', 1100, { decoded: true, direction,
      hasPose: (_cue, look) => look === direction, playbackDuration: () => 300,
      nativeState: (_cue, look) => { nativeDirection = look; return 'ready'; } })!;
    expect(frame.direction).toBe(direction);
    expect(nativeDirection).toBe(direction);

    const scene = readFileSync(new URL('../web/components/Scene.tsx', import.meta.url), 'utf8');
    const slideStart = scene.indexOf('const backslidingCue =');
    const slideEnd = scene.indexOf('const enemyDirection =', slideStart);
    const slidePath = scene.slice(slideStart, slideEnd);
    expect(slidePath).toContain('backslidingFacingDirection(');
    expect(slidePath).toContain('direction: backslidingDirection');
    expect(slidePath).toContain('heroDirection = heroFrame?.direction ?? backslidingDirection');
  });

  it('shows a learned Thief the manual control and never offers it in rotation', () => {
    const row = backSlideRow(setup());
    expect(row).toContain('<button>Usar Back Slide · 7 SP</button>');
    expect(row).not.toContain('Usar na rotação');
    expect(row).not.toContain('Remover da rotação');
  });

  it('disables the manual control for invalid live states and resource shortage', () => {
    const invalid: Array<(state: GameState) => void> = [
      state => { state.sp = 0; }, state => { state.hp = 0; },
      state => { state.battle = { cast: { actionId: 'active' } } as any; },
      state => { state.status = 'challenge'; }, state => { state.status = 'resting'; },
      state => { state.status = 'town'; }, state => { state.fieldHero = undefined; },
      state => { state.playerStatuses = { SC_SILENCE: { level: 1, startsAt: 0, expiresAt: 1000 } }; },
      ...['MO_STEELBODY', 'LK_BERSERK', 'TF_HIDING', 'ST_CHASEWALK'].map(source => (state: GameState) => {
        const skill = Object.values(catalog.skills).find(entry => entry.sourceName === source)!;
        state.buffs[skill.id] = { expiresAt: 1000, effects: {} };
      }),
      state => { state.buffs.sc_invisibility = { expiresAt: 1000, effects: {} }; },
    ];
    for (const change of invalid) {
      const row = backSlideRow((state => { change(state); return state; })(setup()));
      expect(row).toContain('disabled=""');
    }
    const unsupported = setup(); unsupported.job = 'swordsman';
    expect(backSlideRow(unsupported)).not.toContain('Usar Back Slide');
  });
});
