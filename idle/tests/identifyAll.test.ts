import { describe, expect, it } from 'vitest';
import { applyCommand, createInitialState } from '../engine/index.js';
import { executeCommand } from '../engine/commands.js';
import { parseCommandRequest } from '../server/validation.js';
import { fixture } from './engine-fixture.js';
import type { GameCommand } from '../shared/types.js';

function setup() {
  const c = fixture(), s = createInitialState(c, 0);
  s.zeny = 500; s.equipment = {};
  const knife = s.inventory.find(e => e.itemId === 1201)!;
  knife.identified = false;
  s.inventory.push({ ...structuredClone(knife), uid: 'rare-drop', identified: false,
    rarity: 'legendary', rarityBonus: { stat: 'str', value: 5 } });
  s.inventory.push({ ...structuredClone(knife), uid: 'legacy-gear', identified: undefined });
  return { c, s, knife };
}
const batch = (maxCost: number) => ({ type: 'identifyAll', maxCost } as GameCommand);

describe('bulk equipment identification', () => {
  it('identifies all unknown equipment for the displayed zeny budget without consuming lenses or rerolling rarity', () => {
    const { c, s } = setup();
    const before = structuredClone(s);
    const next = applyCommand(s, c, batch(80), 0);
    expect(next.zeny).toBe(420);
    expect(next.inventory.filter(e => e.identified === false)).toHaveLength(0);
    expect(next.inventory.find(e => e.uid === 'rare-drop')).toMatchObject({
      identified: true, rarity: 'legendary', rarityBonus: { stat: 'str', value: 5 },
    });
    expect(next.inventory.find(e => e.uid === 'legacy-gear')?.identified).toBeUndefined();
    expect(next.inventory.filter(e => c.items[e.itemId]?.type !== 'equipment'))
      .toEqual(before.inventory.filter(e => c.items[e.itemId]?.type !== 'equipment'));
  });
  it.each(['funds', 'quote', 'empty'] as const)('rejects %s without charging or identifying a subset', reason => {
    const { c, s } = setup();
    if (reason === 'funds') s.zeny = 79;
    if (reason === 'empty') for (const e of s.inventory) e.identified = true;
    const before = structuredClone(s);
    expect(() => executeCommand(s, c, batch(reason === 'quote' ? 40 : 80), 0)).toThrow();
    expect(s).toEqual(before);
  });
  it('never charges more than the quote when a new unidentified drop arrives', () => {
    const { c, s } = setup();
    const before = structuredClone(s);
    expect(() => executeCommand(s, c, batch(40), 0)).toThrow(/valor|custo|preço/i);
    expect(s).toEqual(before);
  });
  it('validates the cost ceiling and rejects client supplied item lists or prices', () => {
    expect(parseCommandRequest({ requestId: 'bulk-identify-ok', command: batch(80) }).command).toEqual(batch(80));
    for (const maxCost of [-1, 0.5, NaN, Infinity, '80']) {
      expect(() => parseCommandRequest({ requestId: 'bulk-identify-invalid', command: { type: 'identifyAll', maxCost } })).toThrow();
    }
    expect(() => parseCommandRequest({ requestId: 'bulk-identify-forged', command: {
      type: 'identifyAll', maxCost: 80, unitPrice: 1, uids: ['rare-drop'],
    } })).toThrow();
  });
});
