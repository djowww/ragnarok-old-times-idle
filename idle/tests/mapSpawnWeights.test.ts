import { describe, expect, it } from 'vitest';
import catalog from '../content/catalog.json';
import { chooseAreaMonster } from '../shared/hunt';
import type { Catalog, GameState } from '../shared/types';

const content = catalog as unknown as Catalog;

describe('Hercules map spawn proportions', () => {
  it('uses Geffen Dungeon F1 source counts when choosing ambient monsters', () => {
    const area = content.areas.find(entry => entry.id === 'geffen_dungeon_f1')!;
    const state = {} as GameState;

    expect(area.spawnWeights).toEqual({ 1035: 30, 1031: 15, 1077: 25 });
    expect([0.4, 0.5, 0.9].map(roll => chooseAreaMonster(state, content, area, roll)))
      .toEqual([1035, 1031, 1077]);
  });
});
