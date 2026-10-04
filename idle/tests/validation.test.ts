import { describe, expect, it } from 'vitest';
import { parseCommandRequest } from '../server/validation.js';

describe('command boundary', () => {
  const requestId = 'manual-test-0001';
  it('rejects purchases with negative or fractional quantities before changing state', () => {
    for (const quantity of [-1, 0, 1.5, Number.NaN, 1e9]) {
      expect(() => parseCommandRequest({ requestId, command: { type: 'buy', itemId: 501, quantity } })).toThrow();
    }
  });
  it('rejects unknown commands and unsolicited reward fields', () => {
    expect(() => parseCommandRequest({ requestId, command: { type: 'grantExperience', amount: 1000 } })).toThrow();
    expect(() => parseCommandRequest({ requestId, command: { type: 'startHunt', areaId: 'prontera', baseExp: 999 } })).toThrow();
  });
  it('requires a retry identifier and rejects oversized identifiers', () => {
    expect(() => parseCommandRequest({ command: { type: 'stop' } })).toThrow();
    expect(() => parseCommandRequest({ requestId: 'x'.repeat(65), command: { type: 'stop' } })).toThrow();
  });
  it('rejects malformed rotations, thresholds, and stat names', () => {
    expect(() => parseCommandRequest({ requestId, command: { type: 'setRotation', skillIds: ['a', 'a'] } })).toThrow();
    expect(() => parseCommandRequest({ requestId, command: { type: 'setRotation', skillIds: ['a', 'b', 'c', 'd'] } })).toThrow();
    expect(() => parseCommandRequest({ requestId, command: { type: 'setPotions', hpThreshold: 101, spThreshold: 30 } })).toThrow();
    expect(() => parseCommandRequest({ requestId, command: { type: 'allocate', stat: 'power', amount: 1 } })).toThrow();
  });
  it('accepts a real purchase intention without converting it into a reward', () => {
    expect(parseCommandRequest({ requestId, command: { type: 'buy', itemId: 501, quantity: 3 } }))
      .toEqual({ requestId, command: { type: 'buy', itemId: 501, quantity: 3 } });
  });
});
