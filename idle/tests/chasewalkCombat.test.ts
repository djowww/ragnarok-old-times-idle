import { describe, expect, it } from 'vitest';
import raw from '../content/catalog.json';
import type { Catalog } from '../shared/types';
import { createInitialState, advanceState } from '../engine';
import { executeCommand } from '../engine/commands';
import { derivedStats } from '../engine/stats';
import { playerHiddenFrom } from '../engine/classicBuffs';
import { playerWalkSpeed } from '../engine/encounters';
import { castSetup } from './cast-control-fixture';

function setup(level = 5) {
  const c = structuredClone(raw) as unknown as Catalog;
  const skill = c.skills.st_chasewalk;
  Object.assign(skill, { implementation: 'supported', manualUse: 'toggle' });
  c.classes.stalker.hp.fill(10000); c.classes.stalker.sp.fill(1000);
  const s = createInitialState(c, 0);
  Object.assign(s, { job: 'stalker', baseLevel: 50, jobLevel: 50, hp: 10000, sp: 1000,
    learnedSkills: { st_chasewalk: level }, rotation: [], equipment: {}, autoPotion: { hpThreshold: 0, spThreshold: 0 } });
  s.stats.dex = 1;
  s.sp = derivedStats(s, c).maxSp;
  return { s, c, skill };
}
function activate(level = 5) {
  const x = setup(level);
  executeCommand(x.s, x.c, { type: 'useSkill', skillId: x.skill.id }, 0);
  const ends = x.s.supportCast!.endsAt;
  return { ...x, s: advanceState(x.s, x.c, Math.ceil(ends / 250) * 250), ends };
}

describe('source Stalker ChaseWalk lifecycle', () => {
  it('starts a real DEX-reduced personal cast, pays 10 SP once at completion and stops freely', () => {
    const { s, c, skill } = setup();
    expect(() => executeCommand(s, c, { type: 'useSkill', skillId: skill.id }, 0)).not.toThrow();
    expect(s.supportCast).toMatchObject({ skillId: skill.id, level: 5, startedAt: 0 });
    const ends = s.supportCast!.endsAt;
    expect(ends).toBeGreaterThan(0); expect(ends).toBeLessThan(1200);
    expect(advanceState(s, c, ends - 1).buffs[skill.id]).toBeUndefined();
    const on = advanceState(s, c, Math.ceil(ends / 250) * 250);
    expect(on.buffs[skill.id]).toBeDefined(); expect(on.sp).toBe(s.sp - 10);
    on.sp = 0;
    executeCommand(on, c, { type: 'useSkill', skillId: skill.id }, on.lastSimulatedAt);
    expect(on.supportCast).toBeUndefined();
    expect(on.buffs[skill.id]).toBeUndefined(); expect(on.sp).toBe(0);
  });
  it.each([1, 2, 3, 4, 5])('charges source upkeep and grants independent STR at level %s', level => {
    const { s, c, ends } = activate(level);
    const pulse = advanceState(s, c, Math.ceil(ends / 250) * 250 + 10000);
    expect(pulse.sp).toBe(s.sp - (10 + 2 * level));
    expect(pulse.buffs.chasewalk_strength).toMatchObject({ startsAt: ends + 10000,
      expiresAt: ends + 40000, effects: { str: 2 ** (level - 1) } });
    expect(derivedStats(pulse, c).attributes!.str).toBeGreaterThan(derivedStats(s, c).attributes!.str);
    const next = advanceState(pulse, c, Math.ceil(ends / 250) * 250 + 20000);
    expect(next.buffs.chasewalk_strength.expiresAt).toBe(ends + 40000);
    expect(next.sp).toBe(s.sp - 2 * (10 + 2 * level));
  });
  it('keeps child STR when SP exhaustion ends concealment, then expires it at its original deadline', () => {
    const { s, c, ends } = activate();
    let next = advanceState(s, c, Math.ceil(ends / 250) * 250 + 10000); next.sp = 0;
    next = advanceState(next, c, Math.ceil(ends / 250) * 250 + 20000);
    expect(next.buffs.st_chasewalk).toBeUndefined();
    expect(next.buffs.chasewalk_strength.effects.str).toBe(16);
    expect(advanceState(next, c, Math.ceil(ends / 250) * 250 + 40000).buffs.chasewalk_strength).toBeUndefined();
  });
  it('hides from ordinary mobs only and applies the source walking delay', () => {
    const { s, c, ends } = activate(1);
    const mob = { ...c.monsters[1002], boss: false, detector: false };
    expect(playerHiddenFrom(s, c, mob, ends)).toBe(true);
    expect(playerHiddenFrom(s, c, { ...mob, boss: true }, ends)).toBe(false);
    expect(playerHiddenFrom(s, c, { ...mob, detector: true }, ends)).toBe(false);
    expect(playerWalkSpeed(s, c, ends)).toBe(195);
  });
  it('rejects another manual skill while concealed and leaves all resources unchanged', () => {
    const { s, c, ends } = activate();
    s.learnedSkills.sa_magicrod = 5; c.classes.stalker.skills.push('sa_magicrod');
    const before = structuredClone(s);
    expect(() => executeCommand(s, c, { type: 'useSkill', skillId: 'sa_magicrod' }, ends)).toThrow();
    expect(s).toEqual(before);
  });
  it('does not swing at its target while concealed, even with an offensive rotation', () => {
    const { s, c, e } = castSetup();
    c.skills.st_chasewalk = { ...structuredClone((raw as unknown as Catalog).skills.st_chasewalk), implementation: 'supported' };
    c.monsters[e.monsterId].boss = false; c.monsters[e.monsterId].detector = false;
    s.buffs.st_chasewalk = { startsAt: 0, expiresAt: Number.MAX_SAFE_INTEGER, effects: {} };
    s.combatEffects = { buffDrainAt: { st_chasewalk: 10000 }, buffLevels: { st_chasewalk: 5 } };
    const end = advanceState(s, c, 2500);
    expect(end.events.filter(event => event.kind === 'damage' && event.sourceActorId === s.id)).toHaveLength(0);
    expect(end.battle!.enemies![0].hp).toBe(e.hp);
  });
  it.each(['challenge', 'hunting'] as const)('lets already-cast NPC magic hit through ChaseWalk in %s and clears only main', mode => {
    const { s, c, e } = castSetup();
    c.skills.st_chasewalk = { ...structuredClone((raw as unknown as Catalog).skills.st_chasewalk), implementation: 'supported' };
    c.monsters[e.monsterId].boss = false; c.monsters[e.monsterId].detector = false;
    c.monsters[e.monsterId].stats.int = 100;
    c.monsters[e.monsterId].npcStatusSkills = [{ skillId: 19, sourceName: 'MG_FIREBOLT', damageType: 'magic', element: 'fire',
      hitCount: 1, baseSp: 17, level: 1, rate: 10000, castTimeMs: 300, delayMs: 3000,
      cancelable: true, range: 9, state: 'MSS_RUSH', condition: 'MSC_ALWAYS', sourceRowIndex: 9 }];
    e.npcCombat = { firstAttackDone: false, readyAt: {}, cast: { skillId: 19, sourceRowIndex: 9, baseSp: 17,
      level: 1, targetActorId: s.id, startedAt: 0, endsAt: 300, areaId: s.areaId, actionId: 'pending-bolt', sourcePosition: { ...e.position } } };
    e.enemyNextAttackAt = 1000; s.rotation = [];
    s.buffs.st_chasewalk = { startsAt: 0, expiresAt: Number.MAX_SAFE_INTEGER, effects: {} };
    s.buffs.chasewalk_strength = { startsAt: 0, expiresAt: 30000, effects: { str: 16 } };
    s.combatEffects = { buffDrainAt: { st_chasewalk: 10000 }, buffLevels: { st_chasewalk: 5 } };
    if (mode === 'hunting') {
      s.status = mode; delete s.battle!.challengeId;
      Object.assign(e,{fieldSlot:0,engaged:true,hostile:true});
      s.fieldPopulation={areaId:s.areaId!,generation:0,enemies:[e],respawns:[]};
      s.fieldHero={areaId:s.areaId!,from:{x:.48,y:.65},position:{x:.48,y:.65},startedAt:0,arrivedAt:0,routeIndex:0};
    }
    const end = advanceState(s, c, 500);
    expect(end.events.find(event => event.kind === 'damage' && event.actionId === 'pending-bolt')?.amount).toBeGreaterThan(0);
    expect(end.buffs.st_chasewalk).toBeUndefined();
    expect(end.buffs.chasewalk_strength).toEqual(s.buffs.chasewalk_strength);
  });
  it('replays main upkeep and independent strength identically across request boundaries', () => {
    const { s, c } = activate();
    const whole = advanceState(s, c, 65000);
    let segments = s;
    for (let at = 2000; at <= 65000; at += 1000) segments = advanceState(segments, c, at);
    expect(segments).toEqual(whole);
    expect(whole.buffs.chasewalk_strength.expiresAt).toBeLessThan(95000);
  });
  it('cancels an unfinished cast when changing activity without charging its SP', () => {
    const { s, c, skill } = setup();
    executeCommand(s,c,{type:'useSkill',skillId:skill.id},0);
    const sp=s.sp;
    executeCommand(s,c,{type:'rest'},250);
    expect(s.supportCast).toBeUndefined();expect(s.sp).toBe(sp);
    expect(advanceState(s,c,2000).buffs.st_chasewalk).toBeUndefined();
  });
});
