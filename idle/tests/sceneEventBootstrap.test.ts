import { describe, expect, it } from 'vitest';
import { selectSceneEventBatch, type SceneBootstrapEvent, type SceneEventCursor, type SceneEventScope } from '../web/assets/sceneEventBootstrap';

function event(id: number, at: number, kind: string, extra: Partial<SceneBootstrapEvent> = {}): SceneBootstrapEvent {
  return { id, at, kind, ...extra };
}

function scope(overrides: Partial<SceneEventScope> = {}): SceneEventScope {
  return { profileId: 'profile-a', areaId: 'payon-field', status: 'field', presentation: 'group', ...overrides };
}

function bootstrap(events: SceneBootstrapEvent[], options: {
  snapshotAt?: number;
  cursor?: SceneEventCursor;
  scope?: SceneEventScope;
} = {}) {
  return selectSceneEventBatch({
    events,
    snapshotAt: options.snapshotAt ?? 10_000,
    scope: options.scope ?? scope(),
    cursor: options.cursor,
    bootstrap: true,
  });
}

describe('scene event bootstrap contract', () => {
  it('replays same-area group events retained in the two-second window, including a kill between polls', () => {
    const result = bootstrap([
      event(10, 7_900, 'attack', { areaId: 'payon-field' }),
      event(11, 8_900, 'damage', { areaId: 'payon-field', enemyId: 'mob-1' }),
      event(12, 9_100, 'kill', { areaId: 'payon-field', enemyId: 'mob-1', enemyPosition: { x: 4, y: 7 }, monsterId: 1002 }),
      event(13, 9_300, 'loot', { areaId: 'payon-field', enemyId: 'mob-1' }),
      event(14, 9_400, 'attack', { areaId: 'prontera-field' }),
      event(15, 7_800, 'kill', { areaId: 'payon-field', enemyId: 'old-mob', enemyPosition: { x: 1, y: 1 }, monsterId: 1002 }),
    ]);

    expect(result.events.map(entry => entry.id)).toEqual([11, 12, 13]);
    expect(result.events.find(entry => entry.kind === 'kill')).toMatchObject({
      enemyId: 'mob-1', enemyPosition: { x: 4, y: 7 }, monsterId: 1002,
    });
    expect([...result.actionEventIds]).toEqual([11, 12, 13]);
    // Filtered and stale records still advance the monotonic cursor.
    expect(result.cursor).toEqual({ profileId: 'profile-a', id: 15 });
  });

  it('seeds the bootstrap once and processes only newer ids as live events', () => {
    const original = [event(20, 9_500, 'attack', { areaId: 'payon-field' })];
    const seeded = bootstrap(original);
    const live = selectSceneEventBatch({
      events: [...original, event(21, 9_700, 'damage', { areaId: 'payon-field' })],
      snapshotAt: 10_000, scope: scope(), cursor: seeded.cursor, bootstrap: false,
    });

    expect(seeded.events.map(entry => entry.id)).toEqual([20]);
    expect(live.events.map(entry => entry.id)).toEqual([21]);
    expect([...live.actionEventIds]).toEqual([21]);
    expect(live.cursor.id).toBe(21);
  });

  it('uses a fresh cursor for a changed profile even when its ids restart lower', () => {
    const result = bootstrap([event(2, 9_500, 'attack', { areaId: 'payon-field' })], {
      cursor: { profileId: 'profile-a', id: 900 },
      scope: scope({ profileId: 'profile-b' }),
    });

    expect(result.events.map(entry => entry.id)).toEqual([2]);
    expect(result.cursor).toEqual({ profileId: 'profile-b', id: 2 });
  });

  it('admits area-less challenge records only for the current challenge and after battle start', () => {
    const result = bootstrap([
      event(30, 8_900, 'kill', { enemyId: 'prior-challenge', enemyPosition: { x: 1, y: 1 }, monsterId: 1002 }),
      event(31, 9_100, 'attack'),
      event(32, 9_200, 'kill', { enemyId: 'current-challenge', enemyPosition: { x: 5, y: 3 }, monsterId: 1003 }),
      event(33, 9_300, 'kill', { areaId: 'payon-field', enemyId: 'field-mob' }),
    ], { scope: scope({ areaId: undefined, status: 'challenge', challengeId: 'challenge-current', battleStartedAt: 9_000 }) });

    expect(result.events.map(entry => entry.id)).toEqual([31, 32]);
    expect(result.cursor.id).toBe(33);
  });

  it('keeps legacy terminal and loot at four seconds while limiting cues to two seconds', () => {
    const result = bootstrap([
      event(40, 6_500, 'kill', { areaId: 'payon-field' }),
      event(41, 7_000, 'loot', { areaId: 'payon-field' }),
      event(42, 7_900, 'attack', { areaId: 'payon-field' }),
      event(43, 8_100, 'attack', { areaId: 'payon-field' }),
      event(44, 9_000, 'death', { areaId: 'payon-field' }),
    ], { scope: scope({ presentation: 'legacy' }) });

    expect(result.events.map(entry => entry.id)).toEqual([40, 41, 42, 43, 44]);
    expect([...result.actionEventIds]).toEqual([43, 44]);
    expect(result.cursor.id).toBe(44);
  });

  it('does not replay ambiguous area-less field deaths from an earlier map', () => {
    const result = bootstrap([
      event(50, 9_100, 'kill', { enemyId: 'dead-on-other-map', enemyPosition: { x: 3, y: 6 }, monsterId: 1002 }),
      event(51, 9_200, 'kill', { areaId: 'payon-field', enemyId: 'current-map', enemyPosition: { x: 2, y: 4 }, monsterId: 1003 }),
    ]);

    expect(result.events.map(entry => entry.id)).toEqual([51]);
    expect(result.cursor.id).toBe(51);
  });
});
