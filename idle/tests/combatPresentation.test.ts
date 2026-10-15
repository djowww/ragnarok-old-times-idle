import { describe, expect, it } from 'vitest';
import { presentLatestActorActions as presentActions, presentedActorActionAt, movementAtAction, projectStrikeContact, targetHealthAt, movementIsWalking, autoCounterPostureAt, postureFacingPoint, resolveEffectActors } from '../web/assets/combatPresentation';
import { fixture } from './engine-fixture';
import { applyCommand, createInitialState } from '../engine/index';
import { ConnectedMapMovement, type MapProjection, type WorldPoint } from '../web/assets/mapProjection';

function cue(age = 240, motion = 300, id = 1, actionId = 'swing') {
  const start = 1000 - age;
  return { id, actionId, actionAt: start, sourceActorId: 'hero', targetActorId: 'enemy', actorAction: 'attack' as const,
    start, actionDuration: motion, impact: start + motion / 2, effectStart: start, reactionDuration: 320, duration: motion + 320 };
}

describe('combat presentation', () => {
  it('resolves incoming skill effects from the NPC caster to the player target', () => {
    const hero={x:100,ground:240,visualHeight:60},npc={x:280,ground:220,visualHeight:70};
    const endpoints=resolveEffectActors('player','ghostring','player',hero,new Map([['ghostring',npc]]),npc,hero);
    expect(endpoints).toEqual({caster:npc,target:hero});
  });
  it('projects a posture facing through the same 22x18 scene cells as battle actors', () => {
    const point = postureFacingPoint({ x: .5, y: .5 }, { x: 1, y: 1 });
    expect(point.x).toBeCloseTo(.5454545454545);
    expect(point.y).toBeCloseTo(.5555555555555);
  });
  it('holds Auto Counter weapon frame zero after the no-damage delay, releases on consumption/expiry and freezes a paused clock', () => {
    const c = fixture(), s = createInitialState(c, 0);
    c.skills.counter = { ...c.skills.firstaid, id: 'counter', sourceName: 'KN_AUTOCOUNTER' };
    s.buffs.counter = { expiresAt: 2000, effects: {}, startsAt: 1000 } as typeof s.buffs.counter;
    s.playerFacing = { x: 1, y: 0 };
    expect(autoCounterPostureAt(s, c, 1099)).toBeUndefined();
    expect(autoCounterPostureAt(s, c, 1100)).toEqual({ action: 'attack', elapsed: 0, facing: { x: 1, y: 0 } });
    expect(autoCounterPostureAt(s, c, 2000)).toBeUndefined();
    s.status = 'paused'; s.pausedAt = 1200;
    expect(autoCounterPostureAt(s, c, 5000)?.elapsed).toBe(0);
    s.pausedAt = s.lastSimulatedAt = 1050; s.pausedStatus = 'town';
    const resumed = applyCommand(s, c, { type: 'setPotions', hpThreshold: 40, spThreshold: 20 }, 5000);
    expect(autoCounterPostureAt(resumed, c, 5000)).toBeUndefined();
    expect(autoCounterPostureAt(resumed, c, 5050)?.elapsed).toBe(0);
    delete s.buffs.counter; expect(autoCounterPostureAt(s, c, 1500)).toBeUndefined();
  });
  it('keeps the walking pose during visual resumption after authoritative arrival',()=>{
    expect(movementIsWalking({world:[.5,0,.5],tangent:[2.5,0,.5]},false)).toBe(true);
    expect(movementIsWalking({world:[2.5,0,.5],tangent:[2.5,0,.5]},true)).toBe(false);
    expect(movementIsWalking(undefined,true)).toBe(true);
    expect(movementIsWalking({world:[.5,0,.5],tangent:[2.5,0,.5]},false,false)).toBe(false);
  });
  it('does not hide an immediate counter behind a later presented swing on the same target',()=>{
    const swing={...cue(0,400),hit:true,targetHpBefore:100,amount:20,impact:1300};
    const counter={...cue(0,0,2),actorAction:'none' as const,hit:true,targetHpBefore:80,amount:20,impact:1100};
    expect(targetHealthAt(60,100,[swing,counter],'enemy',1099)).toBe(100);
    expect(targetHealthAt(60,100,[swing,counter],'enemy',1200)).toBe(80);
    expect(targetHealthAt(60,100,[swing,counter],'enemy',1300)).toBe(60);
  });
  it('uses the authoritative strike origin even after both retained routes started later',()=>{
    const current={from:{x:.8,y:.7},position:{x:.9,y:.8},startedAt:1400,arrivedAt:1600};
    const previous={...current,startedAt:1200,arrivedAt:1400};
    const origin={x:.6,y:.65};
    const strike=movementAtAction(current,previous,920,origin)!;
    expect(strike.point).toEqual(origin);expect(strike.progress).toBe(1);
    expect(strike.movement.from).toEqual(origin);
    origin.x=.7;
    expect(strike.point.x).toBe(.6);
    expect(movementAtAction(current,previous,920)).toBeUndefined();
  });
  it('keeps exact health before the lethal impact, including overkill and a target absent from the current snapshot', () => {
    const hit = { ...cue(240,439), hit:true, targetHpBefore:5, targetHpAfter:0, amount:500 };
    presentActions([hit],new Map(),1000);
    expect(targetHealthAt(0,50,[hit],'enemy',1000)).toBe(5);
    expect(targetHealthAt(0,50,[hit],'enemy',1219.4)).toBe(5);
    expect(targetHealthAt(0,50,[hit],'enemy',1219.5)).toBe(0);
  });
  it('keeps each queued target health on its own impact clock', () => {
    const a={...cue(240,439,1,'a'),hit:true,targetHpBefore:50,targetHpAfter:0,amount:100};
    const b={...cue(0,439,2,'b'),hit:true,targetActorId:'other',targetHpBefore:50,targetHpAfter:49,amount:1};
    presentActions([a,b],new Map(),1000);
    expect(targetHealthAt(49,50,[a,b],'other',1219.5)).toBe(50);
    expect(targetHealthAt(49,50,[a,b],'other',1658.5)).toBe(49);
    expect(presentedActorActionAt([a,b],'hero',1100)?.targetActorId).toBe('enemy');
  });
  it('does not delay compressed history or apply another target damage, and supports older events', () => {
    const legacy={...cue(0,439),hit:true,amount:50};
    expect(targetHealthAt(0,50,[legacy],'enemy',1100)).toBe(50);
    expect(targetHealthAt(0,50,[{...legacy,presented:false}],'enemy',1100)).toBe(0);
    expect(targetHealthAt(50,50,[legacy],'other',1100)).toBe(50);
  });
  it.each([[240, 300], [340, 300], [700, 700]])('shows frame zero for a new action aged %ims with %ims motion', (age, motion) => {
    const hit = cue(age, motion);
    presentActions([hit], new Map(), 1000);
    expect(hit.start).toBe(1000);
    expect(hit.actionDuration).toBe(motion);
    expect(hit.actionAt).toBe(1000 - age);
    expect(hit.effectStart).toBe(1000);
    expect(hit.impact).toBe(1000 + motion / 2);
  });
  it('keeps a lethal target alive until the presented impact', () => {
    const hit = cue(240, 300);
    presentActions([hit], new Map(), 1000);
    const deadAt = Math.max(1000, hit.impact);
    expect(deadAt).toBe(1150);
    expect(1000 >= deadAt).toBe(false);
  });
  it('presents both live actions in order when a batch contains a lethal hit before a new target', () => {
    const old = cue(400, 300, 1, 'old');
    const latest = cue(240, 300, 2, 'latest');
    const watermarks = new Map();
    presentActions([old, latest], watermarks, 1000);
    expect(old.start).toBe(1000);
    expect(old.impact).toBe(1150);
    expect(latest.start).toBe(1300);
    expect(latest.impact).toBe(1450);
    expect(presentedActorActionAt([old, latest], 'hero', 1149)?.actionId).toBe('old');
    expect(presentedActorActionAt([old, latest], 'hero', 1299)?.actionId).toBe('old');
    expect(presentedActorActionAt([old, latest], 'hero', 1300)?.actionId).toBe('latest');
    // The lethal target stays alive during the old swing's wind-up.
    expect(1000 >= old.impact).toBe(false);
    expect(watermarks.get('hero').actionId).toBe('latest');
  });
  it('finishes a 439ms swing before a skill received 250ms later can take its body pose', () => {
    const attack = cue(250, 439, 1, 'attack');
    const watermarks = new Map();
    presentActions([attack], watermarks, 1000);
    const skill = { ...cue(61, 439, 2, 'skill'), actionAt: 1189, start: 1189,
      effectStart: 1189, impact: 1408.5, actorAction: 'skill' as const };
    presentActions([skill], watermarks, 1250);
    expect(attack.start).toBe(1000);
    expect(skill.start).toBe(1439);
    expect(skill.impact).toBe(1658.5);
    expect(skill.actionAt).toBe(1189);
    expect(skill.actionDuration).toBe(439);
    expect(presentedActorActionAt([attack, skill], 'hero', 1438)?.actionId).toBe('attack');
    expect(presentedActorActionAt([attack, skill], 'hero', 1439)?.actionId).toBe('skill');
  });
  it('compresses a catch-up batch to at most three recent actions instead of replaying a long backlog', () => {
    const batch = Array.from({ length: 8 }, (_, id) => cue(800 - id * 50, 300, id, `action-${id}`));
    presentActions(batch, new Map(), 1000);
    expect(batch.filter(hit => hit.start >= 1000)).toHaveLength(3);
    expect(batch.slice(-3).map(hit => hit.start)).toEqual([1000, 1300, 1600]);
  });
  it('bounds new waiting actions when the actor already has a long visual motion', () => {
    const long = cue(100, 2000, 1, 'long');
    const marks = new Map();
    presentActions([long], marks, 1000);
    const next = cue(0, 300, 2, 'next');
    next.actionAt = 1100; next.start = 1100; next.effectStart = 1100; next.impact = 1250;
    presentActions([next], marks, 1100);
    // It is compressed rather than queued almost two seconds into the future.
    expect(next.start).toBe(1100);
    expect((next as typeof next & { presented?: boolean }).presented).toBe(false);
  });
  it('shares one presentation clock across AoE targets and later duplicate events', () => {
    const first = cue();
    const second = { ...first, id: 2, targetActorId: 'other' };
    const watermarks = new Map();
    presentActions([first, second], watermarks, 1000);
    expect(first.start).toBe(1000);
    expect(second.start).toBe(first.start);
    const duplicate = cue();
    presentActions([duplicate], watermarks, 1100);
    expect(duplicate.start).toBe(1000);
    expect(duplicate.impact).toBe(first.impact);
    expect(watermarks.get('hero').id).toBe(2);
  });
  it('keeps a late AoE sibling on the earlier queued action even after a newer action is received', () => {
    const first = cue(240, 439, 1, 'first');
    const next = cue(100, 439, 2, 'next');
    const marks = new Map();
    presentActions([first, next], marks, 1000);
    const late = { ...cue(340, 439, 3, 'first'), actionAt: first.actionAt, start: 760,
      effectStart: 760, impact: 979.5, targetActorId: 'another-mob' };
    presentActions([late], marks, 1100, [first, next]);
    expect(late.start).toBe(1000);
    expect(late.impact).toBe(1219.5);
    expect(marks.get('hero').actionId).toBe('next');
    expect(presentedActorActionAt([first, next, late], 'hero', 1100)?.actionId).toBe('first');
  });
  it('leaves passive effect ticks and stale actions on their original clocks', () => {
    const stale = cue(2400);
    const tick = { ...cue(), sourceActorId: 'effect', actorAction: 'none' as const };
    presentActions([stale, tick], new Map(), 1000);
    expect(stale.start).toBe(-1400);
    expect(tick.start).toBe(760);
    expect(tick.effectStart).toBe(760);
  });
  it.each([1000, 2500])('holds the strike at completed contact rather than the previous far rendered position after receiving at %ims', (receivedAt) => {
    const previousChase = { from: { x: .48, y: .65 }, position: { x: .75, y: .65 }, startedAt: 500, arrivedAt: 920 };
    const nextChase = { from: { x: .75, y: .65 }, position: { x: .9, y: .65 }, startedAt: 1359, arrivedAt: 2000 };
    const hit = { ...cue(receivedAt - 920, 439), actionAt: 920, start: 920, effectStart: 920, impact: 1139.5 };
    const strike = movementAtAction(nextChase, previousChase, hit.actionAt)!;
    expect(strike.point).toEqual({ x: .75, y: .65 });
    expect(strike.progress).toBe(1);
    presentActions([hit], new Map(), receivedAt);
    expect(hit.start).toBe(receivedAt);
    expect(hit.impact).toBe(receivedAt + 219.5);
  });
  it('finishes the previous connected chase before a stationary attack snapshot owns the native pose', () => {
    const camera: MapProjection = { map: 'fixture', modelView: [], projection: [], focus: [.5, 0, .5],
      ground: { x: 0, y: 0, size: 3, heights: Array(9).fill(0), walkable: Array(9).fill(1) }, viewport: { width: 100, height: 100 } };
    const router = new ConnectedMapMovement();
    const previous = { from: { x: .5, y: .5 }, position: { x: 2.5, y: .5 }, startedAt: 500, arrivedAt: 920 };
    const stationary = { from: previous.position, position: previous.position, startedAt: 920, arrivedAt: 920 };
    const key = (movement: typeof previous) => JSON.stringify([movement.startedAt, movement.arrivedAt, movement.from, movement.position]);
    const world = (point: { x: number; y: number }): WorldPoint => [point.x, 0, point.y];
    expect(router.project(camera, 'hero', key(previous), world(previous.from), world(previous.position), .25).world).toEqual([1, 0, .5]);
    const strike = movementAtAction(stationary, previous, 920)!;
    expect(router.project(camera, 'hero', key(strike.movement), world(strike.movement.from), world(strike.movement.position), strike.progress).world).toEqual([2.5, 0, .5]);
  });
  it.each([{ walkable: Array(9).fill(1), expectedX: 2.5 }, { walkable: [1, 0, 1, 0, 0, 0, 0, 0, 0], expectedX: .5 }])('routes a stationary strike contact through the existing reachable GAT component', ({walkable, expectedX}) => {
    const camera: MapProjection = { map: 'fixture', modelView: [], projection: [], focus: [.5, 0, .5],
      ground: { x: 0, y: 0, size: 3, heights: Array(9).fill(0), walkable }, viewport: { width: 100, height: 100 } };
    const router = new ConnectedMapMovement();
    const lastWorld: WorldPoint = [.5, 0, .5];
    router.project(camera, 'hero', 'previous', lastWorld, lastWorld, 1);
    const current = { from: { x: 2.5, y: .5 }, position: { x: 2.5, y: .5 }, startedAt: 920, arrivedAt: 920 };
    const strike = movementAtAction(current, undefined, 920)!;
    const contact = projectStrikeContact(router, camera, 'hero', 'attack', strike, [2.5, 0, .5], [2.5, 0, .5], lastWorld);
    expect(contact).toEqual([expectedX, 0, .5]);
  });
});
