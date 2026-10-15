import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import catalogJson from '../content/catalog.json';
import type { Catalog } from '../shared/types';
import { createInitialState, getSnapshot } from '../engine';
import Blacksmith from '../web/panels/Blacksmith';

const catalog = catalogJson as unknown as Catalog;

describe('blacksmith broken-equipment refinement guidance', () => {
  it('hides broken gear from the refine list and says to repair it first', () => {
    const state = createInitialState(catalog, 0);
    const weapon = state.inventory.find(entry => entry.itemId === 1201)!;
    Object.assign(weapon, { broken: true, identified: true, refine: 3 });
    state.inventory = [weapon];
    delete state.equipment.weapon;

    const html = renderToStaticMarkup(createElement(Blacksmith, {
      catalog, snapshot: getSnapshot(state, catalog, 0), busy: false, command: async () => true,
    }));

    expect(html).not.toContain(`${catalog.items[weapon.itemId].name} +4`);
    expect(html).toContain('Repare antes de refinar.');
  });
});
