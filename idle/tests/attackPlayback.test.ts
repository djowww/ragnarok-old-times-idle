import { describe, expect, it } from 'vitest';
import * as render from '../web/assets/renderer';
import * as presentation from '../web/assets/combatPresentation';
import type { WeaponAppearance } from '../web/assets/weapon';

function actor(job = 'swordsman', gender: 'male' | 'female' = 'male', type?: WeaponAppearance['type'], count = 12) {
  const image = { width: 1, height: 1, type: 0 as const, rgba: new Uint8ClampedArray([255, 0, 0, 255]) };
  const layer = { x: 0, y: 0, index: 0, mirror: false, color: [255, 255, 255, 255] as [number, number, number, number],
    scaleX: 1, scaleY: 1, rotation: 0, type: 0, width: 0, height: 0 };
  const part = { sprite: { version: 2.1, indexedCount: 1, frames: [image] }, action: { version: 2.5, sounds: [],
    actions: Array.from({ length: 104 }, () => ({ delayMs: 100,
      frames: Array.from({ length: count }, (_, i) => ({ layers: [{ ...layer, x: i }], anchors: [], sound: -1 })) })) } };
  return { kind: 'character' as const, fallback: false, identity: { job, gender }, body: part, head: part,
    weapon: type ? part : undefined, weaponTrail: type ? part : undefined,
    weaponVisual: type ? { type, job, gender } : undefined };
}
describe('pinned client attack playback', () => {
  it('reconciles AoE siblings once with their shared locked direction, including late hits', () => {
    const make = (id: number) => ({ id, actionId: 'aoe', actionAt: 1000, sourceActorId: 'hero',
      actorAction: 'attack' as const, start: 1000, effectStart: 1000, impact: 1300,
      actionDuration: 300, presented: true, presentationDirection: undefined as number | undefined });
    const first = make(1), second = make(2), cues = [first, second];
    first.presentationDirection = 2;
    const marks = new Map([['hero', { actionAt: 1000, actionId: 'aoe', id: 2, start: 1000, end: 1300, presented: true }]]);
    const actions = presentation.presentedActorActions(cues, 'hero');
    expect(actions).toHaveLength(1); expect(actions[0]).toBe(first);
    expect(presentation.lockActorDirection(cues, second, 6)).toBe(2);
    expect(second.presentationDirection).toBe(2);
    presentation.reconcileActorPlayback(cues, marks, actions[0], 600);
    const late = make(3);
    presentation.presentLatestActorActions([late], marks, 1400, cues);
    expect(late.actionDuration).toBe(600); expect(late.presentationDirection).toBe(2);
    expect(marks.get('hero')!.end).toBe(1600);
    expect(presentation.presentedActorActions([...cues, late], 'hero')).toHaveLength(1);
  });
  it.each(Array.from({ length: 8 }, (_, i) => i))('uses the source per-frame motion in direction %i with synchronized parts', direction => {
    const value = actor('swordsman', 'male', 'sword');
    expect(render.getActorPose(value, 'attack', 50, direction, 300).map(layer => layer.x)).toEqual([1, 1, 1, 1]);
    expect(render.getActorPlaybackDuration(value, 'attack', 300, direction)).toBe(600);
    expect(render.getActorPose(value, 'attack', 599, direction, 300)[0].x).toBe(11);
  });
  it('uses male Novice5.85 and Assassin katar3 without extending unrelated skills', () => {
    expect(render.getActorPlaybackDuration(actor('novice'), 'attack', 300)).toBeCloseTo(300 / 5.85 * 12);
    expect(render.getActorPlaybackDuration(actor('novice', 'female'), 'attack', 300)).toBe(600);
    expect(render.getActorPlaybackDuration(actor('assassin', 'male', 'katar'), 'attack', 300)).toBe(1200);
    expect(render.getActorPlaybackDuration(actor('assassin_cross', 'female', 'katar'), 'attack', 300)).toBe(1200);
    expect(render.getActorPlaybackDuration(actor(), 'skill', 300)).toBe(300);
    expect(render.getActorPlaybackDuration({ ...actor(), kind: 'monster' }, 'attack', 300)).toBe(300);
  });
  it('slices only unarmed Monk/Champion attacks to five frames and preserves full armed attacks', () => {
    for (const job of ['monk', 'champion']) {
      expect(render.getActorPlaybackDuration(actor(job), 'attack', 300)).toBe(250);
      expect(render.getActorPose(actor(job), 'attack', 299, 0, 300).map(layer => layer.x)).toEqual([4, 4]);
      expect(render.getActorPlaybackDuration(actor(job, 'male', 'mace'), 'attack', 300)).toBe(600);
    }
    expect(render.getActorPlaybackDuration(actor('novice'), 'attack', 300)).toBeGreaterThan(600);
  });
  it('does not show an old hidden hurt midway through its sequence after an offensive pose ends', () => {
    const reaction: presentation.PresentedActorReaction = { id: 1, targetActorId: 'hero', hit: true, impact: 1300, reactionDuration: 300 };
    presentation.suppressActorReactions([reaction], 'hero', 1300, true);
    expect(reaction.reactionSuppressed).toBe(true);
    expect(presentation.presentedActorReactionAt([reaction], 'hero', 1439)).toBeUndefined();
    const later = { id: 2, targetActorId: 'hero', hit: true, impact: 1450, reactionDuration: 300 };
    presentation.suppressActorReactions([later], 'hero', 1439, true);
    expect(presentation.presentedActorReactionAt([later], 'hero', 1450)).toBe(later);
  });
  it('reconciles a newly loaded direction before painting and shifts only subsequent actor actions', () => {
    const make = (id: number, start: number, duration: number) => ({ id, actionId: `a${id}`, actionAt: start,
      sourceActorId: 'hero', actorAction: 'attack' as const, start, effectStart: start, impact: start + 300,
      actionDuration: duration, duration: 900, presented: true });
    const active = make(1, 1000, 300), queued = make(2, 1300, 300);
    const other = { ...make(3, 1300, 300), sourceActorId: 'other' };
    const marks = new Map([['hero', { actionAt: queued.actionAt, actionId: queued.actionId, id: queued.id, start: queued.start, end: 1600, presented: true }]]);
    presentation.reconcileActorPlayback([active, queued, other], marks, active, 600);
    expect(active.actionDuration).toBe(600); expect(active.impact).toBe(1600);
    expect(queued.start).toBe(1600); expect(queued.impact).toBe(1900); expect(other.start).toBe(1300);
    expect(marks.get('hero')!.end).toBe(1900);
    presentation.reconcileActorPlayback([active, queued, other], marks, active, 600);
    expect(queued.start).toBe(1600);
  });
});
