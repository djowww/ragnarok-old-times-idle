import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Catalog } from '../shared/types.js';
import rawCatalog from '../content/catalog.json';
import { BATTLE_HERO } from '../shared/battleSpatial.js';
import { advanceState, applyCommand, createInitialState } from '../engine/index.js';
import { beginBattle } from '../engine/encounters.js';
import { derivedStats } from '../engine/stats.js';
import * as stateTools from '../engine/state.js';
import { sacrificeBaseDamage, sacrificeHpCost } from '../engine/guardianSacrificeRules.js';

const sourceSkill = (c: Catalog, source: string) => Object.values(c.skills).find(skill => skill.sourceName === source)!;
function setup(sources: string[] = []) {
  const c = structuredClone(rawCatalog) as unknown as Catalog;
  for (const source of sources) sourceSkill(c, source).implementation = 'supported';
  const s = createInitialState(c, 0, 'guardian-test');
  s.job = 'paladin'; s.baseLevel = 1; s.jobLevel = 50;
  c.classes.paladin.hp[0] = 10000; c.classes.paladin.sp[0] = 10000;
  s.stats = { str: 99, agi: 1, vit: 1, int: 1, dex: 99, luk: 1 };
  s.hp = 10000; s.sp = 1000; s.status = 'challenge'; s.rotation = [];
  s.autoPotion = { hpThreshold: 0, spThreshold: 0 };
  // Test-only class-tree inclusion keeps runtime tests independent of the later catalog promotion.
  for (const source of sources) {
    const skill = sourceSkill(c, source);
    const id = skill.id;
    if (!c.classes.paladin.skills.includes(id)) c.classes.paladin.skills.push(id);
    for (const requirement of skill.prerequisitesByClass?.paladin ?? skill.prerequisites ?? []) s.learnedSkills[requirement.skillId] = requirement.level;
  }
  beginBattle(s, c, 1002, 0, 'mastering');
  const enemy = s.battle!.enemies![0];
  Object.assign(c.monsters[1002], { hp: 100000, attack: [100, 100], attackDelay: 2000, attackRange: 1, baseExp: 0, jobExp: 0 });
  Object.assign(enemy, { hp: 100000, maxHp: 100000, position: { ...BATTLE_HERO }, approachFrom: { ...BATTLE_HERO }, arrivedAt: 0, startedAt: 0, enemyNextAttackAt: 1000 });
  s.battle!.targetId = enemy.id; s.battle!.playerNextAttackAt = Number.MAX_SAFE_INTEGER;
  s.battle!.playerNextSkillAt = sources.includes('PA_SACRIFICE') ? 0 : Number.MAX_SAFE_INTEGER;
  return { c, s, enemy };
}
function manualSacrificeSetup() {
  const fixture = setup(['PA_SACRIFICE']);
  const skill = sourceSkill(fixture.c, 'PA_SACRIFICE');
  skill.manualUse = 'activate';
  fixture.s.learnedSkills[skill.id] = 5;
  return { ...fixture, skill };
}
function learnByCommand(s: ReturnType<typeof setup>['s'], c: Catalog, source: string, level: number, at = 0): ReturnType<typeof setup>['s'] {
  const skill = sourceSkill(c, source);
  for (const prerequisite of skill.prerequisitesByClass?.[s.job] ?? skill.prerequisites ?? []) {
    const required = c.skills[prerequisite.skillId]!;
    if ((s.learnedSkills[required.id] ?? 0) < prerequisite.level)
      s = learnByCommand(s, c, required.sourceName!, prerequisite.level, at);
  }
  while ((s.learnedSkills[skill.id] ?? 0) < level)
    s = applyCommand(s, c, { type: 'learnSkill', skillId: skill.id }, at);
  return s;
}
const active = (s: ReturnType<typeof setup>['s'], c: Catalog, source: string, level: number, expiresAt = Number.MAX_SAFE_INTEGER) => {
  const skill = sourceSkill(c, source);
  s.buffs[skill.id] = { expiresAt, effects: {} };
  (s.combatEffects ??= {}).buffLevels ??= {};
  s.combatEffects.buffLevels![skill.id] = level;
};
function readySacrificeHit(s: ReturnType<typeof setup>['s'], c: Catalog, enemy: ReturnType<typeof setup>['enemy'], level = 5) {
  const skill = sourceSkill(c, 'PA_SACRIFICE');
  active(s, c, 'PA_SACRIFICE', level);
  s.combatEffects!.sacrifice = { level, charges: 5 };
  s.battle!.playerNextAttackAt = 250;
  s.battle!.playerNextSkillAt = Number.MAX_SAFE_INTEGER;
  s.battle!.playerActionReadyAt = 0;
  enemy.enemyNextAttackAt = Number.MAX_SAFE_INTEGER;
  return skill;
}
afterEach(() => vi.restoreAllMocks());

describe('Guardian and Sacrifice combat flow', () => {
  it('activates Shrink with one status roll and 15 modified SP, then cancels without SP or RNG', () => {
    const { c, s } = setup(['CR_SHRINK']);
    const skill = sourceSkill(c, 'CR_SHRINK');
    s.status = 'town'; s.battle = null; s.sp = 100;
    const shield = s.inventory.find(item => item.uid === s.equipment.armor)!;
    c.items[shield.itemId].slot = 'shield'; s.equipment.shield = shield.uid; delete s.equipment.armor;
    s.learnedSkills[skill.id] = 1;
    const rng = vi.spyOn(stateTools, 'random').mockReturnValue(0.5);

    const enabled = applyCommand(s, c, { type: 'toggleBuff', skillId: skill.id }, 0);

    expect(enabled.sp).toBe(85);
    expect(enabled.buffs[skill.id]?.expiresAt).toBe(300000);
    expect(enabled.combatEffects?.buffLevels?.[skill.id]).toBe(1);
    expect(rng).toHaveBeenCalledTimes(1);
    rng.mockClear(); enabled.sp = 0;

    const disabled = applyCommand(enabled, c, { type: 'cancelBuff', skillId: skill.id }, 1);

    expect(disabled.buffs[skill.id]).toBeUndefined();
    expect(disabled.sp).toBe(0);
    expect(rng).not.toHaveBeenCalled();
  });

  it('requires a shield to activate Shrink but still permits cancellation without SP', () => {
    const { c, s } = setup(['CR_SHRINK']);
    const skill = sourceSkill(c, 'CR_SHRINK');
    s.status = 'town'; s.battle = null; s.learnedSkills[skill.id] = 1;
    const rng = vi.spyOn(stateTools, 'random').mockReturnValue(0.5);
    expect(() => applyCommand(s, c, { type: 'toggleBuff', skillId: skill.id }, 0)).toThrow();
    expect(s.sp).toBe(1000);
    expect(rng).not.toHaveBeenCalled();
    active(s, c, 'CR_SHRINK', 1, 300000);
    s.sp = 0;
    const off = applyCommand(s, c, { type: 'cancelBuff', skillId: skill.id }, 0);
    expect(off.buffs[skill.id]).toBeUndefined();
    expect(off.sp).toBe(0);
    expect(rng).not.toHaveBeenCalled();
  });

  it('rejects Shrink for an incompatible class without charging SP or drawing RNG', () => {
    const { c, s } = setup(['CR_SHRINK']);
    const skill = sourceSkill(c, 'CR_SHRINK');
    s.status = 'town'; s.battle = null; s.job = 'swordsman'; s.learnedSkills[skill.id] = 1;
    const shield = s.inventory.find(item => item.uid === s.equipment.armor)!;
    c.items[shield.itemId].slot = 'shield'; s.equipment.shield = shield.uid; delete s.equipment.armor;
    const rng = vi.spyOn(stateTools, 'random');

    expect(() => applyCommand(s, c, { type: 'toggleBuff', skillId: skill.id }, 0)).toThrow();

    expect(s.sp).toBe(1000);
    expect(rng).not.toHaveBeenCalled();
  });

  it('does not let AFK rotation activate Shrink without a live or planned Auto Guard', () => {
    const { c, s } = setup(['CR_SHRINK']);
    const skill = sourceSkill(c, 'CR_SHRINK');
    const armor = s.inventory.find(item => item.uid === s.equipment.armor)!;
    c.items[armor.itemId].slot = 'shield'; s.equipment.shield = armor.uid; delete s.equipment.armor;
    s.learnedSkills[skill.id] = 1; s.rotation = [skill.id];
    const rng = vi.spyOn(stateTools, 'random');

    const next = advanceState(s, c, 250);

    expect(next.buffs[skill.id]).toBeUndefined();
    expect(next.sp).toBe(1000);
    expect(rng).not.toHaveBeenCalled();
  });

  it('accepts the manual Shrink toggle in automatic rotation for its source AFK activation path', () => {
    const { c, s } = setup(['CR_AUTOGUARD', 'CR_SHRINK']);
    const shrink = sourceSkill(c, 'CR_SHRINK');
    s.learnedSkills[shrink.id] = 1;

    const next = applyCommand(s, c, { type: 'setRotation', skillIds: [shrink.id] }, 0);

    expect(next.rotation).toEqual([shrink.id]);
  });

  it('uses the activation level of Auto Guard, blocks the incoming weapon hit, and applies Shrink recoil without changing attack timing', () => {
    const { c, s, enemy } = setup(['CR_AUTOGUARD', 'CR_SHRINK']);
    active(s, c, 'CR_AUTOGUARD', 10);
    active(s, c, 'CR_SHRINK', 1, 300000);
    enemy.enemyNextAttackAt = 250;
    const beforeHp = s.hp, beforePlayerAttackAt = s.battle!.playerNextAttackAt, beforeEnemyAttackAt = enemy.enemyNextAttackAt;
    const rng = vi.spyOn(stateTools, 'random').mockReturnValueOnce(0.99).mockReturnValueOnce(0.5).mockReturnValue(0);

    const next = advanceState(s, c, 500);

    expect(next.events.some(event => event.kind === 'block' && event.text.includes('Auto Guard'))).toBe(true);
    expect(next.events.some(event => event.kind === 'knockback' && event.enemyId === enemy.id)).toBe(true);
    expect(next.hp).toBe(beforeHp);
    expect(next.battle!.playerNextAttackAt).toBe(beforePlayerAttackAt);
    expect(next.battle!.enemies![0].enemyNextAttackAt).toBe(beforeEnemyAttackAt + 2000);
    const pushed = next.events.find(event => event.kind === 'knockback' && event.enemyId === enemy.id)?.enemyPosition;
    expect(Math.hypot(next.battle!.enemies![0].position.x - pushed!.x,
      next.battle!.enemies![0].position.y - pushed!.y) * 12).toBeLessThan(1);
    expect(next.battle!.enemies![0].position).not.toEqual({ ...BATTLE_HERO });
    expect(rng.mock.calls.length).toBeGreaterThan(0);
  });

  it('clears shield-dependent statuses on unequip while preserving Shrink expiry without RNG or SP cost', () => {
    const { c, s, enemy } = setup(['CR_AUTOGUARD', 'CR_SHRINK', 'CR_DEFENDER']);
    const armor = s.inventory.find(item => item.uid === s.equipment.armor)!;
    c.items[armor.itemId].slot = 'shield'; s.equipment.shield = armor.uid; delete s.equipment.armor;
    active(s, c, 'CR_AUTOGUARD', 10); active(s, c, 'CR_SHRINK', 1, 300_000); active(s, c, 'CR_DEFENDER', 5);
    const spBefore = s.sp, rng = vi.spyOn(stateTools, 'random').mockReturnValueOnce(0.99).mockReturnValue(0);

    const unequipped = applyCommand(s, c, { type: 'unequip', slot: 'shield' }, 100);

    expect(unequipped.equipment.shield).toBeUndefined();
    expect(unequipped.buffs[sourceSkill(c, 'CR_AUTOGUARD').id]).toBeUndefined();
    expect(unequipped.buffs[sourceSkill(c, 'CR_DEFENDER').id]).toBeUndefined();
    expect(unequipped.buffs[sourceSkill(c, 'CR_SHRINK').id]?.expiresAt).toBe(300_000);
    expect(unequipped.sp).toBe(spBefore);
    expect(rng).not.toHaveBeenCalled();

    unequipped.battle!.enemies![0].enemyNextAttackAt = 250;
    const afterAttack = advanceState(unequipped, c, 500);
    expect(afterAttack.events.some(event => event.kind === 'block' && event.text.includes('Auto Guard'))).toBe(false);
    expect(afterAttack.events.some(event => event.kind === 'knockback' && event.enemyId === enemy.id)).toBe(false);
    expect(afterAttack.hp).toBeLessThan(unequipped.hp);
    expect(afterAttack.buffs[sourceSkill(c, 'CR_SHRINK').id]?.expiresAt).toBe(300_000);
  });

  it('reapproaches the player from the actual recoil position after Auto Guard ends', () => {
    const { c, s, enemy } = setup(['CR_AUTOGUARD', 'CR_SHRINK']);
    const guard = sourceSkill(c, 'CR_AUTOGUARD');
    active(s, c, 'CR_AUTOGUARD', 10); active(s, c, 'CR_SHRINK', 1, 300_000);
    enemy.enemyNextAttackAt = 250;
    vi.spyOn(stateTools, 'random').mockReturnValueOnce(0.99).mockReturnValueOnce(0.5).mockReturnValue(0);

    const recoil = advanceState(s, c, 500);
    const recoilEnemy = recoil.battle!.enemies![0];
    const recoilDistance = Math.hypot(recoilEnemy.position.x - BATTLE_HERO.x, recoilEnemy.position.y - BATTLE_HERO.y);
    delete recoil.buffs[guard.id]; delete recoil.combatEffects!.buffLevels![guard.id];

    const reapproached = advanceState(recoil, c, 5_000).battle!.enemies![0];
    const reapproachDistance = Math.hypot(reapproached.position.x - BATTLE_HERO.x, reapproached.position.y - BATTLE_HERO.y);

    expect(recoilDistance).toBeGreaterThan(0);
    expect(reapproachDistance).toBeLessThan(recoilDistance);
  });

  it('does not run a Shrink roll when Auto Guard fails, and checks Parry as its own later chance', () => {
    const { c, s, enemy } = setup(['CR_AUTOGUARD', 'CR_SHRINK', 'LK_PARRYING']);
    active(s, c, 'CR_AUTOGUARD', 10);
    active(s, c, 'CR_SHRINK', 1, 300000);
    active(s, c, 'LK_PARRYING', 10);
    enemy.enemyNextAttackAt = 250;
    const rng = vi.spyOn(stateTools, 'random').mockReturnValueOnce(0.99).mockReturnValueOnce(0.5).mockReturnValue(0.4);

    const next = advanceState(s, c, 500);

    expect(next.events.some(event => event.kind === 'block' && event.text.includes('Parry'))).toBe(true);
    expect(next.events.some(event => event.kind === 'knockback')).toBe(false);
  });

  it('consumes the conditional Shrink roll for a boss, while knockback flags reject only displacement', () => {
    const { c, s, enemy } = setup(['CR_AUTOGUARD', 'CR_SHRINK']);
    c.monsters[1002].boss = true;
    active(s, c, 'CR_AUTOGUARD', 10); active(s, c, 'CR_SHRINK', 1, 300000);
    enemy.enemyNextAttackAt = 250;
    const rng = vi.spyOn(stateTools, 'random').mockReturnValueOnce(0.99).mockReturnValueOnce(0.5).mockReturnValue(0);

    const next = advanceState(s, c, 250);

    expect(next.events.some(event => event.kind === 'block' && event.text.includes('Auto Guard'))).toBe(true);
    expect(next.events.some(event => event.kind === 'knockback')).toBe(false);
    expect(rng.mock.calls).toHaveLength(6); // Includes Guard and Shrink after the incoming hit checks.
  });

  it('consumes Shrink roll after Guard when a monster has no-knockback, but leaves its position fixed', () => {
    const { c, s, enemy } = setup(['CR_AUTOGUARD', 'CR_SHRINK']);
    c.monsters[1002].noKnockback = true;
    active(s, c, 'CR_AUTOGUARD', 10); active(s, c, 'CR_SHRINK', 1, 300_000);
    enemy.enemyNextAttackAt = 250;
    const withoutShrink = structuredClone(s);
    const shrinkId = sourceSkill(c, 'CR_SHRINK').id;
    delete withoutShrink.buffs[shrinkId];
    delete withoutShrink.combatEffects!.buffLevels![shrinkId];
    const rng = vi.spyOn(stateTools, 'random').mockReturnValueOnce(0.99)
      .mockReturnValueOnce(0.5).mockReturnValueOnce(0).mockReturnValue(0);
    const noShrink = advanceState(withoutShrink, c, 250);
    const noShrinkDraws = rng.mock.calls.length;
    rng.mockClear(); rng.mockReturnValueOnce(0.99).mockReturnValueOnce(0.5)
      .mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValue(0.49);
    const before = enemy.position;

    const next = advanceState(s, c, 250);

    expect(next.events.some(event => event.kind === 'block' && event.text.includes('Auto Guard'))).toBe(true);
    expect(next.events.some(event => event.kind === 'knockback')).toBe(false);
    expect(next.battle!.enemies![0].position).toEqual(noShrink.battle!.enemies![0].position);
    expect(next.battle!.enemies![0].position).not.toEqual(before);
    expect(rng.mock.calls.length - noShrinkDraws).toBe(1);
  });

  it('activates five Sacrifice charges with one status roll and no initial HP cost or fake expiry', () => {
    const { c, s } = setup(['PA_SACRIFICE']);
    const skill = sourceSkill(c, 'PA_SACRIFICE');
    s.learnedSkills[skill.id] = 5; s.rotation = [skill.id];
    const rng = vi.spyOn(stateTools, 'random').mockReturnValue(0.5);

    const next = advanceState(s, c, 250);

    expect(next.sp).toBe(900);
    expect(next.hp).toBe(10000);
    expect(next.combatEffects?.sacrifice).toEqual({ level: 5, charges: 5 });
    expect(next.buffs[skill.id]?.expiresAt).toBe(Number.MAX_SAFE_INTEGER);
    expect(JSON.parse(JSON.stringify(next)).buffs[skill.id].expiresAt).toBe(Number.MAX_SAFE_INTEGER);
    expect(rng).toHaveBeenCalledTimes(1);
  });

  it('does not activate or draw status RNG when Sacrifice SP is insufficient', () => {
    const { c, s } = setup(['PA_SACRIFICE']);
    const skill = sourceSkill(c, 'PA_SACRIFICE');
    s.learnedSkills[skill.id] = 5; s.rotation = [skill.id]; s.sp = 99;
    s.battle!.playerNextAttackAt = Number.MAX_SAFE_INTEGER;
    const rng = vi.spyOn(stateTools, 'random');

    const next = advanceState(s, c, 250);

    expect(next.buffs[skill.id]).toBeUndefined();
    expect(next.combatEffects?.sacrifice).toBeUndefined();
    expect(next.sp).toBe(99);
    expect(rng).not.toHaveBeenCalled();
  });

  it('manually activates and recasts Sacrifice for five charges, modified SP, one RNG roll, and no HP cost', () => {
    const { c, s, skill } = manualSacrificeSetup();
    const armor = s.inventory.find(item => item.uid === s.equipment.armor)!;
    c.items[armor.itemId].effects = { spCostReductionPct: 20 };
    s.status = 'town'; s.battle = null;
    s.sp = 80; s.hp = 1;
    active(s, c, 'PA_SACRIFICE', 1);
    s.combatEffects!.sacrifice = { level: 1, charges: 2 };
    s.combatEffects!.buffLevels![skill.id] = 1;
    const rng = vi.spyOn(stateTools, 'random').mockReturnValue(0.5);

    const recast = applyCommand(s, c, { type: 'useSkill', skillId: skill.id }, 0);

    expect(recast.sp).toBe(0);
    expect(recast.hp).toBe(1);
    expect(recast.combatEffects?.sacrifice).toEqual({ level: 5, charges: 5 });
    expect(recast.buffs[skill.id]?.expiresAt).toBe(Number.MAX_SAFE_INTEGER);
    expect(recast.events.filter(event => event.kind === 'skill' && event.skillId === skill.id)).toHaveLength(1);
    expect(rng).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['incompatible class', (s: ReturnType<typeof setup>['s']) => { s.job = 'swordsman'; }],
    ['missing Devotion level', (s: ReturnType<typeof setup>['s']) => { s.learnedSkills.cr_devotion = 2; }],
    ['insufficient SP', (s: ReturnType<typeof setup>['s']) => { s.sp = 99; }],
    ['active cast', (s: ReturnType<typeof setup>['s']) => { s.battle!.cast = { skillId: 'sm_bash', level: 1,
      targetId: s.battle!.targetId!, startedAt: 0, endsAt: 10_000, actionId: 'cast-test' }; }],
    ['skill-blocking status', (s: ReturnType<typeof setup>['s'], c: Catalog) => active(s, c, 'LK_BERSERK', 1)],
  ])('does not manually activate Sacrifice with %s', (_reason, invalidate) => {
    const { c, s, skill } = manualSacrificeSetup();
    invalidate(s, c);
    const spBefore = s.sp;
    const rng = vi.spyOn(stateTools, 'random');

    expect(() => applyCommand(s, c, { type: 'useSkill', skillId: skill.id }, 0)).toThrow();

    expect(s.sp).toBe(spBefore);
    expect(s.buffs[skill.id]).toBeUndefined();
    expect(s.combatEffects?.sacrifice).toBeUndefined();
    expect(rng).not.toHaveBeenCalled();
  });

  it('learns Devotion prerequisites and Sacrifice through ordinary skill points', () => {
    const { c, s } = setup();
    s.status = 'town'; s.battle = null; s.jobLevel = 50; s.skillPoints = 1000;
    const skill = sourceSkill(c, 'PA_SACRIFICE');
    let learned = s;
    learned = learnByCommand(learned, c, 'SM_ENDURE', 1);
    learned = learnByCommand(learned, c, 'CR_TRUST', 5);
    learned = learnByCommand(learned, c, 'CR_DEVOTION', 3);
    learned = learnByCommand(learned, c, 'PA_SACRIFICE', 5);
    expect(learned.learnedSkills[sourceSkill(c, 'CR_DEVOTION').id]).toBe(3);
    expect(learned.learnedSkills[skill.id]).toBe(5);
    expect(learned.skillPoints).toBeLessThan(1000);
  });

  it('runs a private candidate canary from the exported catalog through paid shield, Guard, recoil, Sacrifice, and lethal self-cost', () => {
    expect(Object.values(rawCatalog.skills).filter(candidate => candidate.implementation === 'supported')).toHaveLength(263);
    expect(rawCatalog.skills.sa_magicrod.implementation).toBe('supported');
    expect(Object.keys(rawCatalog.skills)).toHaveLength(348);
    expect(Object.keys(rawCatalog.classes)).toHaveLength(40);
    for (const source of ['CR_AUTOGUARD', 'CR_SHRINK', 'PA_SACRIFICE'])
      expect(sourceSkill(rawCatalog as unknown as Catalog, source).implementation, source).toBe('supported');

    let proof: ReturnType<typeof advanceState> | undefined;
    let proofState: ReturnType<typeof createInitialState> | undefined;
    let proofCatalog: Catalog | undefined;
    let proofHpCost = 0, proofHpBefore = 0, proofBaseLevel = 0, proofRngStart = 0;
    for (let seed = 1; seed <= 100 && !proof; seed++) {
      const c = structuredClone(rawCatalog) as unknown as Catalog;
      c.classes.paladin.hp[0] = 10_000; c.classes.paladin.sp[0] = 10_000;
      let s = createInitialState(c, 0, 'private guardian canary');
      s.job = 'paladin'; s.baseLevel = 1; s.jobLevel = 50; s.skillPoints = 1000;
      s.stats = { str: 99, agi: 1, vit: 1, int: 1, dex: 99, luk: 1 };
      s.status = 'town'; s.battle = null; s.sp = 1000; s.hp = 10_000; s.zeny = 100_000;
      s.autoPotion = { hpThreshold: 0, spThreshold: 0 };
      s = learnByCommand(s, c, 'CR_AUTOGUARD', 10);
      s = learnByCommand(s, c, 'CR_SHRINK', 1);
      s = learnByCommand(s, c, 'PA_SACRIFICE', 5);
      const shield = c.items[2102];
      const paid = shield.buyPrice;
      s = applyCommand(s, c, { type: 'buy', itemId: shield.id, quantity: 1 }, 0);
      const shieldEntry = s.inventory.find(item => item.itemId === shield.id)!;
      s = applyCommand(s, c, { type: 'equip', uid: shieldEntry.uid }, 0);
      if (s.zeny !== 100_000 - paid || s.equipment.shield !== shieldEntry.uid) continue;

      const shrink = sourceSkill(c, 'CR_SHRINK'), guard = sourceSkill(c, 'CR_AUTOGUARD'), sacrifice = sourceSkill(c, 'PA_SACRIFICE');
      s = applyCommand(s, c, { type: 'toggleBuff', skillId: shrink.id }, 0);
      s = applyCommand(s, c, { type: 'setRotation', skillIds: [guard.id] }, 0);
      s.status = 'challenge';
      beginBattle(s, c, 1002, 0, 'mastering');
      const target = s.battle!.enemies![0];
      Object.assign(target, { hp: 1000, maxHp: 1000, position: { ...BATTLE_HERO }, approachFrom: { ...BATTLE_HERO },
        startedAt: 0, arrivedAt: 0, enemyNextAttackAt: Number.MAX_SAFE_INTEGER });
      c.monsters[target.monsterId].baseExp = c.exp.base[1]; c.monsters[target.monsterId].jobExp = 0;
      s.battle!.targetId = target.id; s.battle!.playerNextSkillAt = 0;
      s.battle!.playerNextAttackAt = Number.MAX_SAFE_INTEGER;
      s = advanceState(s, c, 250);
      if (!s.buffs[guard.id]) continue;

      s = applyCommand(s, c, { type: 'setRotation', skillIds: [sacrifice.id] }, 0);
      s.battle!.playerNextSkillAt = 500; s.battle!.playerActionReadyAt = 250;
      s = advanceState(s, c, 500);
      if (!s.combatEffects?.sacrifice) continue;

      const attacker = structuredClone(s.battle!.enemies![0]);
      attacker.id = `npc-${seed}`; attacker.hp = attacker.maxHp = 100_000;
      attacker.position = { x: BATTLE_HERO.x + 1 / 12, y: BATTLE_HERO.y };
      attacker.approachFrom = { ...attacker.position }; attacker.startedAt = attacker.arrivedAt = 0;
      attacker.enemyNextAttackAt = 750;
      s.battle!.enemies!.push(attacker);
      target.position = { ...BATTLE_HERO }; target.approachFrom = { ...BATTLE_HERO };
      target.hp = target.maxHp = 1000; target.enemyNextAttackAt = Number.MAX_SAFE_INTEGER;
      s.battle!.targetId = target.id;
      s = applyCommand(s, c, { type: 'setRotation', skillIds: [] }, 500);
      s.battle!.playerNextAttackAt = 1000; s.battle!.playerNextSkillAt = Number.MAX_SAFE_INTEGER;
      s.battle!.playerActionReadyAt = 250;
      s.hp = sacrificeHpCost(derivedStats(s, c).maxHp) - 1;
      const lethalCost = sacrificeHpCost(derivedStats(s, c).maxHp), beforeLevel = s.baseLevel;
      s.rngState = seed;
      const next = advanceState(s, c, 1000);
      const recoil = next.events.some(event => event.kind === 'knockback' && event.enemyId === attacker.id);
      const sacrificeHit = next.events.some(event => event.kind === 'damage' && event.target === 'enemy' && event.skillId === sacrifice.id);
      const selfCost = next.events.some(event => event.kind === 'damage' && event.target === 'player' && event.skillId === sacrifice.id);
      if (recoil && sacrificeHit && selfCost && next.totals.deaths === 1) {
        proof = next; proofState = s; proofCatalog = c; proofHpCost = lethalCost; proofHpBefore = s.hp;
        proofBaseLevel = beforeLevel; proofRngStart = seed;
      }
    }

    expect(proof).toBeDefined();
    expect(proofState!.zeny).toBeLessThan(100_000);
    expect(proofState!.learnedSkills[sourceSkill(proofCatalog!, 'CR_DEVOTION').id]).toBe(3);
    expect(proofState!.learnedSkills[sourceSkill(proofCatalog!, 'PA_SACRIFICE').id]).toBe(5);
    expect(proofState!.sp).toBeLessThan(1000);
    expect(proof!.events.some(event => event.kind === 'block' && event.text.includes('Auto Guard'))).toBe(true);
    expect(proof!.events.some(event => event.kind === 'knockback')).toBe(true);
    expect(proof!.events.some(event => event.kind === 'block' && event.enemyId?.startsWith('npc-'))).toBe(true);
    expect(proof!.rngState).not.toBe(proofRngStart);
    expect(proof!.events.find(event => event.kind === 'damage' && event.skillId === sourceSkill(proofCatalog!, 'PA_SACRIFICE').id && event.target === 'player')?.amount)
      .toBe(proofHpBefore);
    expect(proofHpCost).toBe(proofHpBefore + 1);
    expect(proof!.hp).toBe(0);
    expect(proof!.baseLevel).toBeGreaterThan(proofBaseLevel);
  });

  it('replaces each eligible basic attack with one Neutral Sacrifice strike, then charges HP after target damage', () => {
    const { c, s, enemy } = setup(['PA_SACRIFICE']);
    const skill = sourceSkill(c, 'PA_SACRIFICE');
    s.learnedSkills[skill.id] = 5; s.rotation = [skill.id];
    const rng = vi.spyOn(stateTools, 'random').mockReturnValue(0.5);
    const activated = advanceState(s, c, 250);
    activated.rotation = [];
    activated.battle!.playerNextAttackAt = activated.lastSimulatedAt + 250;
    activated.battle!.playerActionReadyAt = activated.lastSimulatedAt;
    activated.battle!.playerNextSkillAt = Number.MAX_SAFE_INTEGER;
    activated.battle!.enemies![0].enemyNextAttackAt = Number.MAX_SAFE_INTEGER;
    activated.battle!.enemies![0].hp = 5000;
    const beforeRolls = rng.mock.calls.length;

    const hit = advanceState(activated, c, activated.lastSimulatedAt + 500);

    const damage = hit.events.find(event => event.kind === 'damage' && event.target === 'enemy' && event.skillId === skill.id)!;
    const selfCost = hit.events.find(event => event.kind === 'damage' && event.target === 'player' && event.skillId === skill.id)!;
    expect(damage.amount).toBe(sacrificeBaseDamage(derivedStats(activated, c).maxHp, 5));
    expect(damage.targetHpBefore).toBe(5000);
    expect(selfCost.amount).toBe(sacrificeHpCost(derivedStats(activated, c).maxHp));
    expect(hit.events.indexOf(damage)).toBeLessThan(hit.events.indexOf(selfCost));
    expect(hit.combatEffects?.sacrifice?.charges).toBe(4);
    expect(rng.mock.calls.length - beforeRolls).toBe(0);
  });

  it('still spends one charge and nine percent of max HP when Neutral deals zero to Ghost3', () => {
    const { c, s } = setup(['PA_SACRIFICE']);
    const skill = sourceSkill(c, 'PA_SACRIFICE');
    s.learnedSkills[skill.id] = 5; s.rotation = [skill.id];
    const activated = advanceState(s, c, 250); activated.rotation = [];
    activated.battle!.playerNextAttackAt = activated.lastSimulatedAt + 250;
    activated.battle!.playerActionReadyAt = activated.lastSimulatedAt;
    activated.battle!.playerNextSkillAt = Number.MAX_SAFE_INTEGER;
    activated.battle!.enemies![0].enemyNextAttackAt = Number.MAX_SAFE_INTEGER;
    activated.battle!.enemies![0].position = { ...BATTLE_HERO };
    const ghost = activated.battle!.enemies![0];
    c.monsters[ghost.monsterId].element = 'Ghost'; c.monsters[ghost.monsterId].elementLevel = 3;

    const hit = advanceState(activated, c, activated.lastSimulatedAt + 500);

    expect(hit.events.find(event => event.kind === 'damage' && event.skillId === skill.id && event.target === 'enemy')?.amount).toBe(0);
    expect(hit.events.find(event => event.kind === 'damage' && event.skillId === skill.id && event.target === 'player')?.amount).toBe(sacrificeHpCost(derivedStats(activated, c).maxHp));
    expect(hit.combatEffects?.sacrifice?.charges).toBe(4);
  });

  it('keeps one last-charge strike before clearing the status', () => {
    const { c, s, enemy } = setup(['PA_SACRIFICE']);
    const skill = sourceSkill(c, 'PA_SACRIFICE'); active(s, c, 'PA_SACRIFICE', 5);
    s.combatEffects!.sacrifice = { level: 5, charges: 1 };
    enemy.hp = 5000; s.rotation = []; s.battle!.playerNextAttackAt = 250;
    s.battle!.playerActionReadyAt = 0; s.battle!.playerNextSkillAt = Number.MAX_SAFE_INTEGER;
    s.battle!.enemies![0].enemyNextAttackAt = Number.MAX_SAFE_INTEGER;

    const hit = advanceState(s, c, 500);

    expect(hit.events.some(event => event.kind === 'damage' && event.skillId === skill.id && event.target === 'enemy' && event.amount !== undefined && event.amount >= 1260)).toBe(true);
    expect(hit.combatEffects?.sacrifice).toBeUndefined();
    expect(hit.buffs[skill.id]).toBeUndefined();
  });

  it('uses the effective body element for Ghost1–4, conversion, Freeze, and petrified Stone', () => {
    const strikeOn = (elementLevel: number, status?: 'converted' | 'freeze' | 'stone') => {
      const { c, s, enemy } = setup(['PA_SACRIFICE']);
      readySacrificeHit(s, c, enemy);
      c.monsters[enemy.monsterId].element = 'Ghost';
      c.monsters[enemy.monsterId].elementLevel = elementLevel;
      if (status === 'converted') enemy.statuses = { SC_ARMOR_PROPERTY: { element: 'Fire', elementLevel: 2,
        expiresAt: 10_000, startsAt: 0, level: 1 } };
      if (status === 'freeze') enemy.statuses = { SC_FREEZE: { expiresAt: 10_000, startsAt: 0, level: 1 } };
      if (status === 'stone') enemy.statuses = { SC_STONE: { expiresAt: 10_000, startsAt: 0, petrifiesAt: 0, level: 1 } };
      const maxHp = derivedStats(s, c).maxHp;
      const base = sacrificeBaseDamage(maxHp, 5);
      const result = advanceState(s, c, 500);
      return { amount: result.events.find(event => event.kind === 'damage' && event.target === 'enemy')?.amount,
        self: result.events.find(event => event.kind === 'damage' && event.target === 'player')?.amount, base,
        hpCost: sacrificeHpCost(maxHp) };
    };
    expect([1, 2, 3, 4].map(level => strikeOn(level).amount)).toEqual([Math.trunc(strikeOn(1).base * .25),
      Math.trunc(strikeOn(2).base * .25), 0, 0]);
    for (const status of ['converted', 'freeze', 'stone'] as const) {
      const result = strikeOn(3, status);
      expect(result.amount).toBeGreaterThan(0);
      expect(result.self).toBe(result.hpCost);
    }
  });

  it('keeps Sacrifice independent of STR, DEX, weapon ATK, size, critical, DEF, and FLEE', () => {
    const damageFor = (changes: { str?: number; dex?: number; def?: number; vit?: number; flee?: number; size?: string }) => {
      const { c, s, enemy } = setup(['PA_SACRIFICE']);
      const skill = readySacrificeHit(s, c, enemy);
      Object.assign(s.stats, { str: changes.str ?? 1, dex: changes.dex ?? 1 });
      const monster = c.monsters[enemy.monsterId];
      monster.def = changes.def ?? 0; monster.stats.vit = changes.vit ?? 1;
      monster.stats.agi = changes.flee ?? 1; monster.size = changes.size ?? 'small';
      const result = advanceState(s, c, 500);
      return result.events.find(event => event.kind === 'damage' && event.target === 'enemy' && event.skillId === skill.id)?.amount;
    };
    expect(damageFor({ str: 1, dex: 1, def: 0, vit: 1, flee: 1, size: 'small' }))
      .toBe(damageFor({ str: 99, dex: 99, def: 100, vit: 100, flee: 99, size: 'large' }));
  });

  it('adds only source refine and compatible mastery, without reusing ordinary weapon ATK', () => {
    const { c, s, enemy } = setup(['PA_SACRIFICE']);
    const skill = readySacrificeHit(s, c, enemy);
    const sword = s.inventory.find(entry => c.items[entry.itemId]?.slot === 'weapon');
    expect(sword).toBeDefined();
    c.items[sword!.itemId].weaponType = 'sword';
    c.items[sword!.itemId].twoHanded = false;
    c.items[sword!.itemId].attack = 9999;
    sword!.refine = 4;
    s.equipment.weapon = sword!.uid;
    const masterySkill = sourceSkill(c, 'SM_SWORD');
    s.learnedSkills[masterySkill.id] = 10;
    const base = sacrificeBaseDamage(derivedStats(s, c).maxHp, 5);

    const hit = advanceState(s, c, 500);

    expect(hit.events.find(event => event.kind === 'damage' && event.target === 'enemy' && event.skillId === skill.id)?.amount)
      .toBe(base + 48);
  });

  it('uses exactly one charge for the basic strike and bypasses Double Attack, Gank, Enchant Poison, and Hindsight procs', () => {
    const { c, s, enemy } = setup(['PA_SACRIFICE']);
    const skill = readySacrificeHit(s, c, enemy);
    s.inventory.find(entry => entry.uid === s.equipment.weapon)!.refine = 0;
    const doubled = Object.values(c.skills).find(candidate => candidate.sourceName === 'TF_DOUBLE')!;
    const gank = Object.values(c.skills).find(candidate => candidate.sourceName === 'RG_SNATCHER')!;
    const poison = Object.values(c.skills).find(candidate => candidate.sourceName === 'AS_ENCHANTPOISON')!;
    const hindsight = Object.values(c.skills).find(candidate => candidate.sourceName === 'SA_AUTOSPELL')!;
    s.learnedSkills[doubled.id] = doubled.maxLevel;
    s.learnedSkills[gank.id] = 10;
    s.learnedSkills[poison.id] = 10;
    s.learnedSkills[hindsight.id] = 10;
    s.buffs[poison.id] = { expiresAt: 10000, effects: {} };
    s.combatEffects!.buffLevels![poison.id] = 10;
    s.buffs[hindsight.id] = { expiresAt: 10000, effects: {} };
    s.combatEffects!.autospell = { skillId: 'sm_bash', level: 1 };
    const rng = vi.spyOn(stateTools, 'random').mockReturnValue(0.5);

    const hit = advanceState(s, c, 500);

    expect(hit.events.filter(event => event.kind === 'damage' && event.target === 'enemy' && event.skillId === skill.id)).toHaveLength(1);
    expect(hit.events.some(event => event.kind === 'steal' || event.kind === 'status-start' && event.statusName === 'SC_POISON')).toBe(false);
    expect(hit.events.some(event => event.kind === 'damage' && event.skillId !== skill.id && event.sourceActorId === s.id)).toBe(false);
    expect(hit.combatEffects?.sacrifice?.charges).toBe(4);
    expect(rng.mock.calls).toHaveLength(0); // fixed damage, IgnoreFlee and proc bypass consume no attack RNG.
  });

  it('does not spend a Sacrifice charge on a chosen skill attack', () => {
    const { c, s, enemy } = setup(['PA_SACRIFICE', 'SM_BASH']);
    readySacrificeHit(s, c, enemy);
    const bash = sourceSkill(c, 'SM_BASH');
    s.learnedSkills[bash.id] = 1;
    s.rotation = [bash.id];
    s.battle!.playerNextSkillAt = 250;
    s.battle!.playerNextAttackAt = 10_000;

    const hit = advanceState(s, c, 500);

    expect(hit.events.some(event => event.kind === 'damage' && event.skillId === bash.id)).toBe(true);
    expect(hit.combatEffects?.sacrifice?.charges).toBe(5);
  });

  it('does not spend a charge when a player poison tick occurs', () => {
    const { c, s, enemy } = setup(['PA_SACRIFICE']);
    readySacrificeHit(s, c, enemy);
    s.playerStatuses = { SC_POISON: { startsAt: 0, expiresAt: 4000, level: 1,
      nextTickAt: 250, remainingTicks: 3, tickDamage: 1 } };
    enemy.enemyNextAttackAt = Number.MAX_SAFE_INTEGER;

    const hit = advanceState(s, c, 1000);

    expect(hit.events.some(event => event.kind === 'damage' && event.statusName === 'SC_POISON')).toBe(true);
    expect(hit.combatEffects?.sacrifice?.charges).toBe(4);
  });

  it('allows the offensive Sacrifice posture to activate after support actions request offense', () => {
    const { c, s } = setup(['PA_SACRIFICE']);
    const skill = sourceSkill(c, 'PA_SACRIFICE');
    s.learnedSkills[skill.id] = 5; s.rotation = [skill.id];
    s.battle!.supportNeedsOffense = true;
    s.battle!.playerNextSkillAt = 0; s.battle!.playerNextAttackAt = Number.MAX_SAFE_INTEGER;

    const next = advanceState(s, c, 250);

    expect(next.combatEffects?.sacrifice).toEqual({ level: 5, charges: 5 });
    expect(next.sp).toBe(900);
  });

  it('settles target damage and the one kill reward before lethal self damage, then clears only Sacrifice', () => {
    const { c, s, enemy } = setup(['PA_SACRIFICE']);
    const skill = readySacrificeHit(s, c, enemy);
    enemy.hp = 1;
    c.monsters[enemy.monsterId].baseExp = c.exp.base[1];
    c.monsters[enemy.monsterId].jobExp = 0;
    s.hp = sacrificeHpCost(derivedStats(s, c).maxHp) - 1;
    active(s, c, 'CR_SHRINK', 1, 300_000);
    const levelBefore = s.baseLevel;
    s.battle!.enemyNextAttackAt = Number.MAX_SAFE_INTEGER;
    for (const entry of s.battle!.enemies ?? []) entry.enemyNextAttackAt = Number.MAX_SAFE_INTEGER;
    const hit = advanceState(s, c, 500);

    expect(hit.events.some(event => event.kind === 'damage' && event.target === 'enemy' && event.skillId === skill.id)).toBe(true);
    expect(hit.events.filter(event => event.kind === 'kill' && event.enemyId === enemy.id)).toHaveLength(1);
    expect(hit.events.some(event => event.kind === 'death')).toBe(true);
    expect(hit.totals.deaths).toBe(1);
    expect(hit.hp).toBe(0);
    expect(hit.baseLevel).toBeGreaterThan(levelBefore);
    expect(hit.combatEffects?.sacrifice).toBeUndefined();
    expect(hit.buffs[skill.id]).toBeUndefined();
    expect(hit.buffs[sourceSkill(c, 'CR_SHRINK').id]).toBeDefined();
  });

  it('preserves charges through JSON saves, segmented advancement, paused resume, and target changes', () => {
    const { c, s, enemy } = setup(['PA_SACRIFICE']);
    readySacrificeHit(s, c, enemy);
    const split = structuredClone(s);
    const single = advanceState(structuredClone(s), c, 500);
    const segmented = advanceState(advanceState(split, c, 250), c, 500);
    expect(single.combatEffects?.sacrifice?.charges).toBe(4);
    expect(segmented.combatEffects?.sacrifice?.charges).toBe(4);

    const saved = JSON.parse(JSON.stringify(single)) as typeof single;
    expect(saved.combatEffects?.sacrifice?.charges).toBe(4);
    expect(saved.buffs[sourceSkill(c, 'PA_SACRIFICE').id]?.expiresAt).toBe(Number.MAX_SAFE_INTEGER);
    const shrink = sourceSkill(c, 'CR_SHRINK');
    saved.buffs[shrink.id] = { expiresAt: 300_000, effects: {} };
    saved.combatEffects!.buffLevels![shrink.id] = 1;
    saved.status = 'paused'; saved.pausedStatus = 'challenge'; saved.pausedAt = saved.lastSimulatedAt;
    const resumed = applyCommand(saved, c, { type: 'setPotions', hpThreshold: 0, spThreshold: 0 }, saved.lastSimulatedAt + 5000);
    expect(resumed.combatEffects?.sacrifice?.charges).toBe(4);
    expect(resumed.buffs[sourceSkill(c, 'PA_SACRIFICE').id]?.expiresAt).toBe(Number.MAX_SAFE_INTEGER);
    expect(resumed.buffs[shrink.id]?.expiresAt).toBe(305_000);

    const nextEnemy = structuredClone(enemy); nextEnemy.id = `${enemy.id}-next`; nextEnemy.hp = 100_000;
    nextEnemy.maxHp = 100_000; nextEnemy.enemyNextAttackAt = Number.MAX_SAFE_INTEGER;
    const wave = setup(['PA_SACRIFICE']);
    readySacrificeHit(wave.s, wave.c, wave.enemy);
    const other = structuredClone(wave.enemy); other.id += '-next'; other.hp = other.maxHp = 100_000;
    wave.s.battle!.enemies!.push(other); wave.enemy.hp = 1;
    const afterKill = advanceState(wave.s, wave.c, 500);
    expect(afterKill.combatEffects?.sacrifice?.charges).toBe(4);
    expect(afterKill.battle?.enemies?.some(entry => entry.id === other.id)).toBe(true);
  });

  it('expires Shrink at its original deadline and keeps it across death while clearing Sacrifice', () => {
    const { c, s, enemy } = setup(['PA_SACRIFICE']);
    const shrink = sourceSkill(c, 'CR_SHRINK'), sacrifice = sourceSkill(c, 'PA_SACRIFICE');
    active(s, c, 'CR_SHRINK', 1, 300_000);
    active(s, c, 'PA_SACRIFICE', 5);
    s.combatEffects!.sacrifice = { level: 5, charges: 3 };
    const townState = structuredClone(s); townState.status = 'town'; townState.battle = null;

    const expired = advanceState(townState, c, 300_000);
    expect(expired.buffs[shrink.id]).toBeUndefined();

    s.hp = 1;
    enemy.enemyNextAttackAt = 250;
    const rng = vi.spyOn(stateTools, 'random').mockReturnValue(0.5);
    const dead = advanceState(s, c, 250);
    // Death settlement clears the finite charge status; a separate Shrink status has NoDeathReset.
    expect(dead.combatEffects?.sacrifice).toBeUndefined();
    expect(dead.buffs[sacrifice.id]).toBeUndefined();
    expect(dead.buffs[shrink.id]).toBeDefined();
  });

  it('clears both statuses and charge state when rebirth creates a new character', () => {
    const { c, s } = setup(['PA_SACRIFICE']);
    const shrink = sourceSkill(c, 'CR_SHRINK'), sacrifice = sourceSkill(c, 'PA_SACRIFICE');
    active(s, c, 'CR_SHRINK', 1, 300_000); active(s, c, 'PA_SACRIFICE', 5);
    s.combatEffects!.sacrifice = { level: 5, charges: 2 };
    s.status = 'town'; s.battle = null; s.baseLevel = 99; s.jobLevel = 50; s.zeny = 50_000;

    const reborn = applyCommand(s, c, { type: 'rebirth' }, 1);

    expect(reborn.job).toBe('high_novice');
    expect(reborn.buffs[shrink.id]).toBeUndefined();
    expect(reborn.buffs[sacrifice.id]).toBeUndefined();
    expect(reborn.combatEffects?.sacrifice).toBeUndefined();
  });

  it('clears Shrink and Sacrifice state when changing from High Swordsman to Paladin', () => {
    const { c, s } = setup(['CR_SHRINK', 'PA_SACRIFICE']);
    const shrink = sourceSkill(c, 'CR_SHRINK'), sacrifice = sourceSkill(c, 'PA_SACRIFICE');
    s.status = 'town'; s.battle = null; s.job = 'high_swordsman'; s.jobLevel = 40;
    s.reborn = true; s.family = 'swordsman'; s.branch = 'crusader';
    active(s, c, 'CR_SHRINK', 1, 300_000); active(s, c, 'PA_SACRIFICE', 5);
    s.combatEffects!.sacrifice = { level: 5, charges: 2 };

    const changed = applyCommand(s, c, { type: 'changeClass', classId: 'paladin' }, 1);

    expect(changed.job).toBe('paladin');
    expect(changed.buffs[shrink.id]).toBeUndefined();
    expect(changed.buffs[sacrifice.id]).toBeUndefined();
    expect(changed.combatEffects?.sacrifice).toBeUndefined();
  });

  it('requires real prerequisites, HP budget, and target reach before AFK activation, and does not refresh active charges', () => {
    const { c, s, enemy } = setup(['PA_SACRIFICE']);
    const skill = sourceSkill(c, 'PA_SACRIFICE');
    s.learnedSkills[skill.id] = 5; s.rotation = [skill.id];
    s.learnedSkills['cr_devotion'] = 2;
    s.battle!.playerNextSkillAt = 0;
    const insufficientPrerequisite = advanceState(s, c, 250);
    expect(insufficientPrerequisite.buffs[skill.id]).toBeUndefined();
    expect(insufficientPrerequisite.sp).toBe(1000);

    s.learnedSkills['cr_devotion'] = 3;
    s.hp = sacrificeHpCost(derivedStats(s, c).maxHp);
    const lethalPreview = advanceState(s, c, 500);
    expect(lethalPreview.buffs[skill.id]).toBeUndefined();
    expect(lethalPreview.sp).toBe(1000);

    s.hp = 10_000; enemy.position = { x: BATTLE_HERO.x + 2, y: BATTLE_HERO.y };
    s.battle!.playerNextSkillAt = 750;
    const outOfReach = advanceState(s, c, 750);
    expect(outOfReach.buffs[skill.id]).toBeUndefined();
    expect(outOfReach.sp).toBe(1000);

    const eligible = setup(['PA_SACRIFICE']);
    eligible.s.learnedSkills[skill.id] = 5; eligible.s.rotation = [skill.id]; eligible.s.battle!.playerNextSkillAt = 0;
    const activated = advanceState(eligible.s, eligible.c, 250);
    activated.rotation = [skill.id]; activated.battle!.playerNextAttackAt = Number.MAX_SAFE_INTEGER;
    const noRefresh = advanceState(activated, eligible.c, 1000);
    expect(noRefresh.combatEffects?.sacrifice?.charges).toBe(5);
    expect(noRefresh.sp).toBe(900);
  });

  it('applies Auto Guard only to weapon NPC status attacks, after Pneuma and Safety Wall', () => {
    const npcHit = (damageType: 'weapon' | 'magic' | 'misc') => {
      const { c, s, enemy } = setup(['CR_AUTOGUARD', 'CR_SHRINK']);
      active(s, c, 'CR_AUTOGUARD', 10); active(s, c, 'CR_SHRINK', 1, 300_000);
      c.monsters[enemy.monsterId].npcStatusSkills = [{ skillId: 176, sourceName: 'NPC_POISON', level: 1,
        rate: 10_000, castTimeMs: 0, delayMs: 2000, range: 1, cancelable: true,
        status: 'SC_POISON', durationMs: 5000, damageType }];
      enemy.npcCombat = { firstAttackDone: true, readyAt: {} };
      enemy.enemyNextAttackAt = 250;
      const rng = vi.spyOn(stateTools, 'random').mockReturnValue(0);
      return { result: advanceState(s, c, 250), rng };
    };
    const weapon = npcHit('weapon');
    expect(weapon.result.events.some(event => event.kind === 'block' && event.text.includes('Auto Guard'))).toBe(true);
    expect(weapon.result.events.some(event => event.kind === 'knockback')).toBe(true);
    expect(weapon.result.playerStatuses?.SC_POISON).toBeUndefined();

    for (const damageType of ['magic', 'misc'] as const) {
      const result = npcHit(damageType);
      expect(result.result.events.some(event => event.kind === 'block' && event.text.includes('Auto Guard'))).toBe(false);
      expect(result.result.events.some(event => event.kind === 'knockback')).toBe(false);
    }

    const wall = setup(['CR_AUTOGUARD', 'CR_SHRINK']);
    active(wall.s, wall.c, 'CR_AUTOGUARD', 10); active(wall.s, wall.c, 'CR_SHRINK', 1, 300_000);
    wall.enemy.enemyNextAttackAt = 250;
    wall.enemy.enemyNextAttackAt = 250;
    wall.s.combatEffects!.safetyWallHits = 1;
    wall.s.combatEffects!.safetyWallGround = { cells: [{ x: 5, y: 7 }], expiresAt: 10000, sceneKey: `challenge:${wall.s.battle!.attemptId}` };
    delete wall.s.combatEffects!.defensiveGrounds;
    vi.spyOn(stateTools, 'random').mockReturnValue(0.5);
    const protectedHit = advanceState(wall.s, wall.c, 250);
    expect(protectedHit.events.some(event => event.kind === 'dodge' && event.text.includes('Escudo Mágico'))).toBe(true);
    expect(protectedHit.events.some(event => event.kind === 'block' && event.text.includes('Auto Guard'))).toBe(false);
    expect(protectedHit.events.some(event => event.kind === 'knockback')).toBe(false);

    const pneuma = setup(['CR_AUTOGUARD', 'CR_SHRINK']);
    active(pneuma.s, pneuma.c, 'CR_AUTOGUARD', 10); active(pneuma.s, pneuma.c, 'CR_SHRINK', 1, 300_000);
    pneuma.c.monsters[pneuma.enemy.monsterId].attackRange = 4;
    pneuma.s.combatEffects!.pneumaGround = { cells: [{ x: Math.floor(BATTLE_HERO.x * 12), y: Math.floor(BATTLE_HERO.y * 12) }],
      expiresAt: 10_000, sceneKey: `challenge:${pneuma.s.battle!.attemptId}` };
    delete pneuma.s.combatEffects!.defensiveGrounds;
    pneuma.enemy.enemyNextAttackAt = 250;
    vi.spyOn(stateTools, 'random').mockReturnValueOnce(0.99).mockReturnValueOnce(0).mockReturnValue(0);
    const pneumaHit = advanceState(pneuma.s, pneuma.c, 250);
    expect(pneumaHit.events.some(event => event.kind === 'dodge' && event.text === 'Pneuma')).toBe(true);
    expect(pneumaHit.events.some(event => event.kind === 'block' && event.text.includes('Auto Guard'))).toBe(false);
    expect(pneumaHit.events.some(event => event.kind === 'knockback')).toBe(false);
  });
});
