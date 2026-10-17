import { describe, expect, it } from 'vitest';
import rawCatalog from '../content/catalog.json';
import type { Catalog } from '../shared/types.js';
import { advanceState, applyCommand, createInitialState } from '../engine/index.js';
import { resolveProvidenceCast, providenceCanStart } from '../engine/providence.js';
import { beginBattle } from '../engine/encounters.js';
import { random } from '../engine/state.js';
import { classicBuffActive } from '../engine/classicBuffs.js';
import { classicIncomingSkillReduction } from '../engine/classic.js';

const catalog = rawCatalog as unknown as Catalog;

function setup(job = 'crusader', level = 3) {
  const c = structuredClone(catalog);
  const s = createInitialState(c, 0, 'providence-test');
  s.job = job;
  s.baseLevel = 60;
  s.jobLevel = 40;
  s.stats.dex = 20;
  s.sp = 300;
  s.status = 'town';
  s.learnedSkills = { al_dp: 5, heal: 5, cr_providence: level };
  return { s, c, skill: c.skills.cr_providence };
}

describe('Providência solo pré-renovação', () => {
  it('importa a habilidade como buff próprio com custo, conjuração e duração do Hercules', () => {
    const { skill } = setup();
    expect(skill).toMatchObject({
      implementation: 'supported',
      manualUse: 'activate',
      targetType: 'support',
      statusEffect: 'SC_PROVIDENCE',
      statusDurationMs: [180000, 180000, 180000, 180000, 180000],
      spCost: [30, 30, 30, 30, 30],
      castTimeMs: [3000, 3000, 3000, 3000, 3000],
    });
    expect(skill.unsupportedReason).toBeUndefined();
  });

  it('conjura sem grupo, paga 30 SP e mantém o status ativo pelo tempo de origem', () => {
    const { s, c, skill } = setup();
    const resolved = applyCommand(s, c, { type: 'useSkill', skillId: skill.id }, 0);
    const castEndsAt = resolved.supportCast?.endsAt;
    expect(castEndsAt).toBeGreaterThan(0);
    expect(castEndsAt).toBeLessThan(3000);
    expect(resolveProvidenceCast(resolved, c, castEndsAt!)).toBe(true);
    expect(resolved.sp).toBe(270);
    expect(classicBuffActive(resolved, c, 'CR_PROVIDENCE', castEndsAt!)).toBe(true);
    expect(resolved.buffs[skill.id]?.expiresAt).toBe(castEndsAt! + 180000);
    expect(resolved.events.some(event => event.kind === 'status-start' && event.statusName === 'SC_PROVIDENCE')).toBe(true);
  });

  it('reduz 5% por nível contra demônios e dano Sagrado, sem afetar outros alvos', () => {
    const active = { CR_PROVIDENCE: 3 };
    expect(classicIncomingSkillReduction({}, 'demon', 'neutral', 0, active)).toBe(0.85);
    expect(classicIncomingSkillReduction({}, 'normal', 'holy', 0, active)).toBe(0.85);
    expect(classicIncomingSkillReduction({}, 'demon', 'holy', 0, active)).toBeCloseTo(0.7225);
    expect(classicIncomingSkillReduction({}, 'undead', 'neutral', 0, active)).toBe(1);
  });

  it('aceita a rotação AFK e não reconjura enquanto o status está ativo', () => {
    const { s, c, skill } = setup('paladin', 5);
    const configured = applyCommand(s, c, { type: 'setRotation', skillIds: [skill.id] }, 0);
    configured.status = 'challenge';
    beginBattle(configured, c, 1002, 0, 'mastering');
    for (const enemy of configured.battle!.enemies ?? []) {
      enemy.hostile = false;
      enemy.enemyNextAttackAt = Number.MAX_SAFE_INTEGER;
      enemy.hp = enemy.maxHp = 100000;
    }
    configured.battle!.playerNextAttackAt = Number.MAX_SAFE_INTEGER;
    configured.battle!.playerNextSkillAt = 0;
    configured.battle!.playerActionReadyAt = 0;
    const result = advanceState(configured, c, 15000);
    expect(result.events.filter(event => event.kind === 'skill' && event.skillId === skill.id))
      .toHaveLength(1);
    expect(result.combatEffects?.buffLevels?.[skill.id]).toBe(5);
    expect(classicBuffActive(result, c, 'CR_PROVIDENCE', 15000)).toBe(true);
    expect(providenceCanStart(result, c, skill, 5, 15000)).toBe(false);
    expect(providenceCanStart(result, c, skill, 5, result.buffs[skill.id].expiresAt)).toBe(true);
  });

  it('rejeita classe inválida, silêncio e SP insuficiente', () => {
    const wrong = setup('mage');
    expect(() => applyCommand(wrong.s, wrong.c, { type: 'useSkill', skillId: wrong.skill.id }, 0))
      .toThrow();
    const { s, c, skill } = setup();
    s.sp = 29;
    expect(providenceCanStart(s, c, skill, 3, 0)).toBe(false);
    s.sp = 100;
    s.playerStatuses = { SC_SILENCE: { startsAt: 0, expiresAt: 1000, level: 1 } };
    expect(providenceCanStart(s, c, skill, 3, 0)).toBe(false);
  });


  it('consome o sorteio de status garantido do Hercules uma única vez', () => {
    const { s, c, skill } = setup();
    const casting = applyCommand(s, c, { type: 'useSkill', skillId: skill.id }, 0);
    const expected = structuredClone(casting);
    random(expected);
    const at = casting.supportCast!.endsAt;
    expect(resolveProvidenceCast(casting, c, at)).toBe(true);
    expect(casting.rngState).toBe(expected.rngState);
    expect(resolveProvidenceCast(casting, c, at)).toBe(false);
    expect(casting.rngState).toBe(expected.rngState);
  });

});
