import { describe, expect, it } from 'vitest';
import { compressStaleActorActionBacklog, presentedActorActionAt, targetHealthAt } from '../web/assets/combatPresentation';

type Cue = { id: number; actionId: string; actionAt: number; sourceActorId: string; targetActorId: string;
  actorAction: 'attack' | 'skill'; skill?: { kind: 'physical' | 'magical' | 'heal' | 'buff' | 'passive' | 'steal'; sourceName: string }; start: number; effectStart: number; impact: number;
  actionDuration: number; duration: number; presented: boolean; hit: boolean; targetHpBefore: number; amount: number; bodySuppressed?: boolean };
const cue = (id: number, actionId: string, actionAt: number, start: number): Cue => ({
  id, actionId, actionAt, sourceActorId: 'hero', targetActorId: `mob-${id}`,
  actorAction: 'attack' as const, start, effectStart: start, impact: start + 220,
  actionDuration: 440, duration: 700, presented: true, hit: true,
  targetHpBefore: 100, amount: 10,
});

describe('combat presentation backlog', () => {
  it('finishes the visible swing, compresses stale queued poses and retains all impacts', () => {
    const active = cue(1, 'active', 1_000, 900);
    const old = cue(2, 'old', 1_100, 2_000);
    const middle = cue(3, 'middle', 1_500, 4_000);
    const latest = cue(4, 'latest', 2_000, 9_000);
    const cues = [active, old, middle, latest];

    compressStaleActorActionBacklog(cues, new Map(), 'hero', 1_000, true, 900);

    expect(active.bodySuppressed).not.toBe(true);
    expect(old.bodySuppressed).toBe(true);
    expect(middle.bodySuppressed).toBe(true);
    expect(latest.bodySuppressed).not.toBe(true);
    expect(latest.start).toBe(1_340);
    expect(latest.impact).toBe(1_560);
    expect(cues).toHaveLength(4);
    expect(cues.map(entry => entry.amount)).toEqual([10, 10, 10, 10]);
    expect(old.presented).toBe(true);
    expect(targetHealthAt(50, 100, cues, 'mob-2', 2_000)).toBe(60);
  });

  it('does not replay a prior source action after the current route supersedes it', () => {
    const older = cue(1, 'older', 1_000, 1_700);
    const newer = cue(2, 'newer', 2_000, 1_200);
    const cues = [newer, older];
    compressStaleActorActionBacklog(cues, new Map(), 'hero', 1_300, true, 1_500);
    expect(older.bodySuppressed).toBe(true);
    expect(presentedActorActionAt(cues, 'hero', 1_300)?.actionId).toBe('newer');
  });

  it('keeps standalone First Aid and orders its pose around weapon swings', () => {
    const heal = { ...cue(1, 'first-aid', 1_000, 1_000), actorAction: 'skill' as const,
      targetActorId: 'hero', skill: { kind: 'heal' as const, sourceName: 'NV_FIRSTAID' }, actionDuration: 498 };
    const onlyHeal = { ...heal };
    compressStaleActorActionBacklog([onlyHeal], new Map(), 'hero', 1_100, false, 0);
    expect(onlyHeal.bodySuppressed).not.toBe(true);

    const oldHeal = { ...heal };
    const laterAttack = cue(2, 'attack', 1_200, 1_200);
    const healThenAttack = [oldHeal, laterAttack];
    compressStaleActorActionBacklog(healThenAttack, new Map(), 'hero', 1_300, false, 0);
    expect(oldHeal.bodySuppressed).toBe(true);
    expect(healThenAttack.every(entry => entry.presented)).toBe(true);

    const earlierAttack = cue(3, 'attack', 1_200, 1_200);
    const laterHeal = { ...heal, id: 4, actionId: 'later-first-aid', actionAt: 1_300, start: 1_300 };
    const attackThenHeal = [earlierAttack, laterHeal];
    compressStaleActorActionBacklog(attackThenHeal, new Map(), 'hero', 1_300, false, 0);
    expect(laterHeal.bodySuppressed).not.toBe(true);
    expect(presentedActorActionAt(attackThenHeal, 'hero', 1_300)?.actionId).toBe('attack');
    expect(presentedActorActionAt(attackThenHeal, 'hero', 1_650)?.actionId).toBe('later-first-aid');
    expect(attackThenHeal.every(entry => entry.presented)).toBe(true);
  });

  it('suppresses stationary source-old poses that would otherwise start after a newer action', () => {
    const newer = cue(1, 'newer', 2_000, 1_200);
    const older = cue(2, 'older', 1_000, 1_700);
    const cues = [older, newer];
    compressStaleActorActionBacklog(cues, new Map(), 'hero', 1_300, false, 0);
    expect(older.bodySuppressed).toBe(true);
    expect(presentedActorActionAt(cues, 'hero', 1_300)?.actionId).toBe('newer');
  });

  it('does not compress a short queue and supports stationary actors', () => {
    const first = cue(1, 'first', 1_000, 1_000);
    const second = cue(2, 'second', 1_100, 1_500);
    const cues = [first, second];
    compressStaleActorActionBacklog(cues, new Map(), 'hero', 1_100, true, 900);
    expect(second.bodySuppressed).not.toBe(true);
    compressStaleActorActionBacklog(cues, new Map(), 'hero', 1_100, false, 900);
    expect(first.bodySuppressed).not.toBe(true);
  });
});
