import { afterEach, describe, expect, it, vi } from 'vitest';
import catalogJson from '../content/catalog.json';
import type { Catalog } from '../shared/types.js';
import { advanceState, createInitialState } from '../engine/index.js';
import { beginBattle } from '../engine/encounters.js';
import * as stateTools from '../engine/state.js';
import { clearBladeStop, createBladeStopLink } from '../engine/bladeStop.js';
import { sphereCostForSkill } from '../engine/classicBuffs.js';
import { executeCommand } from '../engine/commands.js';
import { fixture } from './engine-fixture.js';

function setup() {
  vi.spyOn(stateTools, 'random').mockReturnValue(.1);
  const c = fixture(), source = catalogJson as unknown as Catalog;
  const sources = ['MO_BLADESTOP', 'MO_FINGEROFFENSIVE', 'MO_INVESTIGATE', 'MO_CHAINCOMBO',
    'MO_EXTREMITYFIST', 'MO_TRIPLEATTACK', 'MO_CALLSPIRITS', 'MO_EXPLOSIONSPIRITS', 'KN_AUTOCOUNTER'];
  for (const name of sources) {
    const skill = structuredClone(Object.values(source.skills).find(entry => entry.sourceName === name)!);
    skill.implementation = 'supported'; c.skills[skill.id] = skill;
    c.classes.novice.skills.push(skill.id);
  }
  c.monsters[1002] = { ...c.monsters[1002], hp: 100_000, attack: [100, 100], attackRange: 3,
    boss: false, element: 'neutral', def: 90, baseExp: 0, jobExp: 0, attackDelay: 2000,
    stats: { str: 1, agi: 0, vit: 100, int: 1, dex: 1, luk: 0 } };
  c.classes.novice.hp.fill(10_000); c.classes.novice.sp.fill(1_000);
  const s = createInitialState(c, 0); s.status = 'challenge'; s.rotation = []; s.learnedSkills = {};
  s.autoPotion = { hpThreshold: 0, spThreshold: 0 }; s.hp = 10_000; s.sp = 1_000; s.equipment = {};
  beginBattle(s, c, 1002, 0, 'mastering');
  const enemy = s.battle!.enemies![0]; enemy.enemyNextAttackAt = 1100;
  Object.assign(enemy, { fieldSlot: 0, engaged: true, hostile: true });
  enemy.arrivedAt = 0; enemy.position = { x: .48 + 2 / 12, y: .65 }; enemy.approachFrom = { ...enemy.position };
  const skill = (name: string) => Object.values(c.skills).find(entry => entry.sourceName === name)!;
  return { c, s, enemy, skill };
}
afterEach(() => vi.restoreAllMocks());

describe('Blade Stop combat flow', () => {
  it('offers a paid manual wait with the level-specific deadline', () => {
    const { c, s, skill } = setup(), blade = skill('MO_BLADESTOP');
    s.learnedSkills[blade.id] = 3; s.combatEffects = { spiritSpheres: 1 };
    executeCommand(s, c, { type: 'useSkill', skillId: blade.id }, 100);
    expect(s.sp).toBe(990);
    expect(s.combatEffects?.spiritSpheres).toBe(0);
    expect(s.combatEffects?.bladeStopWait).toEqual({ level: 3, startsAt: 100, expiresAt: 1000 });
  });

  it('never applies a wait retroactively and includes a contact exactly at activation', () => {
    for (const [contactAt, shouldCapture] of [[50, false], [100, true], [150, true]] as const) {
      const { c, s, enemy, skill } = setup(), blade = skill('MO_BLADESTOP');
      s.learnedSkills[blade.id] = 1; s.combatEffects = { spiritSpheres: 1 };
      enemy.enemyNextAttackAt = contactAt; s.battle!.playerNextAttackAt = s.battle!.playerNextSkillAt = 999_999;
      executeCommand(s, c, { type: 'useSkill', skillId: blade.id }, 100);
      const next = advanceState(s, c, 250);
      expect(next.combatEffects?.bladeStopLink !== undefined, `contact at ${contactAt}`).toBe(shouldCapture);
      if (shouldCapture) expect(next.combatEffects?.bladeStopLink?.partnerActorId).toBe(enemy.id);
      else expect(next.combatEffects?.bladeStopWait).toMatchObject({ startsAt: 100, expiresAt: 600 });
    }
  });

  it('replays a contact before the end-of-tick expiry of a manually armed wait', () => {
    const { c, s, enemy, skill } = setup(), blade = skill('MO_BLADESTOP');
    s.learnedSkills[blade.id] = 1; s.combatEffects = { spiritSpheres: 1 };
    enemy.enemyNextAttackAt = 550; s.battle!.playerNextAttackAt = s.battle!.playerNextSkillAt = 999_999;
    executeCommand(s, c, { type: 'useSkill', skillId: blade.id }, 100);
    const next = advanceState(s, c, 750);
    expect(next.combatEffects?.bladeStopWait).toBeUndefined();
    expect(next.combatEffects?.bladeStopLink).toMatchObject({ level: 1, partnerActorId: enemy.id, expiresAt: 20_550 });
    expect(next.battle!.enemies![0].statuses?.SC_BLADESTOP?.partnerActorId).toBe(next.id);
  });

  it('replays a linked follow-up at its timestamp before end-of-tick status cleanup', () => {
    const { c, s, enemy, skill } = setup(), chain = skill('MO_CHAINCOMBO');
    s.lastSimulatedAt = 19_850; s.rotation = [chain.id]; s.learnedSkills[chain.id] = 1;
    s.battle!.playerNextAttackAt = 999_999;
    s.battle!.playerNextSkillAt = s.battle!.playerActionReadyAt = 20_000;
    createBladeStopLink(s, enemy, 5, 100);
    const next = advanceState(s, c, 20_100);
    expect(next.events.some(event => event.skillId === chain.id && event.targetActorId === enemy.id)).toBe(true);
    expect(next.combatEffects?.bladeStopLink).toBeUndefined();
  });

  it('does not auto-arm a posture when no follow-up remains usable after its payment', () => {
    const { c, s, skill } = setup(), blade = skill('MO_BLADESTOP'), finger = skill('MO_FINGEROFFENSIVE');
    s.learnedSkills[blade.id] = 5; s.rotation = [blade.id]; s.combatEffects = { spiritSpheres: 1 };
    s.battle!.enemies![0].enemyNextAttackAt = 1100;
    const idle = advanceState(s, c, 1500);
    expect(idle.combatEffects?.bladeStopWait).toBeUndefined();
    expect(idle.combatEffects?.bladeStopLink).toBeUndefined();
    expect(idle.sp).toBe(s.sp);

    const onlySphere = setup(), onlyBlade = onlySphere.skill('MO_BLADESTOP');
    const onlyFinger = onlySphere.skill('MO_FINGEROFFENSIVE');
    onlySphere.s.learnedSkills[onlyBlade.id] = 5; onlySphere.s.learnedSkills[onlyFinger.id] = 1;
    onlySphere.s.rotation = [onlyBlade.id, onlyFinger.id];
    onlySphere.s.combatEffects = { spiritSpheres: 1 };
    onlySphere.s.battle!.enemies![0].enemyNextAttackAt = 1100;
    const emptyAfterPayment = advanceState(onlySphere.s, onlySphere.c, 1500);
    expect(emptyAfterPayment.combatEffects?.bladeStopWait).toBeUndefined();
    expect(emptyAfterPayment.combatEffects?.bladeStopLink).toBeUndefined();
  });

  it('keeps Root plus Asura usable after simulating the reciprocal link and Root sphere payment', () => {
    const { c, s, enemy, skill } = setup(), blade = skill('MO_BLADESTOP'), asura = skill('MO_EXTREMITYFIST');
    const explosion = skill('MO_EXPLOSIONSPIRITS');
    s.learnedSkills[blade.id] = 5; s.learnedSkills[asura.id] = 5;
    s.rotation = [blade.id, asura.id]; s.combatEffects = { spiritSpheres: 5, buffLevels: { [explosion.id]: 5 } };
    s.buffs[explosion.id] = { expiresAt: 50_000, effects: {} };
    enemy.enemyNextAttackAt = 1100;
    const next = advanceState(s, c, 5000);
    expect(next.events.some(event => event.skillId === blade.id && event.statusName === 'SC_BLADESTOP_WAIT')).toBe(true);
    expect(next.events.some(event => event.skillId === asura.id && event.targetActorId === enemy.id)).toBe(true);
    expect(next.combatEffects?.consumedSpheres).toBe(4);
    expect(s.combatEffects?.spiritSpheres).toBe(5);
  });

  it('pays once, links to the actual basic attacker, and leaves unrelated monsters active', () => {
    const { c, s, enemy, skill } = setup(), blade = skill('MO_BLADESTOP');
    const chain = skill('MO_CHAINCOMBO');
    s.learnedSkills[blade.id] = 5; s.learnedSkills[chain.id] = 1;
    s.rotation = [blade.id, chain.id]; s.combatEffects = { spiritSpheres: 1 };
    const other = structuredClone(enemy); other.id = 'other-attacker'; other.enemyNextAttackAt = 1200;
    other.position = { x: .48 + 1 / 12, y: .65 }; other.approachFrom = { ...other.position };
    s.battle!.enemies!.push(other); s.battle!.playerNextAttackAt = 999_999;
    const next = advanceState(s, c, 1500), linked = next.battle!.enemies!.find(entry => entry.id === enemy.id)!;
    expect(next.hp).toBeLessThan(s.hp); // the second monster's ordinary attack still lands
    expect(next.sp).toBe(s.sp - 10); expect(next.combatEffects?.spiritSpheres).toBe(0);
    expect(next.combatEffects?.bladeStopLink).toMatchObject({ level: 5, partnerActorId: enemy.id, expiresAt: 61_100 });
    expect(linked.statuses?.SC_BLADESTOP).toMatchObject({ partnerActorId: s.id, expiresAt: 61_100 });
    expect(next.events.filter(event => event.kind === 'dodge' && event.sourceActorId === enemy.id)).toHaveLength(1);
    expect(linked.hp).toBe(enemy.hp);
  });

  it('binds one actor in a real hunting population after canonical JSON reload while two others keep attacking', () => {
    const { c, s, skill } = setup(), blade = skill('MO_BLADESTOP');
    const chain = skill('MO_CHAINCOMBO');
    s.battle = null; s.status = 'hunting'; s.areaId = 'prontera'; s.learnedSkills[blade.id] = 5;
    s.learnedSkills[chain.id] = 1; s.rotation = [blade.id, chain.id]; s.combatEffects = { spiritSpheres: 1 };
    s.fieldHero = { areaId: 'prontera', from: { x: .48, y: .65 }, position: { x: .8, y: .65 },
      startedAt: 0, arrivedAt: 10_000, routeIndex: 1, phase: 'chasing' };
    beginBattle(s, c, 1002, 0);
    expect(s.fieldPopulation?.enemies.length).toBeGreaterThanOrEqual(3);
    const enemies = s.fieldPopulation!.enemies;
    for (const [index, enemy] of enemies.slice(0, 3).entries()) {
      enemy.engaged = true; enemy.hostile = true;
      enemy.position = { x: .48 + (index + 1) / 12, y: .65 };
      enemy.approachFrom = { ...enemy.position }; enemy.startedAt = enemy.arrivedAt = 0;
      enemy.enemyNextAttackAt = [1400, 1150, 1200][index];
    }
    s.battle!.enemies = enemies.slice();
    s.battle!.targetId = enemies[0].id;
    s.battle!.playerNextAttackAt = 999_999; s.battle!.playerNextSkillAt = 1000;
    s.fieldHero!.position = { x: .48, y: .65 };
    const reloaded = JSON.parse(JSON.stringify(s)) as typeof s;
    const next = advanceState(reloaded, c, 1500);
    const population = next.fieldPopulation!.enemies;
    const linked = population.find(enemy => enemy.statuses?.SC_BLADESTOP)?.id;
    expect(enemies.slice(0, 3).some(enemy => enemy.id === linked)).toBe(true);
    expect(next.combatEffects?.bladeStopLink).toMatchObject({ partnerActorId: linked, level: 5 });
    expect(next.fieldHero?.moveBlockedUntil).toBeGreaterThan(1500);
    expect(next.hp).toBeLessThan(reloaded.hp);
    expect(next.events.filter(event => event.kind === 'damage' && event.sourceActorId !== linked)).toHaveLength(2);
    expect(next.battle!.enemies!.map(enemy => enemy.id)).toEqual(population.map(enemy => enemy.id));
    expect(next.battle!.enemies!.find(enemy => enemy.id === linked)?.statuses?.SC_BLADESTOP?.partnerActorId).toBe(next.id);
  });

  it('does not arm against bosses and never blocks a monster skill cast', () => {
    const boss = setup(), blade = boss.skill('MO_BLADESTOP');
    boss.c.monsters[1002].boss = true; boss.s.learnedSkills[blade.id] = 5;
    boss.s.rotation = [blade.id]; boss.s.combatEffects = { spiritSpheres: 1 };
    const bossNext = advanceState(boss.s, boss.c, 1500);
    expect(bossNext.combatEffects?.bladeStopWait).toBeUndefined();
    expect(bossNext.combatEffects?.bladeStopLink).toBeUndefined(); expect(bossNext.hp).toBeLessThan(boss.s.hp);

    const npc = setup(), npcBlade = npc.skill('MO_BLADESTOP');
    npc.c.monsters[1002].npcStatusSkills = [{ skillId: 176, sourceName: 'NPC_POISON', level: 1,
      range: 3, rate: 10_000, delayMs: 10_000, castTimeMs: 0, durationMs: 10_000, status: 'SC_POISON', cancelable: true }];
    npc.enemy.npcCombat = { firstAttackDone: true, readyAt: {} };
    npc.s.learnedSkills[npcBlade.id] = 5; npc.s.rotation = [npcBlade.id]; npc.s.combatEffects = { spiritSpheres: 1 };
    const npcNext = advanceState(npc.s, npc.c, 1500);
    expect(npcNext.combatEffects?.bladeStopLink).toBeUndefined();
    expect(npcNext.events.some(event => event.sourceActorId === npc.enemy.id && event.kind === 'skill')).toBe(true);
  });

  it('preserves Auto Counter precedence and does not turn its blocked strike into a link', () => {
    const { c, s, enemy, skill } = setup(), blade = skill('MO_BLADESTOP'), counter = skill('KN_AUTOCOUNTER');
    s.learnedSkills[blade.id] = 5; s.learnedSkills[counter.id] = 5;
    s.rotation = [blade.id]; s.combatEffects = { spiritSpheres: 1, buffLevels: { [counter.id]: 5 } };
    s.buffs[counter.id] = { expiresAt: 3000, effects: {} };
    s.playerFacing = { x: 1, y: 0 }; s.battle!.playerNextAttackAt = 999_999;
    enemy.enemyNextAttackAt = 1100;
    const next = advanceState(s, c, 1500);
    expect(next.combatEffects?.bladeStopLink).toBeUndefined();
    expect(next.combatEffects?.bladeStopWait).toBeUndefined();
    expect(next.events.some(event => event.skillId === counter.id && event.kind === 'damage')).toBe(true);
  });

  it('allows cumulative source follow-ups only against the linked actor and releases both sides', () => {
    const { c, s, enemy, skill } = setup(), blade = skill('MO_BLADESTOP');
    // Synthetic Fist cadence releases the cast clock within this follow-up scenario.
    c.classes.novice.weaponAspd = { unarmed: 1000 };
    const chain = skill('MO_CHAINCOMBO');
    s.learnedSkills[blade.id] = 4; s.learnedSkills[chain.id] = 1;
    s.rotation = [blade.id, chain.id]; s.combatEffects = { spiritSpheres: 1 };
    const linkedState = advanceState(s, c, 1500);
    linkedState.rotation = [chain.id];
    linkedState.battle!.playerActionReadyAt = 1500; linkedState.battle!.playerNextSkillAt = 1500; linkedState.battle!.playerNextAttackAt = 999_999;
    const chained = advanceState(linkedState, c, 2500);
    expect(chained.events.some(event => event.skillId === chain.id && event.targetActorId === enemy.id)).toBe(true);
    expect(chained.combatEffects?.bladeStopLink).toBeUndefined();
    expect(chained.battle!.enemies![0].statuses?.SC_BLADESTOP).toBeUndefined();
    expect(chained.combatEffects?.combo).toMatchObject({ sourceName: 'MO_CHAINCOMBO' });
  });

  it('clears the link when the partner dies, and the new encounter actor is never relocked', () => {
    const { c, s, enemy, skill } = setup(), blade = skill('MO_BLADESTOP');
    s.learnedSkills[blade.id] = 5; s.rotation = [blade.id]; s.combatEffects = { spiritSpheres: 1 };
    const linkedState = advanceState(s, c, 1500);
    enemy.hp = 0;
    const linkedEnemy = linkedState.battle!.enemies![0]; linkedEnemy.hp = 0;
    const cleared = advanceState(linkedState, c, 1750);
    expect(cleared.combatEffects?.bladeStopLink).toBeUndefined();
    expect(cleared.battle?.enemies?.every(entry => entry.statuses?.SC_BLADESTOP === undefined)).toBe(true);
  });

  it('reduces Asura from five spheres to four only at Blade Stop level five', () => {
    const { c, s, enemy, skill } = setup(), asura = skill('MO_EXTREMITYFIST');
    s.combatEffects = { spiritSpheres: 5 };
    createBladeStopLink(s, enemy, 4, 0);
    expect(sphereCostForSkill(s, c, asura, 5, 1)).toBe(5);
    createBladeStopLink(s, enemy, 5, 0);
    expect(sphereCostForSkill(s, c, asura, 5, 1)).toBe(4);
  });

  it('resumes a frozen approach timeline when the paired status expires or is cleared', () => {
    const { s, enemy } = setup();
    createBladeStopLink(s, enemy, 5, 1000);
    enemy.startedAt = 0; enemy.arrivedAt = 5000; enemy.approachPausedAt = 1500;
    clearBladeStop(s, 3500);
    expect(enemy.statuses?.SC_BLADESTOP).toBeUndefined();
    expect(enemy).toMatchObject({ startedAt: 2000, arrivedAt: 7000 });
    expect(enemy.approachPausedAt).toBeUndefined();
  });

  it('freezes a moving partner at the exact link time and resumes only its remaining travel time', async () => {
    const { s, enemy } = setup();
    const { enemyPositionAt } = await import('../shared/battleSpatial.js');
    enemy.approachFrom = { x: .4, y: .65 }; enemy.position = { x: .8, y: .65 };
    enemy.startedAt = 0; enemy.arrivedAt = 5000;
    const caughtPosition = enemyPositionAt(enemy, 1500);
    createBladeStopLink(s, enemy, 5, 1500);
    expect(enemy.approachPausedAt).toBe(1500);
    expect(enemyPositionAt(enemy, 4000)).toEqual(caughtPosition);
    clearBladeStop(s, 3500);
    expect(enemy).toMatchObject({ startedAt: 2000, arrivedAt: 7000 });
    expect(enemy.approachPausedAt).toBeUndefined();
  });
});
