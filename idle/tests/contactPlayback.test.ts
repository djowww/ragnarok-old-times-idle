import { describe, expect, it } from 'vitest';
import * as render from '../web/assets/renderer';
import * as presentation from '../web/assets/combatPresentation';
import type { WeaponAppearance } from '../web/assets/weapon';

function actor(job: string, weapon?: WeaponAppearance['type'], count = 12) {
  const image = { width: 1, height: 1, type: 0 as const, rgba: new Uint8ClampedArray([255, 0, 0, 255]) };
  const layer = { x: 0, y: 0, index: 0, mirror: false, color: [255, 255, 255, 255] as [number, number, number, number],
    scaleX: 1, scaleY: 1, rotation: 0, type: 0, width: 0, height: 0 };
  const part = { sprite: { version: 2.1, indexedCount: 1, frames: [image] }, action: { version: 2.5, sounds: [],
    actions: Array.from({ length: 104 }, () => ({ delayMs: 100,
      frames: Array.from({ length: count }, (_, i) => ({ layers: [{ ...layer, x: i }], anchors: [], sound: -1 })) })) } };
  return { kind: 'character' as const, fallback: false, identity: { job, gender: 'male' as const }, body: part, head: part,
    weapon: weapon ? part : undefined, weaponTrail: weapon ? part : undefined,
    weaponVisual: weapon ? { type: weapon, job, gender: 'male' as const } : undefined };
}

function cue(id: number, actionId: string, job: string, motionMs: number, start = 1000, weapon?: WeaponAppearance['type']) {
  return { id, actionId, actionAt: start, sourceActorId: 'hero', targetActorId: `mob-${id}`,
    actorAction: 'attack' as const, start, effectStart: start, impact: start + motionMs,
    actionDuration: render.getActorPlaybackDuration(actor(job, weapon), 'attack', motionMs),
    motionMs, duration: motionMs, reactionDuration: 0, presented: true, hit: true, targetHpBefore: 30, amount: 30 };
}

describe('contact-aligned combat playback', () => {
  it('spreads short attack ACTs through server contact across jobs, weapons and directions', () => {
    const examples: { job: string; weapon?: WeaponAppearance['type']; frames: number }[] = [
      { job: 'monk', frames: 5 },
      { job: 'swordsman', weapon: 'sword', frames: 4 },
      { job: 'novice', frames: 3 },
      { job: 'assassin', weapon: 'katar', frames: 2 },
    ];
    for (const { job, weapon, frames } of examples) {
      const value = actor(job, weapon, frames);
      for (const motionMs of [300, 900]) for (let direction = 0; direction < 8; direction++) {
        expect(render.getActorPlaybackDuration(value, 'attack', motionMs, direction)).toBe(motionMs);
        expect(render.getActorPose(value, 'attack', motionMs * (frames - 1) / frames - 0.001,
          direction, motionMs)[0]?.x).toBe(frames - 2);
        expect(render.getActorPose(value, 'attack', motionMs - 0.001, direction, motionMs)[0]?.x)
          .toBe(frames - 1);
      }
    }
  });

  it.each(['monk', 'champion'])('%s unarmed attacks keep the final ACT frame through impact in every direction at 300ms and 900ms', job => {
    const value = actor(job);
    for (const motionMs of [300, 900]) for (let direction = 0; direction < 8; direction++) {
      const hit = cue(direction + 1, `${job}-${motionMs}-${direction}`, job, motionMs);
      const marks = new Map();
      presentation.presentLatestActorActions([hit], marks, hit.start);
      const nativeDuration = render.getActorPlaybackDuration(value, 'attack', motionMs, direction);
      expect(nativeDuration).toBe(motionMs);
      presentation.reconcileActorPlayback([hit], marks, hit, nativeDuration);

      expect(hit.actionDuration).toBe(motionMs);
      expect(presentation.presentedActorActionAt([hit], 'hero', hit.impact - 0.001)).toBe(hit);
      expect(render.getActorPose(value, 'attack', motionMs - 0.001, direction, motionMs).map(layer => layer.x))
        .toEqual([4, 4]);
      expect(presentation.presentedActorActionAt([hit], 'hero', hit.impact)).toBeUndefined();
      expect(presentation.targetHealthAt(0, 30, [hit], hit.targetActorId, hit.impact - 0.001)).toBe(30);
      expect(presentation.targetHealthAt(0, 30, [hit], hit.targetActorId, hit.impact)).toBe(0);
      expect(marks.get('hero')?.end).toBe(hit.impact);
    }
  });

  it.each([
    { job: 'swordsman', weapon: 'sword' as const, motionMs: 300, expected: 600 },
    { job: 'assassin', weapon: 'katar' as const, motionMs: 300, expected: 1200 },
  ])('$job/$weapon aligns hit contact with the pinned ACT playback', ({ job, weapon, motionMs, expected }) => {
    const value = actor(job, weapon);
    const hit = cue(1, 'armed', job, motionMs, 1000, weapon);
    const marks = new Map();
    presentation.presentLatestActorActions([hit], marks, hit.start);
    const nativeDuration = render.getActorPlaybackDuration(value, 'attack', motionMs, 0);
    expect(nativeDuration).toBe(expected);
    presentation.reconcileActorPlayback([hit], marks, hit, nativeDuration);
    expect(hit.actionDuration).toBe(expected);
    expect(hit.impact).toBe(hit.start + expected);
    expect(presentation.presentedActorActionAt([hit], 'hero', hit.impact - 0.001)).toBe(hit);
    expect(render.getActorPose(value, 'attack', nativeDuration - 0.001, 0, motionMs)[0]?.x).toBe(11);
    expect(presentation.presentedActorActionAt([hit], 'hero', hit.start + expected)).toBeUndefined();
  });

  it('extends an AoE contact once, shifts later queued actions and watermarks, and keeps late siblings and health on the impact clock', () => {
    // Simulate a cue queued with a stale, shorter playback estimate before ACT decoding.
    const first = { ...cue(1, 'aoe', 'monk', 300), actionDuration: 250, duration: 250 };
    const sibling = { ...first, id: 2, targetActorId: 'mob-2' };
    const next = { ...cue(3, 'next', 'monk', 300, 1250), actionDuration: 300 };
    const otherActor = { ...cue(4, 'other', 'monk', 300, 1250), sourceActorId: 'other' };
    const marks = new Map([['hero', { actionAt: 1250, actionId: 'next', id: 3, start: 1250, end: 1550, presented: true }]]);
    const cues = [first, sibling, next, otherActor];
    const nativeDuration = render.getActorPlaybackDuration(actor('monk'), 'attack', 300, 0);
    expect(nativeDuration).toBe(300);
    presentation.reconcileActorPlayback(cues, marks, first, nativeDuration);

    expect(first.actionDuration).toBe(300);
    expect(sibling.actionDuration).toBe(300);
    expect(first.impact).toBe(1300);
    expect(sibling.impact).toBe(1300);
    expect(next.start).toBe(1300);
    expect(next.impact).toBe(1600);
    expect(otherActor.start).toBe(1250);
    expect(marks.get('hero')).toMatchObject({ actionId: 'next', start: 1300, end: 1600 });
    expect(presentation.targetHealthAt(0, 30, cues, first.targetActorId, 1299.999)).toBe(30);
    expect(presentation.targetHealthAt(0, 30, cues, first.targetActorId, 1300)).toBe(0);

    const lateSibling = { ...first, id: 5, targetActorId: 'mob-late', start: 760, effectStart: 760, impact: 1060 };
    presentation.presentLatestActorActions([lateSibling], marks, 1100, cues);
    expect(lateSibling.start).toBe(first.start);
    expect(lateSibling.impact).toBe(first.impact);
    expect(lateSibling.actionDuration).toBe(300);
    expect(presentation.targetHealthAt(0, 30, [lateSibling], 'mob-late', 1299.999)).toBe(30);
    expect(presentation.targetHealthAt(0, 30, [lateSibling], 'mob-late', 1300)).toBe(0);

    const lateMarkSibling = { ...lateSibling, id: 6, start: 760, effectStart: 760, impact: 1060,
      actionDuration: 250, duration: 250 };
    const activeMark = { actionAt: first.actionAt, actionId: first.actionId, id: first.id, start: first.start,
      end: first.start + 250, presented: true };
    const lateMarks = new Map([['hero', activeMark]]);
    presentation.presentLatestActorActions([lateMarkSibling], lateMarks, 1100);
    expect(lateMarkSibling.actionDuration).toBe(300);
    expect(lateMarks.get('hero')?.end).toBe(first.start + 300);
  });

  it('keeps Bash damage and death on the weapon swing contact', () => {
    const motionMs = 388, start = 1000;
    const value = actor('knight', 'sword', 9);
    const visualAction = render.getCombatActorAction('skill', 'SM_BASH');
    expect(visualAction).toBe('attack');
    const duration = render.getActorPlaybackDuration(value, visualAction, motionMs);
    expect(duration).toBe(582);
    const impact = presentation.actorActionImpactAt({
      actorAction: 'skill', visualActorAction: 'attack', start, effectStart: start,
      actionDuration: duration, motionMs,
    });
    expect(impact).toBe(start + duration);
    const hit = { id: 1, targetActorId: 'mob', hit: true, impact,
      targetHpBefore: 30, amount: 30, presented: true };
    expect(presentation.targetHealthAt(0, 30, [hit], 'mob', impact - 0.001)).toBe(30);
    expect(presentation.targetHealthAt(0, 30, [hit], 'mob', impact)).toBe(0);
    expect(render.getCombatActorAction('skill', 'KN_BRANDISHSPEAR')).toBe('attack');
    const castFinishedAt = start + 800;
    expect(presentation.actorActionImpactAt({
      actorAction: 'skill', visualActorAction: 'attack', start: castFinishedAt,
      effectStart: castFinishedAt, actionDuration: duration, motionMs,
    })).toBe(castFinishedAt + duration);
    expect(presentation.actorActionImpactAt({
      actorAction: 'skill', visualActorAction: 'skill', start, effectStart: start,
      actionDuration: duration, motionMs,
    })).toBe(start + duration / 2);
  });

  it('moves a late-decoded Bash flash with contact without shifting spell or falcon FX', () => {
    const physical = { id: 1, actionId: 'bash', actionAt: 1000, sourceActorId: 'hero',
      actorAction: 'skill' as const, visualActorAction: 'attack' as const,
      skill: { kind: 'physical' as const }, start: 1000, effectStart: 1388,
      impact: 1388, actionDuration: 388, duration: 1588, motionMs: 388, presented: true };
    const spell = { ...physical, id: 2, actionId: 'spell', sourceActorId: 'mage',
      visualActorAction: 'skill' as const, skill: { kind: 'magical' as const }, effectStart: 1000 };
    const falcon = { ...physical, id: 3, actionId: 'falcon', sourceActorId: 'falcon',
      actorAction: 'none' as const, visualActorAction: undefined, effectStart: 1100 };
    const cues = [physical, spell, falcon];
    const marks = new Map([['hero', { actionAt: 1000, actionId: 'bash', id: 1,
      start: 1000, end: 1388, presented: true }]]);
    presentation.reconcileActorPlayback(cues, marks, physical, 582);
    presentation.reconcileActorPlayback(cues, new Map(), spell, 582);
    presentation.reconcileActorPlayback(cues, new Map(), falcon, 582);
    expect(physical.impact).toBe(1582);
    expect(physical.effectStart).toBe(1582);
    expect(physical.duration).toBe(1782);
    expect(spell.effectStart).toBe(1000);
    expect(falcon.effectStart).toBe(1100);
  });

  it('moves a late-decoded Bash hit to the end of its attack ACT', () => {
    const late = { id: 1, actionId: 'bash', actionAt: 1000, sourceActorId: 'hero',
      actorAction: 'skill' as const, visualActorAction: 'attack' as const, start: 1000, effectStart: 1000,
      impact: 1388, actionDuration: 388, duration: 708, presented: true };
    const marks = new Map([['hero', { actionAt: late.actionAt, actionId: late.actionId,
      id: late.id, start: late.start, end: late.start + late.actionDuration, presented: true }]]);
    presentation.reconcileActorPlayback([late], marks, late, 582);
    expect(late.actionDuration).toBe(582);
    expect(late.impact).toBe(1582);
    expect(marks.get('hero')?.end).toBe(1582);
  });

  it('aligns attack contact and monster death with the end of a longer decoded ACT', () => {
    const hit = cue(1, 'swordsman-contact', 'swordsman', 300, 1000, 'sword');
    expect(hit.actionDuration).toBe(600);
    expect(presentation.actorActionImpactAt(hit)).toBe(1600);
  });
  it('keeps the target reaction visible through the late-decoded attack ACT tail', () => {
    const hit = cue(1, 'late-swordsman-contact', 'swordsman', 300, 1000, 'sword');
    hit.actionDuration = 300;
    hit.reactionDuration = 320;
    hit.impact = hit.start + 300;
    const marks = new Map([['hero', { actionAt: hit.actionAt, actionId: hit.actionId,
      id: hit.id, start: hit.start, end: hit.start + 300, presented: true }]]);
    const moved = presentation.reconcileActorPlayback([hit], marks, hit, 600);
    expect(moved.get(hit.id)).toBe(300);
    expect(hit.actionDuration).toBe(600);
    expect(hit.impact).toBe(1600);
    const reactionAt = 1900;
    const retained = [hit].filter(cue => cue.start + (cue.duration ?? 0) > reactionAt);
    expect(presentation.presentedActorReactionAt(retained, hit.targetActorId, reactionAt)).toBe(hit);
  });

  it('keeps server motion contact with a short decoded attack ACT', () => {
    const hit = cue(1, 'monk-contact', 'monk', 300, 1000);
    expect(hit.actionDuration).toBe(300);
    expect(presentation.actorActionImpactAt(hit)).toBe(1300);
  });

  it('ignores non-finite or non-positive decoded playback durations without corrupting contact clocks', () => {
    for (const duration of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0, -1]) {
      const hit = cue(1, `invalid-${duration}`, 'monk', 300);
      const mark = { actionAt: hit.actionAt, actionId: hit.actionId, id: hit.id, start: hit.start, end: hit.start + hit.actionDuration, presented: true };
      const marks = new Map([['hero', mark]]);
      const before = { ...hit };
      expect(presentation.reconcileActorPlayback([hit], marks, hit, duration).size).toBe(0);
      expect(hit).toEqual(before);
      expect(mark.end).toBe(before.start + before.actionDuration);
    }
    const invalidImpact = cue(9, 'invalid-impact', 'monk', 300);
    invalidImpact.impact = Number.POSITIVE_INFINITY;
    const marks = new Map();
    presentation.presentLatestActorActions([invalidImpact], marks, invalidImpact.start);
    expect(invalidImpact.actionDuration).toBe(300);
    expect(marks.get('hero')?.end).toBe(invalidImpact.start + 300);
  });
  it('does not shorten decoded playback when only the action watermark remains', () => {
    const hit = cue(1, 'long-armed', 'assassin', 300, 1000, 'katar');
    const marks = new Map([['hero', { actionAt: hit.actionAt, actionId: hit.actionId,
      id: 1, start: 1000, end: 2200, presented: true }]]);
    const late = { ...hit, id: 2, actionDuration: 300 };
    presentation.presentLatestActorActions([late], marks, 1200);
    expect(late.actionDuration).toBe(1200);
    expect(marks.get('hero')?.end).toBe(2200);
  });

  it('extends retained contact before the already queued next swing', () => {
    const first = { ...cue(1, 'long-contact', 'monk', 300), actionDuration: 300 };
    const next = { ...cue(2, 'next', 'monk', 300, 1300), actionDuration: 300 };
    const marks = new Map([['hero', { actionAt: next.actionAt, actionId: next.actionId,
      id: next.id, start: 1300, end: 1600, presented: true }]]);
    const late = { ...first, id: 3, targetActorId: 'mob-late', impact: 1900 };
    const moved = presentation.presentLatestActorActions([late], marks, 1100, [first, next]);
    expect(first.actionDuration).toBe(900);
    expect(late.actionDuration).toBe(900);
    expect(next.start).toBe(1900);
    expect(next.impact).toBe(2200);
    expect(marks.get('hero')).toMatchObject({ actionId: 'next', start: 1900, end: 2200 });
    expect(moved?.get(next.id)).toBe(600);
  });

});

describe('visual skill effect timing', () => {
  it('waits for the weapon contact on Bash and Brandish Spear', () => {
    const cue = { actorAction: 'skill' as const, visualActorAction: 'attack' as const,
      skillKind: 'physical' as const, effectStart: 1000, impact: 1582 };
    expect(presentation.skillVisualEffectAt(cue)).toBe(1582);
    expect(presentation.skillVisualEffectAt({ ...cue, impact: 900 })).toBe(1000);
  });

  it('keeps spell and nonweapon effects on their original timeline', () => {
    const cue = { actorAction: 'skill' as const, visualActorAction: 'skill' as const,
      skillKind: 'magical' as const, effectStart: 1000, impact: 1582 };
    expect(presentation.skillVisualEffectAt(cue)).toBe(1000);
    expect(presentation.skillVisualEffectAt({ ...cue, skillKind: 'physical' })).toBe(1000);
  });
});
