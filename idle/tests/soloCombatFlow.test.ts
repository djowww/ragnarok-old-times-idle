import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Catalog, Skill } from '../shared/types';
import catalogJson from '../content/catalog.json';
import { BATTLE_HERO } from '../shared/battleSpatial';
import { advanceState, createInitialState } from '../engine/index';
import { beginBattle } from '../engine/encounters';
import { effectiveMonsterStatus } from '../engine/classicStatuses';
import * as stateTools from '../engine/state';
import { fixture } from './engine-fixture';

function setup(sources: string[] = []) {
  vi.spyOn(stateTools, 'random').mockReturnValue(0);
  const c = fixture();
  const sourceCatalog = catalogJson as unknown as Catalog;
  for (const source of sources) {
    const imported = Object.values(sourceCatalog.skills).find(skill => skill.sourceName === source)!;
    const skill: Skill = { ...structuredClone(imported), implementation: 'supported' };
    c.skills[skill.id] = skill;
    c.classes.novice.skills.push(skill.id);
  }
  c.monsters[1002].hp = 100000;
  c.monsters[1002].boss = false;
  c.monsters[1002].element = 'neutral';
  c.monsters[1002].stats.vit = 0;
  c.monsters[1002].stats.luk = 0;
  const s = createInitialState(c, 0);
  s.status = 'challenge';
  s.rotation = [];
  s.learnedSkills = {};
  s.autoPotion = { hpThreshold: 0, spThreshold: 0 };
  s.stats.dex = 99;
  beginBattle(s, c, 1002, 0, 'mastering');
  const enemy = s.battle!.enemies![0];
  enemy.position = { ...BATTLE_HERO };
  enemy.approachFrom = { ...BATTLE_HERO };
  enemy.arrivedAt = 0;
  enemy.enemyNextAttackAt = 999999;
  const skill = (source: string) => Object.values(c.skills).find(candidate => candidate.sourceName === source)!;
  return { c, s, skill };
}

afterEach(() => vi.restoreAllMocks());

describe('solo skill combat integration', () => {
  it('Gank steals before a killing basic hit, without paying SP or a cooldown', () => {
    const { c, s, skill } = setup(['RG_SNATCHER', 'TF_STEAL']);
    s.learnedSkills = { [skill('RG_SNATCHER').id]: 10, [skill('TF_STEAL').id]: 10 };
    s.battle!.enemies![0].hp = 1;
    const next = advanceState(s, c, 1000);
    const stolen = next.events.findIndex(event => event.kind === 'loot' && event.skillId === skill('TF_STEAL').id);
    const killed = next.events.findIndex(event => event.kind === 'kill');
    expect(stolen).toBeGreaterThanOrEqual(0);
    expect(killed).toBeGreaterThan(stolen);
    expect(next.sp).toBe(s.sp);
    expect(next.skillReadyAt[skill('TF_STEAL').id]).toBeUndefined();
  });
  it('Double Attack remains a normal attack for Gank', () => {
    const { c, s, skill } = setup(['RG_SNATCHER', 'TF_STEAL', 'TF_DOUBLE']);
    s.learnedSkills = Object.fromEntries(['RG_SNATCHER', 'TF_STEAL', 'TF_DOUBLE'].map(source => [skill(source).id, 10]));
    const next = advanceState(s, c, 1000);
    expect(next.events.some(event => event.kind === 'damage' && event.skillId === skill('TF_DOUBLE').id)).toBe(true);
    expect(next.events.some(event => event.kind === 'loot' && event.skillId === skill('TF_STEAL').id)).toBe(true);
  });
  it('casts Shield Strip and combines its defense penalty with Poison and Provoke', () => {
    const { c, s, skill } = setup(['RG_STRIPSHIELD']);
    const strip = skill('RG_STRIPSHIELD');
    s.learnedSkills[strip.id] = 5;
    s.rotation = [strip.id];
    c.monsters[1002].def = 100;
    s.battle!.enemies![0].statuses = {
      SC_POISON: { expiresAt: 99999, level: 1, nextTickAt: 99999 },
      SC_PROVOKE: { expiresAt: 99999, level: 5 },
    };
    const next = advanceState(s, c, 2000);
    const enemy = next.battle!.enemies![0];
    // 1000 ms cast reduced to 340 ms by DEX 99; source duration plus DEX delta.
    expect(enemy.statuses?.SC_NOEQUIPSHIELD).toMatchObject({ startsAt: 1340, expiresAt: 185340 });
    expect(effectiveMonsterStatus(c.monsters[1002], enemy.statuses, 2000)).toMatchObject({
      defPercent: 30, monster: { def: 100 },
    });
    expect(next.sp).toBe(s.sp - strip.spCost[4]);
  });
  it('Triple Attack is a skill hit and does not trigger Gank or weapon poison', () => {
    const { c, s, skill } = setup(['RG_SNATCHER', 'TF_STEAL', 'MO_TRIPLEATTACK', 'AS_ENCHANTPOISON']);
    s.learnedSkills = Object.fromEntries(['RG_SNATCHER', 'TF_STEAL', 'MO_TRIPLEATTACK', 'AS_ENCHANTPOISON'].map(source => [skill(source).id, 10]));
    s.buffs[skill('AS_ENCHANTPOISON').id] = { expiresAt: 99999, effects: {} };
    const next = advanceState(s, c, 1000);
    expect(next.events.some(event => event.kind === 'damage' && event.skillId === skill('MO_TRIPLEATTACK').id)).toBe(true);
    expect(next.events.some(event => event.kind === 'loot' && event.skillId === skill('TF_STEAL').id)).toBe(false);
    expect(next.battle!.enemies![0].statuses?.SC_POISON).toBeUndefined();
  });
  it('casts Enchant Poison, replaces Aspersio and poisons the next basic hit', () => {
    const { c, s, skill } = setup(['AS_ENCHANTPOISON', 'PR_ASPERSIO', 'ASC_EDP']);
    const enchant = skill('AS_ENCHANTPOISON');
    s.learnedSkills[enchant.id] = 10;
    s.rotation = [enchant.id];
    s.buffs[skill('PR_ASPERSIO').id] = { expiresAt: 99999, effects: {} };
    s.buffs[skill('ASC_EDP').id] = { expiresAt: 99999, effects: {} };
    const next = advanceState(s, c, 2000);
    expect(next.buffs[enchant.id]?.expiresAt).toBe(166000);
    expect(next.buffs[skill('PR_ASPERSIO').id]).toBeUndefined();
    expect(next.buffs[skill('ASC_EDP').id]).toBeDefined();
    expect(next.battle!.enemies![0].statuses?.SC_POISON?.expiresAt).toBeGreaterThan(2000);
    expect(next.sp).toBe(s.sp - enchant.spCost[9]);
  });
  it('does not cast or pay for Enchant Poison over a Sage property enchant', () => {
    const { c, s, skill } = setup(['AS_ENCHANTPOISON', 'SA_FROSTWEAPON']);
    s.learnedSkills[skill('AS_ENCHANTPOISON').id] = 10;
    s.rotation = [skill('AS_ENCHANTPOISON').id];
    s.buffs[skill('SA_FROSTWEAPON').id] = { expiresAt: 99999, effects: {} };
    const next = advanceState(s, c, 2000);
    expect(next.buffs[skill('AS_ENCHANTPOISON').id]).toBeUndefined();
    expect(next.buffs[skill('SA_FROSTWEAPON').id]).toBeDefined();
    expect(next.sp).toBe(s.sp);
  });
  it('does not proc poison on an offensive spell while the enchant is active', () => {
    const { c, s, skill } = setup(['AS_ENCHANTPOISON', 'MG_FIREBOLT']);
    s.learnedSkills[skill('AS_ENCHANTPOISON').id] = 10;
    s.learnedSkills[skill('MG_FIREBOLT').id] = 1;
    s.buffs[skill('AS_ENCHANTPOISON').id] = { expiresAt: 99999, effects: {} };
    s.rotation = [skill('MG_FIREBOLT').id];
    s.battle!.playerNextAttackAt = 99999;
    const next = advanceState(s, c, 2000);
    expect(next.events.some(event => event.kind === 'damage' && event.skillId === skill('MG_FIREBOLT').id)).toBe(true);
    expect(next.battle!.enemies![0].statuses?.SC_POISON).toBeUndefined();
  });
  it('ignores an inventory-only skill left in a saved combat rotation', () => {
    const { c, s, skill } = setup(['MC_IDENTIFY']);
    skill('MC_IDENTIFY').manualUse = 'inventory';
    s.learnedSkills[skill('MC_IDENTIFY').id] = 1;
    s.rotation = [skill('MC_IDENTIFY').id];
    const next = advanceState(s, c, 2000);
    expect(next.events.some(event => event.kind === 'skill' && event.skillId === skill('MC_IDENTIFY').id)).toBe(false);
    expect(next.sp).toBe(s.sp);
    expect(next.events.some(event => event.kind === 'damage')).toBe(true);
  });
});
