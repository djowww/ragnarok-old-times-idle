import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import catalog from '../content/catalog.json';
import manifest from '../content/source-manifest.json';
import rules from '../content/rules.json';
import baseline from './fixtures/soloPosture232Baseline.json';
import type { Catalog } from '../shared/types';

const candidate = catalog as unknown as Catalog;
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key =>
    JSON.stringify(key) + ':' + canonical((value as Record<string, unknown>)[key])).join(',') + '}';
  return JSON.stringify(value);
}
const digest = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');

describe('source-closed Trick Dead and Free Cast catalog', () => {
  it('preserves the 232-skill baseline plus both postures and the later manual Sense feature', () => {
    const names = Object.values(candidate.skills).filter(skill => skill.implementation === 'supported').map(skill => skill.sourceName!).sort();
    expect(baseline.supportedSourceNames).toHaveLength(232);
    expect(baseline.supportedSourceNames.filter(name => !names.includes(name))).toEqual([]);
    expect(names.filter(name => !baseline.supportedSourceNames.includes(name)).sort()).toEqual(['AL_RUWACH', 'BA_PANGVOICE', 'DC_DONTFORGETME', 'DC_WINKCHARM', 'LK_JOINTBEAT', 'MO_BLADESTOP', 'MO_BODYRELOCATION', 'NV_TRICKDEAD', 'PF_FOGWALL', 'PF_MINDBREAKER', 'RG_CLOSECONFINE', 'SA_FREECAST', 'WZ_ESTIMATION', 'WZ_SIGHTBLASTER']);
    expect(manifest.skillCoverage).toMatchObject({ supported: 246, unsupported: 102, classes: 40, skills: 348 });
    expect(candidate.skills.nv_trickdead).toMatchObject({ implementation: 'supported', manualUse: 'toggle', toggle: true, spCost: [5], maxLevel: 1, statusDurationMs: [600000] });
    expect(candidate.skills.sa_freecast).toMatchObject({ implementation: 'supported', kind: 'passive', maxLevel: 10 });
    expect(candidate.skills.sa_freecast.manualUse).toBeUndefined();
    expect(candidate.classes.novice.skills).toContain('nv_trickdead');
    expect(candidate.classes.high_novice.skills).toContain('nv_trickdead');
    for (const job of Object.values(candidate.classes).filter(job => !['novice', 'high_novice'].includes(job.id)))
      expect(job.skills).not.toContain('nv_trickdead');
  });
  it('pins the PC cap macro and parameter inheritance without changing other source rows or content', () => {
    for (const source of baseline.sources) expect(manifest.sources).toContainEqual(source);
    expect(manifest.sources).toHaveLength(27);
    expect(candidate.source.commit).toBe(baseline.commit);
    expect(manifest.sources).toContainEqual(expect.objectContaining({ path: 'src/map/pc.h', sha256: rules.sourceHashes['src/map/pc.h'] }));
    expect(manifest.sources).toContainEqual(expect.objectContaining({ path: 'db/pre-re/unit_parameters_db.conf', sha256: rules.sourceHashes['unit_parameters_db.conf'] }));
    const priorClasses = structuredClone(candidate.classes);
    for (const job of Object.values(priorClasses)) {
      expect(job.minimumAttackMotionMs).toBe(100);
      delete job.minimumAttackMotionMs;
    }
    expect(digest(priorClasses)).toBe(baseline.classesSha256);
    expect(digest(candidate.items)).toBe(baseline.itemsSha256);
    expect(digest(candidate.monsters)).toBe(baseline.monstersSha256);
    expect(digest(candidate.areas)).toBe(baseline.areasSha256);
    // The subsequent source-closed Sense feature remains exclusively manual.
    expect(Object.values(candidate.skills).find(skill => skill.sourceName === 'WZ_ESTIMATION')).toMatchObject({ implementation: 'supported', manualUse: 'inspect' });
  });
});
