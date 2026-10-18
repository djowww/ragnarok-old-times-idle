import { describe, expect, it } from 'vitest';
import catalog from '../content/catalog.json';
import manifest from '../content/source-manifest.json';

describe('exported classic weapon forging', () => {
  it('pins all seven passive crafting skills to the exact recipe source', () => {
    const names = ['BS_SWORD', 'BS_DAGGER', 'BS_TWOHANDSWORD', 'BS_AXE', 'BS_MACE', 'BS_KNUCKLE', 'BS_SPEAR'];
    for (const name of names) {
      const skill = Object.values(catalog.skills).find(candidate => candidate.sourceName === name);
      expect(skill).toMatchObject({ implementation: 'supported', kind: 'passive', manualUse: 'weaponCraft' });
      expect(skill?.description).not.toContain('não implementado');
    }
    expect(manifest.sources).toContainEqual(expect.objectContaining({ path: 'db/produce_db.txt', url: expect.stringContaining('410b9738c049ab1825d67b36b072d837c1d0b33a') }));
    expect(manifest.weaponCraft).toMatchObject({ recipes: 52, skillFamilies: names, source: 'db/produce_db.txt' });
  });
});
