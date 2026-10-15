import type { Area, AreaActivityBucket, Catalog, GameState, HuntFocus } from './types.js';

const MINUTE_MS = 60_000;
const ACTIVITY_MINUTES = 15;

export const POST_WAVE_SEARCH_MS = 6_000;

export function focusForArea(state: GameState, areaId: string): HuntFocus {
  return state.huntFocus?.[areaId] ?? 'any';
}

export function encounterDelay(state: GameState, areaId: string, baseMs: number): number {
  return baseMs + (focusForArea(state, areaId) === 'any' ? 0 : 1000);
}

export function focusMatches(catalog: Catalog, area: Area, focus: HuntFocus): boolean {
  if (focus === 'any') return true;
  if (focus.startsWith('monster:')) return area.monsters.includes(Number(focus.slice(8)));
  if (focus.startsWith('element:')) return area.monsters.some(id => catalog.monsters[id]?.element.toLowerCase() === focus.slice(8));
  return false;
}

export function chooseAreaMonster(state: GameState, catalog: Catalog, area: Area, roll: number): number {
  const focus = focusForArea(state, area.id);
  const weights = area.monsters.map(id => {
    const monster = catalog.monsters[id];
    const match = focus.startsWith('monster:') ? id === Number(focus.slice(8))
      : focus.startsWith('element:') && monster?.element.toLowerCase() === focus.slice(8);
    return match ? 3 : 1;
  });
  let selection = roll * weights.reduce((sum, weight) => sum + weight, 0);
  for (let i = 0; i < area.monsters.length; i++) {
    selection -= weights[i];
    if (selection < 0) return area.monsters[i];
  }
  return area.monsters.at(-1)!;
}

export function pruneAreaActivity(state: GameState, at: number): void {
  if (!state.areaActivity) return;
  const currentMinute = Math.floor(Math.max(at, state.lastSimulatedAt) / MINUTE_MS) * MINUTE_MS;
  const oldestMinute = currentMinute - (ACTIVITY_MINUTES - 1) * MINUTE_MS;
  for (const [areaId, buckets] of Object.entries(state.areaActivity)) {
    const recent = buckets.filter(bucket => bucket.minute >= oldestMinute && bucket.minute <= currentMinute);
    if (recent.length) state.areaActivity[areaId] = recent;
    else delete state.areaActivity[areaId];
  }
}

export function recordAreaActivity(state: GameState, areaId: string, at: number, change: Partial<Omit<AreaActivityBucket, 'minute'>>): void {
  const activity = state.areaActivity ??= {};
  const buckets = activity[areaId] ??= [];
  const minute = Math.floor(at / MINUTE_MS) * MINUTE_MS;
  let bucket = buckets.at(-1);
  if (bucket?.minute !== minute) bucket = buckets.find(entry => entry.minute === minute);
  if (!bucket) {
    bucket = { minute, elapsedMs: 0, kills: 0, deaths: 0, baseExp: 0, jobExp: 0, lootZeny: 0, damageTaken: 0, potions: 0 };
    buckets.push(bucket);
  }
  for (const key of Object.keys(change) as Array<keyof Omit<AreaActivityBucket, 'minute'>>) {
    bucket[key] += change[key] ?? 0;
  }
}
