import { describe, expect, it } from 'vitest';
import { executeCommand } from '../engine/commands';
import { rogueSetup, slot } from './rogue-copy-fixture';

describe('copied skill commands and job ownership', () => {
  it('admits only the valid copied slot to rotation without learning or spending points', () => {
    const { s, c } = rogueSetup(); (s as any).copiedSkill = { skillId: 'fire_bolt', level: 3 };
    const paid = { ...s.learnedSkills }, points = s.skillPoints;
    expect(() => executeCommand(s, c, { type: 'setRotation', skillIds: ['fire_bolt'] }, 0)).not.toThrow();
    expect(s.rotation).toEqual(['fire_bolt']); expect(s.learnedSkills).toEqual(paid); expect(s.skillPoints).toBe(points);
    expect(() => executeCommand(s, c, { type: 'setRotation', skillIds: ['cold_bolt'] }, 0)).toThrow();
    expect(() => executeCommand(s, c, { type: 'learnSkill', skillId: 'fire_bolt' }, 0)).toThrow();
  });
  it.each([0, -1, 1.5, NaN])('rejects malformed or unavailable copied level %s', level => {
    const { s, c } = rogueSetup(); (s as any).copiedSkill = { skillId: 'fire_bolt', level };
    expect(() => executeCommand(s, c, { type: 'setRotation', skillIds: ['fire_bolt'] }, 0)).toThrow();
  });
  it('fails closed when the permanent passive is removed without changing the saved copy', () => {
    const { s, c } = rogueSetup(); s.copiedSkill = { skillId: 'fire_bolt', level: 3 }; delete s.learnedSkills.rg_plagiarism;
    expect(() => executeCommand(s, c, { type: 'setRotation', skillIds: ['fire_bolt'] }, 0)).toThrow();
    expect(s.copiedSkill).toEqual({ skillId: 'fire_bolt', level: 3 }); expect(s.skillPoints).toBe(0);
  });
  it('clears clone on a normal job change without refunding the temporary level', () => {
    const { s, c } = rogueSetup(); s.job = 'thief'; s.status = 'town'; s.battle = null; s.jobLevel = 40;
    s.family = 'thief'; (s as any).copiedSkill = { skillId: 'fire_bolt', level: 3 }; s.rotation = ['fire_bolt'];
    const points = s.skillPoints;
    executeCommand(s, c, { type: 'changeClass', classId: 'rogue' }, 0);
    expect(slot(s)).toBeUndefined(); expect(s.rotation).toEqual([]); expect(s.skillPoints).toBe(points);
  });
  it('clears the clone on rebirth and preserves original inventory entries', () => {
    const { s, c } = rogueSetup(); s.status = 'town'; s.battle = null; s.baseLevel = 99; s.jobLevel = 50; s.zeny = 50000;
    (s as any).copiedSkill = { skillId: 'fire_bolt', level: 3 }; s.rotation = ['fire_bolt'];
    const items = structuredClone(s.inventory);
    executeCommand(s, c, { type: 'rebirth' }, 0);
    expect(slot(s)).toBeUndefined(); expect(s.inventory).toEqual(items);
  });
});
