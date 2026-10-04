import type { GameState } from './types.js';

/** The displayed map is also the loading and music authority during recovery. */
export function isTownScene(state?: Pick<GameState, 'status' | 'areaId' | 'restMode' | 'pausedStatus'>): boolean {
  const status = state?.status === 'paused' ? state.pausedStatus : state?.status;
  return status === 'town' || (status === 'resting' &&
    (!state?.areaId || state.restMode !== 'field'));
}
