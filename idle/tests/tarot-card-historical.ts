const UNSUPPORTED_REASON = 'Requer baralho aleatório com efeitos de combate entre personagens.';
const BEFORE_SOURCE_HASH = '99a819762fc437bbdc88c3adb735e5cfb6e4cd46f9001e9841a778db2285ae44';
const AFTER_SOURCE_HASH = 'f0627ac58f79c23f4dff6b77ecad8cfc675e93bd4f943979cab41f3a8432e6b1';
const BEFORE_CATALOG_SHA256 = 'c7fa90403e7997b651e77e10324a125ef49784bc4f2457a2e8a3a585d6df9c53';
const AFTER_CATALOG_SHA256 = '43faea02bd817e4320fd0cf8378ce0fd7ad338965ba4aa1292000a5fbb1e05d4';
const BEFORE_DESCRIPTION = `Tarot Card of Fate. Aplica TAROTCARD. ${UNSUPPORTED_REASON}`;
const AFTER_DESCRIPTION = 'Tarot Card of Fate. Aplica TAROTCARD.';

/** Reverses only the reviewed Tarot Card content export delta for older snapshots. */
export function beforeTarotCardCatalog<T>(input: T): T {
  const result = structuredClone(input) as Record<string, any>;
  const tarot = result.skills?.cg_tarotcard;
  if (tarot?.implementation === 'supported' && tarot.description === AFTER_DESCRIPTION) {
    const restored: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(tarot)) {
      if (key === 'implementation') {
        restored.implementation = 'unsupported';
        restored.unsupportedReason = UNSUPPORTED_REASON;
      } else if (key === 'description') {
        restored.description = BEFORE_DESCRIPTION;
      } else {
        restored[key] = value;
      }
    }
    result.skills.cg_tarotcard = restored;
  }
  if (result.source?.hash === AFTER_SOURCE_HASH) result.source.hash = BEFORE_SOURCE_HASH;
  return result as T;
}

/** Reverses only Tarot Card coverage and source metadata for older snapshots. */
export function beforeTarotCardManifest<T>(input: T): T {
  const result = structuredClone(input) as Record<string, any>;
  const coverage = result.skillCoverage;
  const tarot = result.skillSources?.cg_tarotcard;
  const isCurrentTarotDelta = coverage?.supported === 271
    && coverage?.unsupported === 77
    && tarot?.implementation === 'supported';
  if (!isCurrentTarotDelta) return result as T;

  const restored: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(tarot)) {
    if (key === 'implementation') {
      restored.implementation = 'unsupported';
      restored.unsupportedReason = UNSUPPORTED_REASON;
    } else {
      restored[key] = value;
    }
  }
  result.skillSources.cg_tarotcard = restored;
  coverage.supported = 270;
  coverage.unsupported = 78;
  if (coverage.byClass?.clown?.supported === 18 && coverage.byClass.clown.unsupported === 16) {
    coverage.byClass.clown.supported = 17;
    coverage.byClass.clown.unsupported = 17;
  }
  if (coverage.byClass?.gypsy?.supported === 17 && coverage.byClass.gypsy.unsupported === 17) {
    coverage.byClass.gypsy.supported = 16;
    coverage.byClass.gypsy.unsupported = 18;
  }
  for (const field of ['supportedSourceNames', 'combatExpansion']) {
    if (Array.isArray(coverage[field]))
      coverage[field] = coverage[field].filter((name: string) => name !== 'CG_TAROTCARD');
  }
  if (Array.isArray(coverage.unavailable)
      && !coverage.unavailable.some((entry: any) => entry.skillId === 'cg_tarotcard')) {
    const insertAt = coverage.unavailable.findIndex((entry: any) => entry.skillId === 'dc_uglydance');
    coverage.unavailable.splice(insertAt < 0 ? coverage.unavailable.length : insertAt, 0, {
      skillId: 'cg_tarotcard',
      sourceName: 'CG_TAROTCARD',
      reason: UNSUPPORTED_REASON,
    });
  }
  if (result.catalogSha256 === AFTER_CATALOG_SHA256)
    result.catalogSha256 = BEFORE_CATALOG_SHA256;
  return result as T;
}
