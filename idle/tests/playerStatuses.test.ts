import { describe, expect, it, vi, afterEach } from 'vitest';
import { createInitialState } from '../engine';
import { fixture } from './engine-fixture';
import { applyPlayerDisease, tickPlayerStatuses, activePlayerStatus, resolveStatusTreatment, statusTreatmentNeeded, playerRecoveryBlocked } from '../engine/playerStatuses';
import { derivedStats } from '../engine/stats';
import * as state from '../engine/state';
afterEach(() => vi.restoreAllMocks());
describe('persistent PC diseases and self treatments', () => {
  it('captures poison damage and count, ticks without attack and survives source removal', () => {
    const c = fixture(), s = createInitialState(c, 0); s.hp = 1000;
    vi.spyOn(state, 'random').mockReturnValue(0);
    expect(applyPlayerDisease(s,c,'SC_POISON',1,60000,6000,1,0,{sourceActorId:'tarou',sourceMonsterId:1175,sourceSkillId:176})).toBe(true);
    const status = s.playerStatuses!.SC_POISON!, damage = status.tickDamage!;
    tickPlayerStatuses(s,c,1000); expect(s.hp).toBe(1000-damage);
    expect(s.events.at(-1)).toMatchObject({kind:'damage',actorAction:'none',sourceActorId:'tarou',targetActorId:s.id});
    expect(status.remainingTicks).toBe(Math.floor(status.sourceDurationMs!/1000)-1);
    expect(activePlayerStatus(s,'SC_POISON',1000)).toBe(true);
  });
  it('does not give an extra poison tick when duration has a fractional remainder', () => {
    const c=fixture(),s=createInitialState(c,0); s.hp=1000; vi.spyOn(state,'random').mockReturnValue(0);
    applyPlayerDisease(s,c,'SC_POISON',1,2500,10000,1,0,{});
    const damage=s.playerStatuses!.SC_POISON!.tickDamage!;
    tickPlayerStatuses(s,c,1000); tickPlayerStatuses(s,c,2000);
    expect(s.hp).toBe(1000-damage); expect(s.playerStatuses?.SC_POISON).toBeUndefined();
  });
  it('Blind changes HIT/FLEE, poison changes DEF without mutating attributes', () => {
    const c=fixture(),s=createInitialState(c,0),base=derivedStats(s,c); vi.spyOn(state,'random').mockReturnValue(0);
    applyPlayerDisease(s,c,'SC_BLIND',3,30000,8000,1,0,{});
    const blind=derivedStats(s,c); expect(blind.hit).toBe(base.hit-Math.floor(base.hit/4)); expect(blind.flee).toBe(base.flee-Math.floor(base.flee/4)); expect(blind.attributes).toEqual(base.attributes);
  });
  it('Poison PC subtracts25 from the VIT defense category while preserving hard armor DEF and raw stats',()=>{
    const c=fixture(),s=createInitialState(c,0);s.stats.vit=40;c.items[2301].def=100;
    const before=derivedStats(s,c);vi.spyOn(state,'random').mockReturnValue(0);applyPlayerDisease(s,c,'SC_POISON',1,60000,10000,1,0,{});
    const after=derivedStats(s,c);expect(after.def).toBe(before.def);expect(after.sourceDefensePercent).toBe(75);expect(after.softDef).toBe(30);expect(after.attributes).toEqual(before.attributes);
  });
  it('Slow Poison suppresses damage but counts down, releases only disease recovery block', () => {
    const c=fixture(),s=createInitialState(c,0); s.hp=1000; vi.spyOn(state,'random').mockReturnValue(0);
    applyPlayerDisease(s,c,'SC_POISON',1,15000,10000,1,0,{});
    const skill={...c.skills.hp_recovery,id:'pr_slowpoison',sourceName:'PR_SLOWPOISON',implementation:'supported' as const,maxLevel:4}; c.skills[skill.id]=skill;
    expect(playerRecoveryBlocked(s,c,0)).toBe(true);
    expect(resolveStatusTreatment(s,c,skill,1,0)).toBe(true); expect(playerRecoveryBlocked(s,c,1)).toBe(false);
    const ticks=s.playerStatuses!.SC_POISON!.remainingTicks!; tickPlayerStatuses(s,c,1000);
    expect(s.hp).toBe(1000);expect(s.playerStatuses!.SC_POISON!.remainingTicks).toBe(ticks-1);
    expect(statusTreatmentNeeded(s,c,skill,1000)).toBe(false);
  });
});
