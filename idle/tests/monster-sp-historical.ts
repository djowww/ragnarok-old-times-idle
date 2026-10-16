import { createHash } from 'node:crypto';

const BEFORE_CATALOG_SHA256 = 'f05e0a2f37dba20df233e6d43009713ccec505d1cec956c13105f3523dd7fff1';
const AFTER_CATALOG_SHA256 = 'cd37b56bf48a8d5638175094ed3034a9fdf22fd3b9dbf8b230f252531e09fb20';
const BEFORE_SOURCE_HASH = '12fad1b1cb7d6b2ea692ed2400636ff6f9e4d01e6d863dc0787847c5cd70729f';
const AFTER_SOURCE_HASH = 'eb8dd97e6258005543b15b7cd696dbdbc845a99d13b9bc763f3d67eb16333903';
const UNSUPPORTED_REASON = 'Requer SP do alvo; monstros não têm SP no catálogo.';
const BEFORE_SHOCKWAVE_DESCRIPTION = `Shockwave Trap. Habilidade utilitária. ${UNSUPPORTED_REASON}`;
const AFTER_SHOCKWAVE_DESCRIPTION = 'Shockwave Trap. Habilidade utilitária.';

/** Reverses only the reviewed monster-SP field and Shockwave catalog promotion. */
export function beforeMonsterSpCatalog<T>(input: T): T {
  const result = structuredClone(input) as Record<string, any>;
  const mimic = result.monsters?.['1191'];
  // The pinned selected mob_db export has only Mimic (1191) with nonzero SP.
  if (mimic?.maxSp === 182) delete mimic.maxSp;
  const shockwave = result.skills?.ht_shockwave;
  if (shockwave?.implementation === 'supported') shockwave.implementation = 'unsupported';
  if (shockwave?.unsupportedReason === undefined && shockwave?.description === AFTER_SHOCKWAVE_DESCRIPTION) {
    const restored: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(shockwave)) {
      if (key === 'description') restored.unsupportedReason = UNSUPPORTED_REASON;
      restored[key] = value;
    }
    result.skills.ht_shockwave = restored;
  }
  const restoredShockwave = result.skills?.ht_shockwave;
  if (restoredShockwave?.description === AFTER_SHOCKWAVE_DESCRIPTION)
    restoredShockwave.description = BEFORE_SHOCKWAVE_DESCRIPTION;
  if (result.source?.hash === AFTER_SOURCE_HASH) result.source.hash = BEFORE_SOURCE_HASH;
  return result as T;
}

/** Reverses only the exact current Shockwave support-coverage delta. */
export function beforeMonsterSpManifest<T>(input: T): T {
  const result = structuredClone(input) as Record<string, any>;
  const coverage = result.skillCoverage;
  if (!coverage || coverage.supported !== 268 || coverage.unsupported !== 80) return result as T;

  coverage.supported = 267;
  coverage.unsupported = 81;
  for (const name of ['hunter', 'sniper']) {
    const row = coverage.byClass?.[name];
    if (!row) continue;
    if (name === 'hunter' && row.supported === 22 && row.unsupported === 6) {
      row.supported = 21; row.unsupported = 7;
    }
    if (name === 'sniper' && row.supported === 26 && row.unsupported === 6) {
      row.supported = 25; row.unsupported = 7;
    }
  }
  for (const field of ['supportedSourceNames', 'combatExpansion'])
    if (Array.isArray(coverage[field])) coverage[field] = coverage[field].filter((name: string) => name !== 'HT_SHOCKWAVE');
  if (Array.isArray(coverage.unavailable) && !coverage.unavailable.some((entry: any) => entry.skillId === 'ht_shockwave')) {
    const nextTrap = coverage.unavailable.findIndex((entry: any) => entry.skillId === 'ht_removetrap');
    const index = nextTrap < 0 ? coverage.unavailable.length : nextTrap;
    coverage.unavailable.splice(index, 0, {
      skillId: 'ht_shockwave', sourceName: 'HT_SHOCKWAVE', reason: UNSUPPORTED_REASON,
    });
  }
  const source = result.skillSources?.ht_shockwave;
  if (source?.implementation === 'supported') {
    const restored: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(source)) {
      if (key === 'ratioSource') restored.unsupportedReason = UNSUPPORTED_REASON;
      restored[key] = key === 'implementation' ? 'unsupported' : value;
    }
    result.skillSources.ht_shockwave = restored;
  }
  if (result.catalogSha256 === AFTER_CATALOG_SHA256) result.catalogSha256 = BEFORE_CATALOG_SHA256;
  return result as T;
}

export function monsterSpHistoricalJsonHash(input: unknown): string {
  return createHash('sha256').update(JSON.stringify(input, null, 2) + '\n').digest('hex');
}
