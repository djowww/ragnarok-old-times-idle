/** Hercules 410b9738: pc.c:9391..9398, status.c:2148,2173..2174. GPL-3.0-or-later. */
import type { Catalog, GameState } from '../shared/types.js';

const pecoJobs = new Set(['knight', 'lord_knight', 'crusader', 'paladin']);

function learnedSourceLevel(state: GameState, catalog: Catalog, sourceName: string): number {
  let level = 0;
  for (const [id, learned] of Object.entries(state.learnedSkills)) {
    if (catalog.skills[id]?.sourceName === sourceName && Number.isFinite(learned))
      level = Math.max(level, Math.floor(learned));
  }
  return level;
}

/** Eligibility depends on the source skill, independently of catalog promotion. */
export function canPecoMount(state: GameState, catalog: Catalog): boolean {
  return pecoJobs.has(state.job) && !!catalog.classes[state.job] && learnedSourceLevel(state, catalog, 'KN_RIDING') > 0;
}

export function isPecoMounted(state: GameState, catalog: Catalog): boolean {
  return state.mounted === true && canPecoMount(state, catalog);
}

/** Add this percentage to motion rate (subtract from delay reduction), before ASPD caps. */
export function mountedCavalierPenalty(state: GameState, catalog: Catalog): number {
  if (!isPecoMounted(state, catalog)) return 0;
  return 50 - 10 * Math.max(0, Math.min(5, learnedSourceLevel(state, catalog, 'KN_CAVALIERMASTERY')));
}
