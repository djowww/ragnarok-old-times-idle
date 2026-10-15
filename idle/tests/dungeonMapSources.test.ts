import { describe, expect, it } from 'vitest';
import catalog from '../content/catalog.json';
import rules from '../content/rules.json';
import manifest from '../content/source-manifest.json';
import navigation from '../content/field-navigation.json';
import { bgmForMap } from '../web/components/mapBgm';
import type { Catalog } from '../shared/types';
import { createInitialState, applyCommand } from '../engine';
import { addItem } from '../engine/state';
import { getMapLife } from '../web/assets/mapLife';
const c = catalog as unknown as Catalog;

describe('native dungeon populations and material routes', () => {
  it.each([
    ['payon_cave_depths', [1111, 1116, 1028, 1016]],
    ['byalan_depths', [1068, 1067, 1144, 1044]],
    ['orc_dungeon', [1042, 1005, 1111, 1153, 1152]],
  ])('keeps the source population of %s', (id, ids) => {
    expect(c.areas.find(area => area.id === id)?.monsters).toEqual(ids);
  });
  it.each([
    ['pyramid_depths', 'moc_pryd05', [1149, 1041, 1032]],
    ['glast_heim_cemetery', 'gl_chyard', [1036, 1015, 1192, 1117, 1035, 1191]],
  ])('provides %s with its real map, population, navigation and BGM', (id, map, ids) => {
    const area = c.areas.find(candidate => candidate.id === id);
    expect(area).toMatchObject({ map, monsters: ids });
    expect(navigation.areas.find(candidate => candidate.areaId === id)?.map).toBe(map);
    expect(bgmForMap(map)).toMatch(/\.mp3$/);
    for (const monsterId of ids) expect(c.monsters[monsterId]).toBeDefined();
    expect(getMapLife(map, area, c).filter(actor => actor.kind === 'npc')).toHaveLength(0);
  });
  it('pins all dungeon scripts used to validate the chosen populations', () => {
    for (const name of ['prt_sew','pay_dun','iz_dun','orcsdun','moc_pryd','gef_dun','glastheim']) {
      const path = `npc/pre-re/mobs/dungeons/${name}.txt`;
      expect(rules.mapSpawnSources).toContain(path);
      expect(manifest.sources).toContainEqual(expect.objectContaining({ path, sha256: expect.stringMatching(/^[a-f0-9]{64}$/) }));
    }
  });
  it('lets regular farming obtain Fabric and Immortal Heart at native drop rates', () => {
    expect(c.monsters[1192]?.drops).toContainEqual(expect.objectContaining({ itemId: 1059, chance: 5820 }));
    expect(c.monsters[1032]?.drops).toContainEqual(expect.objectContaining({ itemId: 929, chance: 9000 }));
    expect(c.items[1059]).toBeDefined(); expect(c.items[929]).toBeDefined();
  });
  it('protects actual skill reagents from the bulk common-loot sale', () => {
    for (const itemId of [1065, 7049, 715, 716, 717, 713, 970, 1059, 929, 905, 7033])
      expect(c.items[itemId]?.type, String(itemId)).toBe('material');
  });
  it('sells common loot while keeping reagent quantities intact', () => {
    const initial = createInitialState(c, 0); initial.inventory = []; initial.equipment = {};
    for (const id of [1065, 7049, 713, 970, 1059, 929]) addItem(initial, c, id, 3);
    addItem(initial, c, 909, 5);
    const before = JSON.stringify(initial);
    const sold = applyCommand(initial, c, { type: 'sellLoot' }, 0);
    for (const id of [1065, 7049, 713, 970, 1059, 929]) expect(sold.inventory.find(entry => entry.itemId === id)?.quantity).toBe(3);
    expect(sold.inventory.some(entry => entry.itemId === 909)).toBe(false);
    expect(sold.zeny).toBe(initial.zeny + c.items[909].sellPrice * 5);
    expect(JSON.stringify(initial)).toBe(before);
  });

});
