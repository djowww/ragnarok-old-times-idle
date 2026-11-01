import { describe, expect, it } from 'vitest';
import { applyCommand, createInitialState } from '../engine/index.js';
import { executeCommand } from '../engine/commands.js';
import { parseCommandRequest } from '../server/validation.js';
import { fixture } from './engine-fixture.js';
import type { GameCommand } from '../shared/types.js';

function setup() {
  const c = fixture();
  c.skills.identify = { id: 'identify', sourceName: 'MC_IDENTIFY', name: 'Identificar', description: '', kind: 'buff', maxLevel: 1, spCost: [10], power: [0], cooldownMs: 0, implementation: 'supported', manualUse: 'inventory' };
  c.classes.mage.skills.push('identify');
  const s = createInitialState(c, 0); s.job = 'mage'; s.sp = 20; s.learnedSkills.identify = 1;
  s.inventory.find(e => e.itemId === 1201)!.identified = false;
  s.inventory.push({ uid: 'lens', itemId: 611, quantity: 2, cards: [], refine: 0, favorite: false });
  const uid = s.inventory.find(e => e.itemId === 1201)!.uid;
  const command = { type: 'identify', uid, method: 'skill' } as GameCommand;
  return { c, s, uid, command };
}

describe('Identify inventory skill', () => {
  it('rejects inventory Identify in the combat rotation', () => {
    const { c, s } = setup();
    expect(() => applyCommand(s, c, { type: 'setRotation', skillIds: ['identify'] }, 0)).toThrow();
  });
  it.each(['TF_HIDING', 'MO_STEELBODY', 'LK_BERSERK'])('rejects skill use under %s without spending resources', sourceName => {
    const { c, s, command } = setup();
    c.skills.hiding = { ...c.skills.identify, id: 'hiding', sourceName };
    s.buffs.hiding = { expiresAt: 1000, effects: {} };
    const before = structuredClone(s);
    expect(() => executeCommand(s, c, command, 0)).toThrow();
    expect(s).toEqual(before);
  });
  it('accepts the optional route and rejects unknown routes at the request boundary', () => {
    const { command } = setup();
    expect(parseCommandRequest({ requestId: 'identify1', command }).command).toEqual(command);
    expect(() => parseCommandRequest({ requestId: 'identify1', command: { ...command, method: 'free' } })).toThrow();
  });
  it('pays 10 SP and identifies without consuming the magnifier', () => {
    const { c, s, uid, command } = setup();
    const next = applyCommand(s, c, command, 0);
    expect(next.inventory.find(e => e.uid === uid)!.identified).toBe(true);
    expect(next.sp).toBe(10);
    expect(next.inventory.find(e => e.uid === 'lens')!.quantity).toBe(2);
  });
  it('works without a magnifier and preserves the default magnifier route', () => {
    const { c, s, uid, command } = setup();
    const defaultNext = applyCommand(s, c, { type: 'identify', uid }, 0);
    expect(defaultNext.sp).toBe(20); expect(defaultNext.inventory.find(e => e.uid === 'lens')!.quantity).toBe(1);
    s.inventory = s.inventory.filter(e => e.uid !== 'lens');
    expect(applyCommand(s, c, command, 0).sp).toBe(10);
  });
  it.each(['unlearned', 'class', 'unsupported', 'sp', 'dead', 'identified', 'loot'] as const)('rejects %s without any mutation', reason => {
    const { c, s, uid, command } = setup();
    if (reason === 'unlearned') delete s.learnedSkills.identify;
    if (reason === 'class') s.job = 'novice';
    if (reason === 'unsupported') c.skills.identify.implementation = 'unsupported';
    if (reason === 'sp') s.sp = 9;
    if (reason === 'dead') s.hp = 0;
    if (reason === 'identified') s.inventory.find(e => e.uid === uid)!.identified = true;
    if (reason === 'loot') s.inventory.find(e => e.uid === uid)!.itemId = 909;
    const before = structuredClone(s);
    expect(() => executeCommand(s, c, command, 0)).toThrow();
    expect(s).toEqual(before);
  });
});
