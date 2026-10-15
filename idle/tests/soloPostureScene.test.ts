import { describe, expect, it } from 'vitest';
import * as view from '../web/assets/combatPresentation';
import { ownCast } from './cast-control-fixture';

describe('solo posture body ownership', () => {
  it('presents Play Dead as the death pose without changing real HP, including while paused', () => {
    expect(view).toHaveProperty('soloPostureAt');
    const { s, c } = ownCast();
    c.skills.nv_trickdead = { ...c.skills.fire_bolt, id: 'nv_trickdead', sourceName: 'NV_TRICKDEAD' };
    s.buffs.nv_trickdead = { startsAt: 50, expiresAt: Number.MAX_SAFE_INTEGER, effects: {} };
    const hp = s.hp;
    expect((view as any).soloPostureAt(s, c, 100)).toEqual({ playDead: true, castWalking: false });
    s.status = 'paused'; s.pausedAt = 100;
    expect((view as any).soloPostureAt(s, c, 2000).playDead).toBe(true);
    expect(s.hp).toBe(hp);
  });
  it('allows only learned Free Cast walking within its original cast window', () => {
    expect(view).toHaveProperty('soloPostureAt');
    const { s, c } = ownCast();
    c.skills.sa_freecast = { ...c.skills.fire_bolt, id: 'sa_freecast', sourceName: 'SA_FREECAST', kind: 'passive', maxLevel: 10, implementation: 'supported' };
    c.classes.sage.skills.push('sa_freecast'); s.learnedSkills.sa_freecast = 1;
    const cast = structuredClone(s.battle!.cast);
    expect((view as any).soloPostureAt(s, c, 999)).toEqual({ playDead: false, castWalking: true });
    expect((view as any).soloPostureAt(s, c, 1000).castWalking).toBe(false);
    delete s.learnedSkills.sa_freecast;
    expect((view as any).soloPostureAt(s, c, 500).castWalking).toBe(false);
    expect(s.battle!.cast).toEqual(cast);
  });
  it('retires only older own body poses and their queue lock, preserving impact, loot and other actors', () => {
    expect(view).toHaveProperty('retireTrickDeadPoses');
    const cues = [
      { id: 1, actionId: 'old', sourceActorId: 'hero', actionAt: 80, actorAction: 'attack', impact: 120, amount: 9 },
      { id: 2, actionId: 'cast', sourceActorId: 'hero', actionAt: 100, actorAction: 'skill', impact: 150, amount: 0 },
      { id: 3, actionId: 'other', sourceActorId: 'enemy', actionAt: 80, actorAction: 'attack', impact: 130, amount: 4 },
      { id: 6, actionId: 'after-standing', sourceActorId: 'hero', actionAt: 100, actorAction: 'attack', impact: 140, amount: 8 },
    ];
    const marks = new Map([['hero', { id: 2, actionId: 'cast', actionAt: 100, start: 10, end: 999, presented: true }]]);
    const events = [{ id: 4, kind: 'posture', statusName: 'NV_TRICKDEAD', sourceActorId: 'hero', at: 100 }];
    (view as any).retireTrickDeadPoses(cues, events, marks, 200);
    expect(cues.map(c => c.actorAction)).toEqual(['none', 'none', 'attack', 'attack']);
    expect(cues.map(c => [c.impact, c.amount])).toEqual([[120,9],[150,0],[130,4],[140,8]]);
    expect(marks.get('hero')?.end).toBe(200);
    expect(cues).toHaveLength(4); expect(events).toHaveLength(1);
  });
  it('ignores stand-up and unrelated posture events without retiring a newer queue owner', () => {
    expect(view).toHaveProperty('retireTrickDeadPoses');
    const cues = [{ id: 9, actionId: 'new', sourceActorId: 'hero', actionAt: 101, actorAction: 'attack' }];
    const marks = new Map([['hero', { ...cues[0], start: 0, end: 999, presented: true }]]);
    (view as any).retireTrickDeadPoses(cues, [
      { id: 4, kind: 'posture-ended', statusName: 'NV_TRICKDEAD', sourceActorId: 'hero', at: 100 },
      { id: 5, kind: 'posture', statusName: 'KN_AUTOCOUNTER', sourceActorId: 'hero', at: 100 },
      { id: 6, kind: 'posture', statusName: 'NV_TRICKDEAD', sourceActorId: 'hero', at: 100 },
    ], marks, 200);
    expect(cues[0].actorAction).toBe('attack'); expect(marks.get('hero')?.end).toBe(999);
  });
});
