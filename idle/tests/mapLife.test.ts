import { describe, expect, it } from 'vitest';
import catalogJSON from '../content/catalog.json';
import type { Area, Catalog } from '../shared/types';
import { getMapLife } from '../web/assets/mapLife';

const catalog = catalogJSON as unknown as Catalog;
const dungeonScenes = new Set(['sewer', 'cave', 'sea', 'castle', 'orc']);
const dungeons = catalog.areas.filter(area => dungeonScenes.has(area.scene) || area.map === 'moc_pryd02');
const fields = catalog.areas.filter(area => !dungeons.includes(area));

describe('ambient NPCs match the hunt area', () => {
  it.each(dungeons)('does not put field inhabitants in $map', area => {
    expect(getMapLife(area.map, area, catalog)).toEqual([]);
  });
  it.each(fields)('keeps the Explorer in $map', area => {
    expect(getMapLife(area.map, area, catalog).some(actor => actor.label === 'Explorador')).toBe(true);
  });
  it('uses area metadata for a further dungeon level without a hardcoded map entry', () => {
    const area: Area = { ...dungeons[0], id: 'next-sewer', map: 'prt_sewb3', scene: 'sewer' };
    expect(getMapLife(area.map, area, catalog)).toEqual([]);
  });
  it('keeps Prontera inhabitants and the field road guard', () => {
    expect(getMapLife('prontera', undefined, catalog).map(actor => actor.label)).toEqual([
      'Guarda de Prontera', 'Funcionária Kafra', 'Viajante', 'Morador de Prontera',
    ]);
    const south = catalog.areas.find(area => area.map === 'prt_fild08')!;
    expect(getMapLife(south.map, south, catalog).map(actor => actor.label)).toEqual(['Explorador', 'Guarda da estrada']);
  });
  it('does not leak the previous area scenery into a different map', () => {
    expect(getMapLife('prt_sewb2', fields[0], catalog)).toEqual([]);
    expect(getMapLife('prt_fild08', undefined, catalog)).toEqual([]);
  });
});
