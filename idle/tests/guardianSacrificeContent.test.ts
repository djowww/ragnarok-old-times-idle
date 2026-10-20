import { beforeDungeonExpansionCatalog, beforeDungeonExpansionManifest } from './dungeon-map-historical';
import { beforeArrowCraftingCatalog, beforeArrowCraftingManifest } from './arrow-craft-historical';
import { beforeSoloAlchemySkills } from './solo-alchemy-historical';
import { describe, expect, it } from 'vitest';
import dungeonCurrentCatalog from '../content/catalog.json';
import dungeonCurrentManifest from '../content/source-manifest.json';
import baseline from './fixtures/guardianSacrifice230Baseline.json';
import rules from '../content/rules.json';
import type { Catalog } from '../shared/types';

const catalog = beforeDungeonExpansionCatalog(beforeArrowCraftingCatalog(dungeonCurrentCatalog));
const manifest = beforeDungeonExpansionManifest(beforeArrowCraftingManifest(dungeonCurrentManifest));

const candidate = catalog as unknown as Catalog;

describe('Guardian and Sacrifice content promotion', () => {
  it('adds Guardian, Sacrifice, Trick Dead and Free Cast to the frozen 230-skill source catalog', () => {
    const supported = Object.values(beforeSoloAlchemySkills(candidate.skills))
      .filter(skill => skill.implementation === 'supported')
      .map(skill => skill.sourceName!)
      .sort();
    expect(baseline.supportedSourceNames).toHaveLength(230);
    expect(baseline.supportedSourceNames.filter(name => !supported.includes(name))).toEqual([]);
    expect(supported.filter(name => !baseline.supportedSourceNames.includes(name)).sort()).toEqual(['AL_HOLYWATER', 'AL_RUWACH', 'AL_TELEPORT', 'AL_WARP', 'AM_CANNIBALIZE', 'ASC_CDP', 'AS_LEFT', 'AS_RIGHT', 'BA_PANGVOICE', 'BS_ENCHANTEDSTONE', 'BS_GREED', 'BS_IRON', 'BS_ORIDEOCON', 'BS_STEEL', 'CR_SHRINK', 'DC_DONTFORGETME', 'DC_WINKCHARM', 'HT_REMOVETRAP', 'HT_SPRINGTRAP', 'LK_JOINTBEAT', 'MO_BLADESTOP', 'MO_BODYRELOCATION', 'NV_TRICKDEAD', 'PA_SACRIFICE', 'PF_FOGWALL', 'PF_MINDBREAKER', 'PF_SOULBURN', 'RG_CLOSECONFINE', 'RG_PLAGIARISM', 'SA_ADVANCEDBOOK', 'SA_DELUGE', 'SA_FLAMELAUNCHER', 'SA_FREECAST', 'SA_FROSTWEAPON', 'SA_LIGHTNINGLOADER', 'SA_MAGICROD', 'SA_SEISMICWEAPON', 'SA_VIOLENTGALE', 'SA_VOLCANO', 'ST_CHASEWALK', 'ST_PRESERVE', 'TF_BACKSLIDING', 'WZ_ESTIMATION', 'WZ_ICEWALL', 'WZ_SIGHTBLASTER']);
    expect(Object.keys(candidate.skills)).toHaveLength(348);
    expect(Object.keys(candidate.classes)).toHaveLength(40);
    expect(manifest.skillCoverage).toMatchObject({ classes: 40, skills: 348, supported: 298, unsupported: 50 });
  });

  it('preserves the pinned source rows and keeps Devotion study-only', () => {
    for (const source of baseline.sources) expect(manifest.sources).toContainEqual(source);
    expect(manifest.sources).toHaveLength(47);
    expect(manifest.sources).toContainEqual(expect.objectContaining({ path: 'npc/merchants/refine.txt', sha256: '3b0cf6c2b711115780acfd7d8c41ad1bd2a2f6582baec44a605cf889b747eac1' }));
    expect(candidate.source.commit).toBe(baseline.commit);
    expect(candidate.skills.cr_autoguard.implementation).toBe('supported');
    expect(candidate.skills.cr_shrink).toMatchObject({
      sourceName: 'CR_SHRINK', implementation: 'supported', maxLevel: 1, manualUse: 'toggle',
      spCost: [15], statusEffect: 'SC_CR_SHRINK', statusDurationMs: [300000], requiredState: 'Shield',
    });
    expect(candidate.skills.pa_sacrifice).toMatchObject({
      sourceName: 'PA_SACRIFICE', implementation: 'supported', manualUse: 'activate', maxLevel: 5,
      spCost: [100, 100, 100, 100, 100],
      statusEffect: 'SC_SACRIFICE', prerequisitesByClass: { paladin: [
        { skillId: 'sm_endure', level: 1 }, { skillId: 'cr_trust', level: 5 }, { skillId: 'cr_devotion', level: 3 },
      ] },
    });
    expect(candidate.skills.pa_sacrifice.toggle).toBeUndefined();
    expect(candidate.skills.cr_devotion?.implementation).toBe('unsupported');
    expect(manifest.skillSources.pa_sacrifice.implementation).toBe('supported');
    expect(manifest.skillSources.cr_shrink.implementation).toBe('supported');
    expect(rules.sourceHashes).toBeDefined();
    const sourceHashes = rules.sourceHashes as Record<string, string>;
    for (const source of baseline.sources) {
      const sourceKey = source.path.split('/').at(-1)!;
      expect(sourceHashes[source.path] ?? sourceHashes[sourceKey], source.path).toBe(source.sha256);
    }
  });
});
