import { describe, expect, it } from 'vitest';
import rawCatalog from '../content/catalog.json';
import type { Catalog } from '../shared/types';
import { createInitialState, applyCommand } from '../engine';
import * as helper from '../engine/pickStone';
const c = rawCatalog as unknown as Catalog;
function ready() {
  let s = createInitialState(c, 0); s.job = 'thief'; s.jobLevel = 1; s.skillPoints = 2;
  for (const skillId of ['tf_pickstone', 'tf_throwstone']) s = applyCommand(s, c, { type: 'learnSkill', skillId }, 0);
  s.rotation = ['tf_pickstone', 'tf_throwstone']; return s;
}
describe('Pick Stone pure eligibility', () => {
  it('uses strictly below 50 percent before adding the three-weight stone', () => {
    expect(helper?.PICK_STONE_ITEM_ID).toBe(7049);
    expect(helper?.canPickStone({ weight: 999, maxWeight: 2000, stoneWeight: 3 })).toBe(true);
    expect(helper?.canPickStone({ weight: 1000, maxWeight: 2000, stoneWeight: 3 })).toBe(false);
    expect(helper?.canPickStone({ weight: 0, maxWeight: 2, stoneWeight: 3 })).toBe(false);
  });
  it.each([
    { weight: NaN, maxWeight: 2000, stoneWeight: 3 }, { weight: Infinity, maxWeight: 2000, stoneWeight: 3 },
    { weight: -1, maxWeight: 2000, stoneWeight: 3 }, { weight: 0, maxWeight: 0, stoneWeight: 3 },
    { weight: 0, maxWeight: Infinity, stoneWeight: 3 }, { weight: 0, maxWeight: NaN, stoneWeight: 3 },
    { weight: 0, maxWeight: 2000, stoneWeight: NaN }, { weight: 0, maxWeight: 2000, stoneWeight: -3 },
  ])('rejects invalid numerical capacity %j', input => expect(helper?.canPickStone(input)).toBe(false));
  it('counts all stone stacks including favorites and does not mutate RNG/state', () => {
    const s = ready(); s.inventory = [
      { uid: 'stone-1', itemId: 7049, quantity: 2, favorite: true, refine: 0, cards: [] },
      { uid: 'stone-2', itemId: 7049, quantity: 3, favorite: false, refine: 0, cards: [] },
    ];
    const before = structuredClone(s); expect(helper?.stoneCount(s)).toBe(5);
    expect(helper?.pickStoneAfkNeeded(s, c)).toBe(false); expect(s).toEqual(before);
  });
  it.each([false, true])('requires a learned available rotation pair in either order %s', reverse => {
    const s = ready(); if (reverse) s.rotation.reverse(); const before = structuredClone(s);
    expect(helper?.pickStoneAfkNeeded(s, c)).toBe(true); expect(s).toEqual(before);
  });
  it.each(['throw-not-learned', 'pick-not-learned', 'only-pick', 'class', 'throw-unsupported', 'pick-unsupported', 'throw-manual', 'missing-item'] as const)('rejects %s', invalid => {
    const s = ready(), copy = structuredClone(c);
    if (invalid === 'throw-not-learned') delete s.learnedSkills.tf_throwstone;
    if (invalid === 'pick-not-learned') delete s.learnedSkills.tf_pickstone;
    if (invalid === 'only-pick') s.rotation = ['tf_pickstone'];
    if (invalid === 'class') s.job = 'novice';
    if (invalid === 'throw-unsupported') copy.skills.tf_throwstone.implementation = 'unsupported';
    if (invalid === 'pick-unsupported') copy.skills.tf_pickstone.implementation = 'unsupported';
    if (invalid === 'throw-manual') copy.skills.tf_throwstone.manualUse = 'inventory';
    if (invalid === 'missing-item') delete copy.items[7049];
    expect(helper?.pickStoneAfkNeeded(s, copy)).toBe(false);
  });
});
