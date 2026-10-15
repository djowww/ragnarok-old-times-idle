/** Narrow bootstrap selection for retained scene events; Scene owns its cursor. */
export interface SceneBootstrapEvent {
  id: number;
  at: number;
  kind: string;
  areaId?: string;
  enemyId?: string;
  enemyPosition?: { x: number; y: number };
  monsterId?: number;
}

export interface SceneEventCursor {
  profileId: string;
  id: number;
}

export interface SceneEventScope {
  profileId: string;
  areaId?: string;
  status: 'town' | 'field' | 'challenge';
  challengeId?: string;
  battleStartedAt?: number;
  presentation: 'group' | 'legacy';
}

export interface SceneEventBatch<T extends SceneBootstrapEvent> {
  events: T[];
  /** Cue actions retain the existing two second presentation window. */
  actionEventIds: ReadonlySet<number>;
  cursor: SceneEventCursor;
}

export interface SelectSceneEventBatchOptions<T extends SceneBootstrapEvent> {
  snapshotAt: number;
  scope: SceneEventScope;
  cursor?: SceneEventCursor;
  /** True once for each Scene mount, before polling live ids. */
  bootstrap: boolean;
  events: readonly T[];
}

/** Recover only recent, unambiguous actions on mount, then consume live ids once. */
export function selectSceneEventBatch<T extends SceneBootstrapEvent>(
  options: SelectSceneEventBatchOptions<T>,
): SceneEventBatch<T> {
  const previousId = options.cursor?.profileId === options.scope.profileId
    ? options.cursor.id
    : 0;
  const maxSnapshotId = options.events.reduce((max, event) =>
    Number.isFinite(event.id) ? Math.max(max, event.id) : max, previousId);
  const cursor = { profileId: options.scope.profileId, id: maxSnapshotId };
  const { scope, snapshotAt } = options;
  const actionSince = snapshotAt - 2000;
  const retainedSince = snapshotAt - (scope.presentation === 'group' ? 2000 : 4000);
  const events = options.events.filter(event => {
    if (event.id <= previousId) return false;
    if (!options.bootstrap) return true;
    if (scope.status === 'town' || !Number.isFinite(event.at) ||
      event.at < retainedSince || event.at > snapshotAt) return false;
    if (event.areaId) return scope.status !== 'challenge' && event.areaId === scope.areaId;
    return scope.status === 'challenge' && !!scope.challengeId &&
      scope.battleStartedAt !== undefined && event.at >= scope.battleStartedAt;
  });
  return { events, actionEventIds: new Set(events.filter(event => event.at >= actionSince).map(event => event.id)), cursor };
}
