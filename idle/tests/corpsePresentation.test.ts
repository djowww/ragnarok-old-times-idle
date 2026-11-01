import { describe, expect, it } from 'vitest';
import { corpseFrameAt, startCorpsePresentation, shiftCorpsePresentation, type CorpsePresentation } from '../web/assets/corpsePresentation';
import { getActorPose } from '../web/assets/renderer';
const layer = (index: number) => ({ index, type: 0, x: 0, y: 0, mirror: false, scaleX: 1, scaleY: 1,
 rotation: 0, color: [255,255,255,255] });
const actor: any = { kind: 'monster', fallback: false, body: { sprite: { indexedCount: 4,
 frames: [0,1,2,3].map(i => ({ width:1, height:1, rgba:new Uint8ClampedArray([i,0,0,255]), type:0 })) },
 action: { actions: Array.from({length:40}, () => ({ delayMs:100,
 frames:[0,1,2,3].map(i => ({layers:[layer(i)],anchors:[]})) })) } } };
const color = (frame: {elapsed:number} | undefined) => frame ? getActorPose(actor,'dead',frame.elapsed,2)[0].image.rgba[0] : undefined;

describe('cold corpse presentation used by Scene', () => {
 it('moves the painted death clock with a later hero debut instead of returning to its last frame', () => {
  const clock:CorpsePresentation={}; startCorpsePresentation(clock,1300);
  expect(color(corpseFrameAt(clock,1300,400,true))).toBe(0);
  shiftCorpsePresentation(clock,800);
  expect(clock.deadAt).toBe(2100); expect(clock.deathPaintAt).toBe(2100);
  expect(corpseFrameAt(clock,1800,400,true)).toBeUndefined();
  expect(color(corpseFrameAt(clock,2100,400,true))).toBe(0);
  expect(color(corpseFrameAt(clock,2200,400,true))).toBe(1);
 });
 it.each(['strike', 'DOT'])('starts a %s death at its first decoded paint instead of skipping to its tail', () => {
  const clock: CorpsePresentation = {};
  startCorpsePresentation(clock,1000);
  expect(color(corpseFrameAt(clock,2200,400,true))).toBe(0);
  expect(color(corpseFrameAt(clock,2300,400,true))).toBe(1);
  expect(color(corpseFrameAt(clock,2600,400,true))).toBe(3);
  expect(color(corpseFrameAt(clock,2700,400,true))).toBe(3);
  expect(clock.deadAt).toBe(1000);
 });
 it('admits a decoded death within a fixed 2000ms deadline, then grants its complete duration', () => {
  const clock: CorpsePresentation = {};
  startCorpsePresentation(clock,1000);
  expect(clock.until).toBe(3000);
  expect(corpseFrameAt(clock,2999,2400,true)?.elapsed).toBe(0);
  expect(clock.until).toBe(5549);
  expect(corpseFrameAt(clock,5399,2400,true)?.elapsed).toBe(2400);
  expect(corpseFrameAt(clock,5550,2400,true)).toBeUndefined();
 });
 it('does not renew an unseen death on polls or revive one decoded after its admission deadline', () => {
  const clock: CorpsePresentation = {};
  startCorpsePresentation(clock,1000);
  startCorpsePresentation(clock,1500);
  expect(clock.deadAt).toBe(1000); expect(clock.until).toBe(3000);
  expect(corpseFrameAt(clock,3001,400,true)).toBeUndefined();
  expect(corpseFrameAt(clock,4000,400,true)).toBeUndefined();
  expect(clock.deathPaintAt).toBeUndefined();
 });
 it('pins Canvas for a cold native death so an old idle pose cannot consume its frames', () => {
  const clock: CorpsePresentation = {};
  startCorpsePresentation(clock,1000);
  expect(corpseFrameAt(clock,1100,400,false)).toEqual({elapsed:0,canvasOnly:true});
  expect(corpseFrameAt(clock,1200,400,true)).toEqual({elapsed:100,canvasOnly:true});
  expect(corpseFrameAt(clock,1500,400,false)).toEqual({elapsed:400,canvasOnly:true});
 });
 it('keeps impact pending and does not assign a paint clock before the terminal hit', () => {
  const clock: CorpsePresentation = {};
  startCorpsePresentation(clock,1500);
  expect(corpseFrameAt(clock,1400,400,false)).toBeUndefined();
  expect(clock.deathPaintAt).toBeUndefined();
  expect(corpseFrameAt(clock,1500,400,true)).toEqual({elapsed:0,canvasOnly:false});
 });
});
