import { beforeSuffragiumCatalog, beforeSuffragiumManifest } from './suffragium-historical.js';

const DISPELL_UNSUPPORTED_REASON = 'Mecânica Hercules importada; a simulação atual ainda não executa este efeito.';
const BEFORE_SOURCE_HASH = 'f0627ac58f79c23f4dff6b77ecad8cfc675e93bd4f943979cab41f3a8432e6b1';
const AFTER_SOURCE_HASH = '241fecbc2567e1d36194bd11c187f89cfec009891caf2fb47e3a3083ff52d13b';
const BEFORE_CATALOG_SHA256 = '43faea02bd817e4320fd0cf8378ce0fd7ad338965ba4aa1292000a5fbb1e05d4';
const AFTER_CATALOG_SHA256 = '1269241eb2cf94dda9c55ef387e2f97a0fe44cf6cc9dfa7577858164a040d870';
const BEFORE_DESCRIPTION = `Dispell. Habilidade utilitária. ${DISPELL_UNSUPPORTED_REASON}`;
const AFTER_DESCRIPTION = 'Dispell. Habilidade utilitária.';

/** Reverses only the exact SA_DISPELL promotion so older snapshots stay strict. */
export function beforeDispellCatalog<T>(input: T): T {
  const result = structuredClone(beforeSuffragiumCatalog(input)) as Record<string, any>;
  const dispell = result.skills?.sa_dispell;
  if (dispell?.implementation === 'supported' && dispell.description === AFTER_DESCRIPTION) {
    const restored: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(dispell)) {
      if (key === 'implementation') {
        restored.implementation = 'unsupported';
        restored.unsupportedReason = DISPELL_UNSUPPORTED_REASON;
      } else if (key === 'description') {
        restored.description = BEFORE_DESCRIPTION;
      } else {
        restored[key] = value;
      }
    }
    result.skills.sa_dispell = restored;
  }
  if (result.source?.hash === AFTER_SOURCE_HASH) result.source.hash = BEFORE_SOURCE_HASH;
  return result as T;
}

/** Reverses only the SA_DISPELL coverage and source-manifest promotion. */
export function beforeDispellManifest<T>(input: T): T {
  const result = structuredClone(beforeSuffragiumManifest(input)) as Record<string, any>;
  const coverage = result.skillCoverage;
  const dispell = result.skillSources?.sa_dispell;
  if (coverage?.supported === 272 && coverage?.unsupported === 76 && dispell?.implementation === 'supported') {
    const restored: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(dispell)) {
      if (key === 'implementation') {
        restored.implementation = 'unsupported';
        restored.unsupportedReason = DISPELL_UNSUPPORTED_REASON;
      } else {
        restored[key] = value;
      }
    }
    result.skillSources.sa_dispell = restored;
    coverage.supported = 271;
    coverage.unsupported = 77;
    if (coverage.byClass?.sage?.supported === 38 && coverage.byClass.sage.unsupported === 3) {
      coverage.byClass.sage.supported = 37;
      coverage.byClass.sage.unsupported = 4;
    }
    if (coverage.byClass?.professor?.supported === 45 && coverage.byClass.professor.unsupported === 4) {
      coverage.byClass.professor.supported = 44;
      coverage.byClass.professor.unsupported = 5;
    }
    if (Array.isArray(coverage.supportedSourceNames))
      coverage.supportedSourceNames = coverage.supportedSourceNames.filter((name: string) => name !== 'SA_DISPELL');
    if (Array.isArray(coverage.unavailable) &&
      !coverage.unavailable.some((entry: any) => entry.skillId === 'sa_dispell')) {
      const insertAt = coverage.unavailable.findIndex((entry: any) => entry.skillId === 'sa_abracadabra');
      coverage.unavailable.splice(insertAt < 0 ? coverage.unavailable.length : insertAt, 0, {
        skillId: 'sa_dispell', sourceName: 'SA_DISPELL', reason: DISPELL_UNSUPPORTED_REASON,
      });
    }
  }
  if (result.catalogSha256 === AFTER_CATALOG_SHA256) result.catalogSha256 = BEFORE_CATALOG_SHA256;
  return result as T;
}
