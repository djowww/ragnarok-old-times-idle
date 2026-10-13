import { describe, expect, it } from 'vitest';
import { applyCommand, createInitialState } from '../engine/index';
import { parseCommandRequest } from '../server/validation';
import { fixture } from './engine-fixture';
import type { GameCommand } from '../shared/types';
function setup() {
  const c = fixture();
  c.classes.mage.skills = ['hindsight', 'fire_bolt', 'cold_bolt'];
  c.skills.hindsight = { ...c.skills.firebolt, id: 'hindsight', sourceName: 'SA_AUTOSPELL', kind: 'buff', implementation: 'supported' };
  for (const id of ['fire_bolt', 'cold_bolt']) c.skills[id] = { ...c.skills.firebolt, id, sourceName: id === 'fire_bolt' ? 'MG_FIREBOLT' : 'MG_COLDBOLT', implementation: 'supported' };
  const s = createInitialState(c, 0); s.job = 'mage'; s.learnedSkills = { hindsight: 10, fire_bolt: 5, cold_bolt: 3 };
  return { s, c };
}
const set = (skillId: string | null): GameCommand => ({ type: 'setAutospell', skillId });
describe('explicit Hindsight spell configuration', () => {
  it('persists a permitted learned spell and permits clearing the choice', () => {
    const {s,c} = setup();
    s.buffs.SA_AUTOSPELL = { expiresAt: 10000, effects: {} };
    const next = applyCommand(s,c,set('fire_bolt'),0);
    expect(next.autospellSkillId).toBe('fire_bolt');
    expect(next.buffs.SA_AUTOSPELL).toEqual({ expiresAt: 10000, effects: {} });
    expect(s.autospellSkillId).toBeUndefined();
    expect(applyCommand(next,c,set(null),0).autospellSkillId).toBeUndefined();
  });
  it('rejects unknown, unlearned, unsupported and out of tree spells', () => {
    for (const mode of ['unknown','unlearned','unsupported','tree']) {
      const {s,c} = setup();
      if (mode === 'unlearned') s.learnedSkills.fire_bolt = 0;
      if (mode === 'unsupported') c.skills.fire_bolt.implementation = 'unsupported';
      if (mode === 'tree') c.classes.mage.skills = ['hindsight'];
      expect(() => applyCommand(s,c,set(mode === 'unknown' ? 'SM_BASH' : 'fire_bolt'),0)).toThrow('Escolha uma magia aprendida e disponível para Desejo Arcano.');
    }
  });
  it('requires learned supported Hindsight in the current class tree', () => {
    for (const mode of ['unlearned','unsupported','tree']) {
      const {s,c} = setup();
      if (mode === 'unlearned') s.learnedSkills.hindsight = 0;
      if (mode === 'unsupported') c.skills.hindsight.implementation = 'unsupported';
      if (mode === 'tree') c.classes.mage.skills = ['fire_bolt'];
      expect(() => applyCommand(s,c,set('fire_bolt'),0)).toThrow('Aprenda Desejo Arcano para escolher sua magia automática.');
    }
  });
  it('accepts only a token spell or explicit null at the API boundary', () => {
    for (const skillId of ['fire_bolt',null]) expect(parseCommandRequest({requestId:'config_123',command:set(skillId)}).command).toEqual(set(skillId));
    for (const skillId of [undefined,123,'']) expect(() => parseCommandRequest({requestId:'config_123',command:{type:'setAutospell',skillId}})).toThrow();
  });
});
