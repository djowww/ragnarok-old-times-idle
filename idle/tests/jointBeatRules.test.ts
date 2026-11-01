import { describe, expect, it } from 'vitest';
import {
  chooseJointBeatPart,
  jointBeatDamagePercent,
  jointBeatStatusChancePercent,
  mergeJointBeatParts,
} from '../engine/jointBeatRules';

describe('Joint Beat source rules', () => {
  it.each([
    [0, 'ankle'],
    [1 / 6, 'wrist'],
    [2 / 6, 'knee'],
    [3 / 6, 'shoulder'],
    [4 / 6, 'waist'],
    [5 / 6, 'neck'],
    [1, 'neck'],
  ] as const)('selects the source body part for roll %s', (roll, expected) => {
    expect(chooseJointBeatPart(roll)).toBe(expected);
  });

  it.each([
    [1, 'ankle', 60], [5, 'wrist', 100], [10, 'waist', 150],
    [1, 'neck', 20], [5, 'neck', 100], [10, 'neck', 200],
  ] as const)('calculates level %s %s damage as %s percent', (level, part, expected) => {
    expect(jointBeatDamagePercent(level, part)).toBe(expected);
  });

  it.each([[1, 10], [5, 30], [10, 55]] as const)(
    'uses the Hercules status chance at level %s', (level, expected) => {
      expect(jointBeatStatusChancePercent(level)).toBe(expected);
    },
  );

  it('accumulates distinct body parts without duplicates', () => {
    expect(mergeJointBeatParts(['wrist', 'ankle'], 'ankle')).toEqual(['wrist', 'ankle']);
    expect(mergeJointBeatParts(['wrist', 'ankle'], 'knee')).toEqual(['wrist', 'ankle', 'knee']);
  });
});
