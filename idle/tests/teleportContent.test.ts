import { beforeSoloAlchemySkills } from './solo-alchemy-historical';
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import raw from '../content/catalog.json';
import manifest from '../content/source-manifest.json';
import baseline from './fixtures/teleport259Baseline.json';
import type { Catalog } from '../shared/types';
import { beforeHistoricalClassCadence } from './class-cadence-historical';
const c = raw as unknown as Catalog;
function canonical(v: unknown): string {
  return Array.isArray(v) ? '[' + v.map(canonical).join(',') + ']' : v && typeof v === 'object'
    ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical((v as Record<string, unknown>)[k])).join(',') + '}' : JSON.stringify(v);
}
const hash = (v: unknown) => createHash('sha256').update(canonical(v)).digest('hex');
describe('source Teleport catalog', () => {
  it('promotes exactly Teleport with source cost/icon/prerequisite and manual metadata', () => {
    expect(c.skills.al_teleport).toMatchObject({ herculesId: 26, name: 'Teleporte', implementation: 'supported',
      manualUse: 'teleport', maxLevel: 2, spCost: [10, 9], castTimeMs: [0, 0], afterCastDelayMs: [0, 0],
      cooldownMs: 0, prerequisites: [{ skillId: 'al_ruwach', level: 1 }],
      iconResource: 'data/texture/유저인터페이스/item/al_teleport.bmp' });
    expect(c.skills.al_teleport.unsupportedReason).toBeUndefined();
    expect(c.skills.al_teleport.description).toContain('posição aleatória');
    expect(c.skills.al_teleport.description).toContain('Prontera');
    expect(manifest.skillCoverage).toMatchObject({ supported: 262, unsupported: 86, skills: 348, classes: 40 });
    for (const [key, expected] of Object.entries(baseline.domains)) {
      const historical = key === 'classes' ? beforeHistoricalClassCadence(c.classes) : raw[key as keyof typeof raw];
      expect(hash(historical), key).toBe(expected);
    }
    expect(hash(Object.fromEntries(Object.entries(beforeSoloAlchemySkills(c.skills)).filter(([id]) => id !== 'al_teleport')))).toBe(baseline.otherSkills);
  });
  it('pins source noteleport and discloses component/home/manual adaptations', () => {
    expect(c.teleportBlockedMaps).toContain('prt_in'); expect(c.teleportBlockedMaps).toContain('gefg_cas01');
    expect(c.teleportBlockedMaps).not.toContain('prt_fild08');
    expect(manifest.sources).toContainEqual(expect.objectContaining({ path: 'npc/mapflag/noteleport.txt', sha256: expect.stringMatching(/^[a-f0-9]{64}$/) }));
    const entry = (manifest.skillSources as Record<string, { adaptation?: string }>).al_teleport;
    expect(entry.adaptation).toContain('component'); expect(entry.adaptation).toContain('Prontera'); expect(entry.adaptation?.toLowerCase()).toContain('manual');
  });
});
