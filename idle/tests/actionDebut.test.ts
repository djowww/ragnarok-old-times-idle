import { describe, expect, it } from 'vitest';
import { ActionTextureStartup, presentLatestActorActions, presentedActorActionAt, targetHealthAt } from '../web/assets/combatPresentation';

const cue = (id = 1, actionId = 'first', start = 1000, actor = 'hero') => ({ id, actionId, actionAt: start,
 sourceActorId: actor, targetActorId: 'enemy', actorAction: 'attack' as const, start, effectStart: start,
 impact: start + 219.5, actionDuration: 439, duration: 759, presented: true, hit: true, targetHpBefore: 50, amount: 50 });

describe('first useful combat frame', () => {
 it('selects and starts a fresh unseen swing even when the first RAF is after its scheduled end', () => {
  const hit = cue(), gate = new ActionTextureStartup(), marks = new Map();
  // Reproduces the current Scene selection before the startup gate can run.
  expect(presentedActorActionAt([hit], 'hero', 1450)).toBeUndefined();
  const debut = gate.debut([hit], marks, 'hero', 1450);
  expect(debut.active).toBe(hit); expect(hit.start).toBe(1450); expect(debut.moved.get(hit.id)).toBe(450);
  expect(gate.debutDelayFor(hit)).toBe(450);
  expect(hit.actionAt).toBe(1000); expect(hit.actionDuration).toBe(439);
  expect(targetHealthAt(0, 50, [hit], 'enemy', 1450)).toBe(50);
  expect(targetHealthAt(0, 50, [hit], 'enemy', 1669.5)).toBe(0);
  expect(presentedActorActionAt([hit], 'hero', 1450)).toBe(hit);
 });
 it('retains an unseen cue through the existing 1200ms map-arrival curtain, then debuts at frame zero', () => {
  const hit = cue(), gate = new ActionTextureStartup();
  expect(hit.start + hit.duration < 2200).toBe(true);
  expect(gate.hasPendingDebut(hit, 2200)).toBe(true);
  expect(gate.debut([hit], new Map(), 'hero', 2200).active).toBe(hit);
  expect(hit.start).toBe(2200); expect(hit.impact).toBe(2419.5);
 });
 it('does not replay an action already debuted when a later render gap passes its end', () => {
  const hit = cue(), gate = new ActionTextureStartup();
  expect(gate.debut([hit], new Map(), 'hero', 1000).active).toBe(hit);
  expect(gate.hasPendingDebut(hit, 1200)).toBe(false);
  expect(gate.debut([hit], new Map(), 'hero', 1450).active).toBeUndefined();
  expect(hit.start).toBe(1000);
 });
 it('shifts AoE siblings, the queued actor and watermark once, leaving DOT and other actors independent', () => {
  const hit = cue(), sibling = { ...hit, id: 2, targetActorId: 'other' }, next = cue(3, 'next', 1100),
   dot = { ...cue(4, 'dot', 1020), actorAction: 'none' as const }, enemy = cue(5, 'incoming', 1000, 'mob');
  const batch = [hit, sibling, next, dot, enemy], marks = new Map(), gate = new ActionTextureStartup();
  presentLatestActorActions(batch, marks, 1000);
  const debut = gate.debut(batch, marks, 'hero', 1100);
  expect(debut.moved.size).toBe(3); expect(hit.start).toBe(1100); expect(sibling.start).toBe(1100);
  expect(next.start).toBe(1539); expect(dot.start).toBe(1020); expect(enemy.start).toBe(1000);
  expect(marks.get('hero')).toMatchObject({ start: 1539, end: 1978 });
  expect(gate.debut(batch, marks, 'hero', 1150).moved.size).toBe(0);
  expect(gate.debut(batch, marks, 'hero', 1150).active).toBe(hit);
 });
 it('shares a debut with a late AoE sibling and does not restart it after another event arrives', () => {
  const hit = cue(), marks = new Map(), gate = new ActionTextureStartup();
  presentLatestActorActions([hit], marks, 1000); gate.debut([hit], marks, 'hero', 1100);
  const late = { ...cue(2), targetActorId: 'other' }; presentLatestActorActions([late], marks, 1200, [hit]);
  expect(late.start).toBe(1100); expect(gate.hasPendingDebut(late, 1200)).toBe(false);
  expect(gate.debut([hit, late], marks, 'hero', 1200).moved.size).toBe(0);
 });
 it('compresses stale, unpresented and independent effects instead of replaying reconnection history', () => {
  const gate = new ActionTextureStartup(), stale = cue(), compressed = { ...cue(2, 'compressed'), presented: false },
   dot = { ...cue(3, 'dot'), actorAction: 'none' as const };
  expect(gate.hasPendingDebut(stale, 3001)).toBe(false);
  expect(gate.debut([stale], new Map(), 'hero', 3001).active).toBeUndefined();
  expect(gate.debut([compressed, dot], new Map(), 'hero', 1100).active).toBeUndefined();
  expect(stale.start).toBe(1000);
 });
 it('separates first-frame delay from the 450ms native texture budget', () => {
  const hit = cue(), marks = new Map(), gate = new ActionTextureStartup();
  gate.debut([hit], marks, 'hero', 2200); gate.hold([hit], marks, hit, 2200, false);
  expect(hit.start).toBe(2200); expect(gate.waitedFor(hit)).toBe(0);
  gate.hold([hit], marks, hit, 2240, false); gate.hold([hit], marks, hit, 2300, true);
  expect(hit.start).toBe(2300); expect(gate.waitedFor(hit)).toBe(100);
  expect(gate.debut([hit], marks, 'hero', 2350).moved.size).toBe(0);
  expect(hit.start).toBe(2300);
 });
});
