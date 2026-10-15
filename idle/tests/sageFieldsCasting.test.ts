import { describe, expect, it } from 'vitest';
import raw from '../content/catalog.json';
import type { Catalog } from '../shared/types';
import { createInitialState } from '../engine';
import { executeCommand } from '../engine/commands';
import { addItem } from '../engine/state';
import { classicCastTime } from '../engine/classic';
import { derivedStats } from '../engine/stats';
import { clearOwnCast } from '../engine/ownCast';
import * as fields from '../engine/sageFields';
import { resolveSupportCast } from '../engine/supportCasts';
import { resolveSageFieldCast as resolve } from '../engine/sageFieldCasting';
function setup(level = 5, gems = 1) {
  const c = structuredClone(raw) as unknown as Catalog, s = createInitialState(c, 0);
  c.classes.sage.sp.fill(1000);
  Object.assign(s, { job: 'sage', status: 'hunting', areaId: 'prontera_south', hp: 30, sp: 1000, rotation: [],
    learnedSkills: { sa_volcano: level, sa_deluge: level, sa_violentgale: level } });
  s.fieldHero = { areaId: s.areaId!, from: { x: .48, y: .65 }, position: { x: .48, y: .65 },
    startedAt: 0, arrivedAt: 0, routeIndex: 0 };
  for (const id of ['sa_volcano', 'sa_deluge', 'sa_violentgale']) Object.assign(c.skills[id], { implementation: 'supported', manualUse: 'activate' });
  if (gems) addItem(s, c, 715, gems);
  return { s, c };
}
const gemCount = (s: ReturnType<typeof setup>['s']) => s.inventory.filter(e => e.itemId === 715).reduce((n, e) => n + e.quantity, 0);
describe('source Sage field cast/resource phases', () => {
  it('starts through real command, keeps the cast-start position and pays only at completed cast', () => {
    const { s, c } = setup(), d = derivedStats(s, c);
    expect(() => executeCommand(s, c, { type: 'useSkill', skillId: 'sa_volcano' }, 0)).not.toThrow();
    const cast = s.supportCast!;
    expect(cast).toMatchObject({ skillId: 'sa_volcano', level: 5, startedAt: 0, position: { x: .48, y: .65 } });
    expect(cast.endsAt).toBe(classicCastTime(5000, d.attributes!.dex));
    expect(s.sp).toBe(1000); expect(gemCount(s)).toBe(1);
    expect(resolve?.(s, c, cast.endsAt - 1)).toBe(false);
    expect(resolve?.(s, c, cast.endsAt)).toBe(true);
    expect(s.elementalField?.sourceName).toBe('SA_VOLCANO'); expect(s.sp).toBe(960); expect(gemCount(s)).toBe(0);
  });
  it.each([1, 2, 3, 4, 5])('pays source SP and gem once at level%s', level => {
    const { s, c } = setup(level);
    expect(() => executeCommand(s, c, { type: 'useSkill', skillId: 'sa_deluge' }, 0)).not.toThrow();
    const ends = s.supportCast!.endsAt;
    expect(resolve?.(s, c, ends)).toBe(true);
    expect(s.sp).toBe(1000 - [48, 46, 44, 42, 40][level - 1]); expect(gemCount(s)).toBe(0);
    expect(s.elementalField?.durationMs).toBe(level * 60000);
    expect(resolve?.(s, c, ends)).toBe(false);
  });
  it('allows cast begin with no gem, rejects cast end without paying SP, and keeps existing field', () => {
    const { s, c } = setup(5, 0);
    fields.placeSageField(s, c, c.skills.sa_volcano, 1, 0, { x: .48, y: .65 });
    const existing = structuredClone(s.elementalField);
    expect(() => executeCommand(s, c, { type: 'useSkill', skillId: 'sa_deluge' }, 1000)).not.toThrow();
    expect(resolve?.(s, c, s.supportCast!.endsAt)).toBe(false);
    expect(s.sp).toBe(1000); expect(s.elementalField).toEqual(existing);
  });
  it('carries remaining duration when switching and requires but does not consume the gem', () => {
    const { s, c } = setup(5, 1);
    fields.placeSageField(s, c, c.skills.sa_volcano, 1, 0, { x: .48, y: .65 });
    expect(() => executeCommand(s, c, { type: 'useSkill', skillId: 'sa_deluge' }, 20000)).not.toThrow();
    const ends = s.supportCast!.endsAt;
    expect(resolve?.(s, c, ends)).toBe(true); expect(s.sp).toBe(960); expect(gemCount(s)).toBe(1);
    expect(s.elementalField).toMatchObject({ sourceName: 'SA_DELUGE', expiresAt: 60000, durationMs: 60000 - ends });
  });
  it('interruption consumes neither SP nor gem and support dispatcher resolves fields once', () => {
    const { s, c } = setup();
    expect(() => executeCommand(s, c, { type: 'useSkill', skillId: 'sa_violentgale' }, 0)).not.toThrow();
    expect(clearOwnCast(s, c, 1000, 'teste')).toBe(true);
    expect(s.sp).toBe(1000); expect(gemCount(s)).toBe(1); expect(s.elementalField).toBeUndefined();
    expect(() => executeCommand(s, c, { type: 'useSkill', skillId: 'sa_violentgale' }, 2000)).not.toThrow();
    expect(resolveSupportCast(s, c, s.supportCast!.endsAt)).toBe(true);
    expect(s.elementalField?.sourceName).toBe('SA_VIOLENTGALE');
    expect(resolveSupportCast(s, c, 10000)).toBe(false);
  });
  it('uses Memorize only on a valid real cast and retains the captured field center while FreeCast moves', () => {
    const { s, c } = setup(); s.learnedSkills.sa_freecast = 10;
    s.learnedSkills.pf_memorize = 1; s.buffs.pf_memorize = { expiresAt: 100000, effects: {} };
    s.combatEffects = { memorizeCharges: 5 };
    const expected = Math.floor(classicCastTime(5000, derivedStats(s, c).attributes!.dex) / 2);
    expect(() => executeCommand(s, c, { type: 'useSkill', skillId: 'sa_volcano' }, 0)).not.toThrow();
    expect(s.supportCast?.endsAt).toBe(expected); expect(s.combatEffects.memorizeCharges).toBe(4);
    s.fieldHero!.from = s.fieldHero!.position = { x: 1.5, y: 1.5 };
    expect(resolve?.(s, c, expected)).toBe(true);
    expect(fields.fieldContains(s.elementalField!, { x: .48, y: .65 })).toBe(true);
    expect(fields.fieldContains(s.elementalField!, s.fieldHero!.position)).toBe(false);
  });
});
