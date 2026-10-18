import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import MetalCraft from '../web/panels/MetalCraft';
import { createInitialState, getSnapshot } from '../engine/index.js';
import catalogJson from '../content/catalog.json';
import type { Catalog } from '../shared/types.js';

describe('metal production panel', () => {
  it('shows a learned production recipe, source chance and attempt action', () => {
    const c = structuredClone(catalogJson) as unknown as Catalog;
    const s = createInitialState(c, 0); s.job = 'blacksmith'; s.jobLevel = 10;
    s.stats.dex = 10; s.stats.luk = 10; s.hp = 100; s.sp = 100;
    const iron = Object.values(c.skills).find(skill => skill.sourceName === 'BS_IRON')!;
    s.learnedSkills[iron.id] = 1;
    s.inventory = [{ uid: 'ore', itemId: 1002, quantity: 1, refine: 0, cards: [], favorite: false }];
    const html = renderToStaticMarkup(createElement(MetalCraft, { catalog: c,
      snapshot: getSnapshot(s, c, 0), busy: false, command: async () => true }));
    expect(html).toContain('Produção de metais'); expect(html).toContain('Iron Ore');
    expect(html).toContain('49,4%'); expect(html).toContain('Tentar produzir');
  });
});
