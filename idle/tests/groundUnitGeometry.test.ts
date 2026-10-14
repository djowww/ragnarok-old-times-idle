import { describe, expect, it } from 'vitest';
import { sourceGroundShape } from '../engine/groundUnitGeometry';
import manifest from '../content/source-manifest.json';
import raw from '../content/catalog.json';
import type { Catalog } from '../shared/types';
const api = { sourceGroundShape };
const center = { x: 100, y: 200 };
const offsets = (shape: ReturnType<NonNullable<typeof api.sourceGroundShape>>) => shape?.cells.map(p => [p.x - center.x, p.y - center.y]);
describe('pinned Hercules occupied unit geometry', () => {
  const directions = [
    { caster: { x: 100, y: 199 }, cells: [[-1, 0], [0, 0], [1, 0]] },
    { caster: { x: 101, y: 199 }, cells: [[1, 1], [1, 0], [0, 0], [0, -1], [-1, -1]] },
    { caster: { x: 101, y: 200 }, cells: [[0, -1], [0, 0], [0, 1]] },
    { caster: { x: 101, y: 201 }, cells: [[-1, 1], [-1, 0], [0, 0], [0, -1], [1, -1]] },
    { caster: { x: 100, y: 201 }, cells: [[-1, 0], [0, 0], [1, 0]] },
    { caster: { x: 99, y: 201 }, cells: [[1, 1], [1, 0], [0, 0], [0, -1], [-1, -1]] },
    { caster: { x: 99, y: 200 }, cells: [[0, -1], [0, 0], [0, 1]] },
    { caster: { x: 99, y: 199 }, cells: [[-1, 1], [-1, 0], [0, 0], [0, -1], [1, -1]] },
  ];
  it.each(directions)('retains FireWall source mask for caster$caster', ({ caster, cells }) => {
    expect(offsets(api.sourceGroundShape?.('MG_FIREWALL', center, caster))).toEqual(cells);
    expect(api.sourceGroundShape?.('MG_FIREWALL', center, caster)).toMatchObject({ range: 0, pathCheck: true });
  });
  it('defaults coincident FireWall cast to East, and uses source asymmetric direction thresholds', () => {
    expect(offsets(api.sourceGroundShape?.('MG_FIREWALL', center, center))).toEqual([[0, -1], [0, 0], [0, 1]]);
    expect(offsets(api.sourceGroundShape?.('MG_FIREWALL', center, { x: 97, y: 199 }))).toHaveLength(5);
    expect(offsets(api.sourceGroundShape?.('MG_FIREWALL', center, { x: 96, y: 199 }))).toHaveLength(3);
  });
  it('uses the15-cell5x3 FogWall rectangle instead of a circle or a square', () => {
    const shape = api.sourceGroundShape?.('PF_FOGWALL', center);
    expect(shape?.cells).toHaveLength(15); expect(shape?.range).toBe(0);
    expect(shape?.cells).toContainEqual({ x: 102, y: 201 }); expect(shape?.cells).not.toContainEqual({ x: 100, y: 202 });
  });
  it('uses the irregular29-cell Grand Cross source mask', () => {
    const shape = api.sourceGroundShape?.('CR_GRANDCROSS', center);
    expect(shape?.cells).toHaveLength(29);
    expect(shape?.cells).toContainEqual({ x: 104, y: 200 });
    expect(shape?.cells).toContainEqual({ x: 101, y: 202 });
    expect(shape?.cells).not.toContainEqual({ x: 102, y: 202 });
    expect(shape?.cells).not.toContainEqual({ x: 104, y: 204 });
  });
  it.each([['MG_SAFETYWALL', 1], ['AL_PNEUMA', 9], ['PF_SPIDERWEB', 1], ['DC_DONTFORGETME', 49],
    ['WZ_HEAVENDRIVE', 25], ['WZ_QUAGMIRE', 25], ['HW_GRAVITATION', 25], ['SA_VOLCANO', 49],
    ['SA_DELUGE', 49], ['SA_VIOLENTGALE', 49]] as const)('has exact cells for%s', (source, count) => {
      expect(api.sourceGroundShape?.(source, center)?.cells).toHaveLength(count);
      expect(api.sourceGroundShape?.(source, center)?.range).toBe(0);
  });
  it('keeps LoV and VenomDust Range1 so neither incorrectly blocks a Sage field', () => {
    expect(api.sourceGroundShape?.('WZ_VERMILION', center)?.cells).toHaveLength(121);
    expect(api.sourceGroundShape?.('WZ_VERMILION', center)?.range).toBe(1);
    expect(api.sourceGroundShape?.('AS_VENOMDUST', center)?.cells).toHaveLength(5);
    expect(api.sourceGroundShape?.('AS_VENOMDUST', center)?.range).toBe(1);
  });
  it('covers every currently supported Range0 unit from the pinned source manifest', () => {
    const c = raw as unknown as Catalog;
    const entries = Object.entries(manifest.skillSources).filter(([id, row]) =>
      c.skills[id]?.implementation === 'supported' && (row.sourceUnit as any).Id && !(row.sourceUnit as any).Range);
    expect(entries.length).toBeGreaterThan(15);
    for (const [id, row] of entries) {
      const source = c.skills[id].sourceName!, shape = api.sourceGroundShape?.(source, center);
      expect(shape, source).toBeDefined(); expect(shape?.range, source).toBe(0);
      const layout = (row.sourceUnit as any).Layout ?? 0;
      if (layout >= 0) expect(shape?.cells, source).toHaveLength((2 * layout + 1) ** 2);
    }
  });
  it('rejects unknown skills and invalid coordinates without fabricating occupancy', () => {
    expect(api.sourceGroundShape?.('unknown', center)).toBeUndefined();
    expect(api.sourceGroundShape?.('MG_FIREWALL', { x: NaN, y: 1 })).toBeUndefined();
    expect(api.sourceGroundShape?.('MG_FIREWALL', { x: 1.5, y: 1 })).toBeUndefined();
  });
  it('covers every supported positive-range unit with its source range and exact simple layout', () => {
    const c = raw as unknown as Catalog;
    const entries = Object.entries(manifest.skillSources).filter(([id,row]) =>
      c.skills[id]?.implementation === 'supported' && (row.sourceUnit as any).Id && (row.sourceUnit as any).Range);
    for (const [id,row] of entries) {
      const unit = row.sourceUnit as any, source=c.skills[id].sourceName!;
      const shape=api.sourceGroundShape?.(source,center);
      expect(shape,source).toBeDefined();
      expect(shape?.range,source).toBe(typeof unit.Range==='number'?unit.Range:unit.Range.Lv1);
      if ((unit.Layout??0)>=0) expect(shape?.cells,source).toHaveLength((2*(unit.Layout??0)+1)**2);
    }
  });
});
