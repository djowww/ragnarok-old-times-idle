import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import WeaponCraft from '../web/panels/WeaponCraft';
import { createInitialState, getSnapshot } from '../engine/index.js';
import catalogJson from '../content/catalog.json';
import type { Catalog } from '../shared/types.js';

describe('weapon forge panel', () => {
  it('shows source recipe, chance, materials, and the attempt action', () => {
    const c = structuredClone(catalogJson) as unknown as Catalog;
    const s = createInitialState(c, 0); s.job = 'blacksmith'; s.jobLevel = 10; s.stats.dex = 10; s.stats.luk = 10; s.hp = 100; s.sp = 100; s.learnedSkills.bs_sword = 1;
    s.inventory = [{ uid: 'iron', itemId: 998, quantity: 2, refine: 0, cards: [], favorite: false }]; s.equipment = {};
    const html = renderToStaticMarkup(createElement(WeaponCraft, { catalog: c, snapshot: getSnapshot(s, c, 0), busy: false, command: async () => true }));
    expect(html).toContain('Forja de armas'); expect(html).toContain('Sword'); expect(html).toContain('59,4%'); expect(html).toContain('Iron'); expect(html).toContain('Tentar forjar');
  });
  it('shows why a second recipe cannot be forged with missing materials', () => {
    const c = structuredClone(catalogJson) as unknown as Catalog;
    const s = createInitialState(c, 0); s.job = 'blacksmith'; s.learnedSkills.bs_sword = 1; s.inventory = []; s.equipment = {};
    const html = renderToStaticMarkup(createElement(WeaponCraft, { catalog: c, snapshot: getSnapshot(s, c, 0), busy: false, command: async () => true }));
    expect(html).toContain('Faltam'); expect(html).toContain('disabled=""');
  });
});
