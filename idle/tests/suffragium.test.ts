import { describe, expect, it } from 'vitest';
import rawCatalog from '../content/catalog.json';
import type { Catalog } from '../shared/types.js';
import { advanceState, applyCommand, createInitialState } from '../engine/index.js';
import { beginBattle } from '../engine/encounters.js';
import { classicCastTime } from '../engine/classic.js';
import { startOwnCast } from '../engine/ownCast.js';
import { derivedStats } from '../engine/stats.js';
import { classicBuffActive } from '../engine/classicBuffs.js';
import { suffragiumCanStart } from '../engine/suffragium.js';

const catalog = rawCatalog as unknown as Catalog;
const skill = catalog.skills.pr_suffragium;
const holyLight = Object.values(catalog.skills).find(row => row.sourceName === 'AL_HOLYLIGHT')!;

function setup(job = 'priest', level = 3) {
  const c = structuredClone(catalog);
  const s = createInitialState(c, 0, 'suffragium-test');
  s.job = job;
  s.baseLevel = 50;
  s.jobLevel = 50;
  s.stats.dex = 20;
  s.sp = 300;
  s.status = 'town';
  s.learnedSkills = { pr_suffragium: level, pr_impositio: 2, [holyLight.id]: 1 };
  return { s, c, buff: c.skills.pr_suffragium, spell: c.skills[holyLight.id] };
}

describe('Suffragium solo pre-renewal', () => {
  it('promotes the imported skill with its source duration and self-target data', () => {
    expect(skill).toMatchObject({ implementation: 'supported', manualUse: 'activate', targetType: 'support',
      statusEffect: 'SC_SUFFRAGIUM', statusDurationMs: [30000, 20000, 10000], spCost: [8, 8, 8] });
    expect(skill.unsupportedReason).toBeUndefined();
  });

  it('casts on the player without a party, pays once, and applies the level-based status duration', () => {
    const { s, c, buff } = setup();
    const command = applyCommand(s, c, { type: 'useSkill', skillId: buff.id }, 0);
    expect(command.supportCast).toBeUndefined();
    expect(command.buffs[buff.id]).toMatchObject({ startsAt: 0, expiresAt: 10000, effects: { castReductionPct: 45 } });
    const resolved = advanceState(command, c, 1);
    expect(resolved.sp).toBe(292);
    expect(resolved.buffs[buff.id]).toMatchObject({ startsAt: 0, expiresAt: 10000,
      effects: { castReductionPct: 45 } });
    expect(resolved.events.some(event => event.kind === 'status-start' && event.statusName === 'SC_SUFFRAGIUM')).toBe(true);
    expect(classicBuffActive(resolved, c, 'PR_SUFFRAGIUM', 9999)).toBe(true);
    expect(classicBuffActive(resolved, c, 'PR_SUFFRAGIUM', 10000)).toBe(false);
    expect(resolved.events.find(event => event.kind === 'skill' && event.skillId === buff.id))
      .toMatchObject({ targetActorId: resolved.id });
  });

  it('reduces the next skill cast by 15 percent per level and consumes the status once', () => {
    const { s, c, buff, spell } = setup();
    s.buffs[buff.id] = { startsAt: 0, expiresAt: 30000, effects: { castReductionPct: 15 } };
    const base = spell.castTimeMs?.[0] ?? 0;
    const dex = derivedStats(s, c).attributes?.dex ?? s.stats.dex;
    const expected = Math.floor(classicCastTime(base, dex) * 0.85);
    startOwnCast(s, c, spell, 1, 1000);
    expect(s.supportCast?.endsAt).toBe(1000 + expected);
    expect(s.buffs[buff.id]).toBeUndefined();
    expect(derivedStats(s, c).effects.castReductionPct ?? 0).toBe(0);
  });

  it('supports all levels and rejects an invalid class, level, silence, or concurrent cast', () => {
    for (const level of [1, 2, 3]) {
      const { s, c, buff } = setup('high_priest', level);
      const resolved = applyCommand(s, c, { type: 'useSkill', skillId: buff.id }, 0);
      expect(resolved.buffs[buff.id]?.effects.castReductionPct).toBe(level * 15);
      expect(resolved.buffs[buff.id]?.expiresAt).toBe([30000, 20000, 10000][level - 1]);
    }
    const invalid = setup();
    expect(suffragiumCanStart(invalid.s, invalid.c, invalid.buff, 4, 0)).toBe(false);
    invalid.s.playerStatuses = { SC_SILENCE: { startsAt: 0, expiresAt: 1000, level: 1 } };
    expect(suffragiumCanStart(invalid.s, invalid.c, invalid.buff, 3, 0)).toBe(false);
    delete invalid.s.playerStatuses;
    invalid.s.supportCast = { skillId: 'other', level: 1, startedAt: 0, endsAt: 500 } as NonNullable<typeof invalid.s.supportCast>;
    expect(suffragiumCanStart(invalid.s, invalid.c, invalid.buff, 3, 0)).toBe(false);
    const { s, c, buff } = setup('mage');
    expect(() => applyCommand(s, c, { type: 'useSkill', skillId: buff.id }, 0)).toThrow();
  });

  it('uses Suffragium from the AFK rotation on self before the next spell', () => {
    const { s, c, buff, spell } = setup();
    s.status = 'challenge';
    beginBattle(s, c, 1002, 0, 'mastering');
    for (const enemy of s.battle!.enemies ?? []) {
      enemy.hostile = false;
      enemy.enemyNextAttackAt = Number.MAX_SAFE_INTEGER;
      enemy.hp = enemy.maxHp = 100000;
    }
    s.battle!.playerNextAttackAt = Number.MAX_SAFE_INTEGER;
    s.battle!.playerNextSkillAt = 0;
    s.battle!.playerActionReadyAt = 0;
    const result = advanceState(applyCommand(s, c, { type: 'setRotation', skillIds: [buff.id, spell.id] }, 0), c, 6000);
    const cast = result.events.find(event => event.kind === 'cast' && event.skillId === spell.id);
    const base = spell.castTimeMs?.[0] ?? 0;
    expect(result.events.some(event => event.kind === 'skill' && event.skillId === buff.id && event.targetActorId === result.id)).toBe(true);
    const dex = derivedStats(result, c).attributes?.dex ?? result.stats.dex;
    expect(cast?.castMs).toBe(Math.floor(classicCastTime(base, dex) * 0.55));
    expect(result.buffs[buff.id]).toBeUndefined();
  });
});
