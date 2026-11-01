import { describe, expect, it } from 'vitest';
import { EnemyActionPresentation } from '../web/assets/enemyActionPresentation';
import { presentLatestActorActions, targetHealthAt } from '../web/assets/combatPresentation';

const hit = (id = 1, actor = 'mob', at = 1000) => ({ id, actionId: `strike-${id}`, actionAt: at,
  sourceActorId: actor, targetActorId: 'hero', actorAction: 'attack' as const, start: at,
  effectStart: at, impact: at + 300, motionMs: 300, actionDuration: 300, duration: 600,
  presented: true, hit: true, targetHpBefore: 100, amount: 20 });
const options = (native: 'ready' | 'pending' | 'canvas' = 'ready', decoded = true, direction = 6) => ({
  direction, decoded, hasPose: () => true, playbackDuration: () => 300, nativeState: () => native,
});

describe('monster first useful attack frame', () => {
  // Break caught: selecting only a currently active cue before decode discards the whole swing.
  it('starts a recent attack at frame zero after decode instead of losing its elapsed window', () => {
    const cue = hit(), gate = new EnemyActionPresentation(), marks = new Map();
    expect(gate.frame([cue], marks, 'mob', 1200, options('ready', false))).toBeUndefined();
    const first = gate.frame([cue], marks, 'mob', 1900, options())!;
    expect(first).toMatchObject({ elapsed: 0, direction: 6, canvasOnly: false, firstFrameDelay: 900 });
    expect(cue.start).toBe(1900); expect(cue.impact).toBe(2200);
    expect(first.moved.get(1)).toBe(900);
    expect(cue.actionAt).toBe(1000); expect(cue.motionMs).toBe(300); expect(cue.amount).toBe(20);
    expect(gate.frame([cue], marks, 'mob', 2201, options())).toBeUndefined();
  });
  // Break caught: ACK ownership of idle is mistaken for the requested attack being ready.
  it('holds frame zero until the attack textures are ready, then keeps the full motion and impact', () => {
    const cue = hit(), gate = new EnemyActionPresentation(), marks = new Map();
    gate.frame([cue], marks, 'mob', 1000, options('pending'));
    const held = gate.frame([cue], marks, 'mob', 1100, options('pending', true, 2))!;
    expect(held).toMatchObject({ elapsed: 0, direction: 6, waited: 100, canvasOnly: false });
    expect(targetHealthAt(80, 100, [cue], 'hero', 1100)).toBe(100);
    const ready = gate.frame([cue], marks, 'mob', 1140, options())!;
    expect(ready.elapsed).toBe(0); expect(cue.impact).toBe(1440);
    expect(gate.frame([cue], marks, 'mob', 1240, options())!.elapsed).toBe(100);
    expect(targetHealthAt(80, 100, [cue], 'hero', 1439)).toBe(100);
    expect(targetHealthAt(80, 100, [cue], 'hero', 1440)).toBe(80);
  });
  // Break caught: a fresh held ACK keeps consuming an invisible attack after the upload budget.
  it('uses Canvas for the entire remaining action after 450ms without restarting or oscillating', () => {
    const cue = hit(), gate = new EnemyActionPresentation(), marks = new Map();
    for (let now = 1000; now < 1450; now += 50) gate.frame([cue], marks, 'mob', now, options('pending'));
    const first = gate.frame([cue], marks, 'mob', 1450, options('pending'))!;
    expect(first).toMatchObject({ elapsed: 0, waited: 450, canvasOnly: true });
    expect(gate.frame([cue], marks, 'mob', 1500, options('ready'))).toMatchObject({ elapsed: 50, canvasOnly: true });
    expect(gate.frame([cue], marks, 'mob', 1600, options('pending'))).toMatchObject({ elapsed: 150, waited: 450, canvasOnly: true });
    expect(cue.start).toBe(1450); expect(cue.impact).toBe(1750);
    expect(gate.frame([cue], marks, 'mob', 1751, options('ready'))).toBeUndefined();
  });
  it('pins an initially unowned or unavailable native renderer to a useful Canvas attack', () => {
    const cue = hit(), gate = new EnemyActionPresentation();
    expect(gate.frame([cue], new Map(), 'mob', 1000, options('canvas'))).toMatchObject({ elapsed: 0, canvasOnly: true });
    expect(gate.frame([cue], new Map(), 'mob', 1100, options('ready'))).toMatchObject({ elapsed: 100, canvasOnly: true });
  });
  it('moves only this actors queued attacks, preserving other monsters and immediate DOT clocks', () => {
    const cue = hit(), next = hit(2, 'mob', 1100), other = hit(3, 'other'),
      dot = { ...hit(4), actorAction: 'none' as const };
    const cues = [cue, next, other, dot], marks = new Map(), gate = new EnemyActionPresentation();
    presentLatestActorActions(cues, marks, 1000);
    gate.frame(cues, marks, 'mob', 1000, options('pending'));
    const frame = gate.frame(cues, marks, 'mob', 1100, options('pending'))!;
    expect(frame.moved.size).toBe(2); expect(next.start).toBe(1400);
    expect(other.start).toBe(1000); expect(dot.impact).toBe(1300);
    expect(marks.get('mob')).toMatchObject({ start: 1400, end: 1700 });
  });
  it('does not debut a missing ACT pose, stale action or compressed reconnect action', () => {
    const gate = new EnemyActionPresentation(), cue = hit();
    expect(gate.frame([cue], new Map(), 'mob', 1200, { ...options(), hasPose: () => false })).toBeUndefined();
    expect(cue.start).toBe(1000);
    expect(gate.frame([cue], new Map(), 'mob', 3001, options())).toBeUndefined();
    expect(gate.frame([{ ...hit(), presented: false }], new Map(), 'mob', 1100, options())).toBeUndefined();
  });
  it('starts the first Canvas pose at zero after a render gap longer than the GPU budget', () => {
    const cue = hit(), gate = new EnemyActionPresentation(), marks = new Map();
    gate.frame([cue], marks, 'mob', 1000, options('pending'));
    expect(gate.frame([cue], marks, 'mob', 1700, options('pending'))).toMatchObject({
      elapsed: 0, waited: 450, canvasOnly: true,
    });
    expect(cue.start).toBe(1700); expect(cue.impact).toBe(2000);
  });
  it('does not revive a GPU wait after a stale render gap', () => {
    const cue = hit(), gate = new EnemyActionPresentation(), marks = new Map();
    gate.frame([cue], marks, 'mob', 1000, options('pending'));
    expect(gate.frame([cue], marks, 'mob', 3001, options('pending'))).toBeUndefined();
  });
  it('does not debut and shift the next action twice while an earlier native wait is pending', () => {
    const first = hit(), next = hit(2, 'mob', 1300), cues = [first, next], marks = new Map(), gate = new EnemyActionPresentation();
    presentLatestActorActions(cues, marks, 1000);
    gate.frame(cues, marks, 'mob', 1000, options('pending'));
    expect(gate.frame(cues, marks, 'mob', 1700, options('pending'))!.cue).toBe(first);
    expect(first.start).toBe(1700); expect(next.start).toBe(2000); expect(next.impact).toBe(2300);
    expect(marks.get('mob')).toMatchObject({ start: 2000, end: 2300 });
  });
  it('retains a started but still invisible native attack through snapshot cleanup until its useful fallback', () => {
    const cue = hit(), gate = new EnemyActionPresentation(), marks = new Map();
    gate.frame([cue], marks, 'mob', 1000, options('pending'));
    expect(cue.start + cue.duration < 1700).toBe(true);
    expect(gate.hasPendingFrame(cue, 1700)).toBe(true);
    expect(gate.hasPendingFrame(cue, 3001)).toBe(false);
    gate.frame([cue], marks, 'mob', 1700, options('pending'));
    expect(gate.hasPendingFrame(cue, 1701)).toBe(false);
  });
});
