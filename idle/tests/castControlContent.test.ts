import { describe, it, expect } from 'vitest';
import raw from '../content/catalog.json';
import manifest from '../content/source-manifest.json';
import type { Catalog } from '../shared/types';
const c = raw as unknown as Catalog;
describe('source-pinned Cast Cancel and Spell Breaker export', () => {
    it('promotes exactly two mechanics with manual and resource metadata', () => { expect(c.skills.sa_castcancel).toMatchObject({ implementation: 'supported', manualUse: 'castCancel', spCost: [2, 2, 2, 2, 2] }); expect(c.skills.sa_spellbreaker).toMatchObject({ implementation: 'supported', targetType: 'enemy', range: [9, 9, 9, 9, 9], castTimeMs: [700, 700, 700, 700, 700], spCost: [10, 10, 10, 10, 10] }); expect(manifest.skillCoverage).toMatchObject({ classes: 40, skills: 348, supported: 255, unsupported: 93 }); });
    it('promotes Magic Rod while retaining unavailable Dispell and exact prerequisites', () => { expect(c.skills.sa_magicrod).toMatchObject({ implementation: 'supported', manualUse: 'activate', statusEffect: 'SC_MAGICROD' });
        expect(Object.values(c.skills).find(s => s.sourceName === 'SA_DISPELL')?.implementation).toBe('unsupported'); expect(c.skills.sa_freecast.implementation).toBe('supported'); expect(c.skills.sa_castcancel.prerequisitesByClass?.sage).toEqual([{ skillId: 'sa_advancedbook', level: 2 }]); expect(c.skills.sa_spellbreaker.prerequisitesByClass?.sage).toEqual([{ skillId: 'sa_magicrod', level: 1 }]); expect(c.source.commit).toBe('410b9738c049ab1825d67b36b072d837c1d0b33a'); expect(manifest.sources).toHaveLength(28); });
});
