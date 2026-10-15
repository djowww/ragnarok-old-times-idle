import type { Catalog } from '../shared/types.js';
import type { GameProfiles } from './identity/types.js';
import { advanceState, advanceStateCooperatively } from '../engine/index.js';
export function createScheduler({ profiles, catalog, now, reportError }: { profiles: GameProfiles; catalog: Catalog; now: () => number; reportError: (profileId: string, error: unknown) => void }): { runCycle(): Promise<void>; start(): void; stop(): Promise<void> } {
  let pending: Promise<void> | undefined;
  let stopped = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  async function runLoop(): Promise<void> {
    try {
      let cursor: string | null = null;
      const at = now();
      while (!stopped) {
        const ids = await profiles.eligible(cursor, 50);
        let next = 0;
        async function worker() {
          while (!stopped && next < ids.length) {
            const id = ids[next++];
            try {
              const repository = profiles.forProfile(id);
              if (repository.transactCooperatively) await repository.transactCooperatively(null, state => advanceStateCooperatively(state, catalog, at));
              else await repository.transact(null, state => advanceState(state, catalog, at));
            } catch (error) { reportError(id, error); }
          }
        }
        await Promise.all([worker(), worker()]);
        if (ids.length < 50) break;
        cursor = ids.at(-1)!;
      }
    } catch (error) { reportError('scheduler', error); }
  }
  function runCycle(): Promise<void> {
    if (pending || stopped) return Promise.resolve();
    pending = runLoop().finally(() => { pending = undefined; });
    return pending;
  }
  return {
    runCycle,
    start() { stopped = false; timer ??= setInterval(() => { void runCycle(); }, 5000); },
    async stop() { stopped = true; clearInterval(timer); timer = undefined; await pending; },
  };
}
