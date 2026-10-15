import { describe, expect, it } from "vitest";
import { steelBodyRules, berserkRules, activateBerserk, berserkTimerTick, endBerserk, stanceGuards, stanceStatModifiers } from "../engine/soloStances.js";

describe("Hercules pre-renewal solo stances", () => {
  it("uses Steel Body levels 1-5, 200 SP and five spheres", () => {
    expect([1,2,3,4,5].map(l => steelBodyRules(l).durationMs)).toEqual([30000,60000,90000,120000,150000]);
    expect(steelBodyRules(5)).toMatchObject({ spCost:200, sphereCost:5, castTimeMs:5000 });
    expect(() => steelBodyRules(0)).toThrow();
    expect(() => steelBodyRules(6)).toThrow();
  });
  it("applies fixed hard defenses and delay-rate penalties without changing soft defenses", () => {
    expect(stanceStatModifiers("MO_STEELBODY")).toEqual({ hardDef:90, hardMdef:90, aspdRateDelta:250, walkDelayMs:200 });
    expect(stanceStatModifiers("LK_BERSERK")).toEqual({ hardDef:0, softDef:0, hardMdef:0, softMdef:0, maxHpMultiplier:3, weaponDamageRatioBonus:100, fleeReductionPercent:50, aspdRateDelta:-300, walkHastePercent:25 });
  });
  it("fully heals the tripled maximum and removes SP on fresh activation", () => {
    expect(activateBerserk(1001)).toEqual({ maxHp:3003, hp:3003, sp:0, drainHp:150, remainingTicks:20 });
    expect(berserkRules).toMatchObject({ durationMs:300000, intervalMs:15000, spCost:200, postEndRegenBlockMs:300000 });
  });
  it("charges only at timer calls and stops after HP reaches 100", () => {
    expect(berserkTimerTick({hp:250, drainHp:150, remainingTicks:20})).toEqual({hp:100, remainingTicks:19, ended:true});
    expect(berserkTimerTick({hp:251, drainHp:150, remainingTicks:20})).toEqual({hp:101, remainingTicks:19, ended:false});
  });
  it("does not charge the last duration tick or an unaffordable charge", () => {
    expect(berserkTimerTick({hp:3000, drainHp:150, remainingTicks:1})).toEqual({hp:3000, remainingTicks:0, ended:true});
    expect(berserkTimerTick({hp:149, drainHp:150, remainingTicks:3})).toEqual({hp:149, remainingTicks:2, ended:true});
  });
  it("caps normal ending at 100 HP, preserves lower HP and supports dispel with removed penalty", () => {
    expect(endBerserk(400,150)).toEqual({hp:100, regenBlockMs:300000});
    expect(endBerserk(75,150).hp).toBe(75);
    expect(endBerserk(400,0).hp).toBe(400);
  });
  it("blocks skills for both stances and items, equipment and healing only during Berserk", () => {
    expect(stanceGuards(["MO_STEELBODY"])).toEqual({skillsBlocked:true, itemsBlocked:false, equipmentBlocked:false, hpHealingBlocked:false, naturalRegenBlocked:false});
    expect(stanceGuards(["LK_BERSERK"])).toEqual({skillsBlocked:true, itemsBlocked:true, equipmentBlocked:true, hpHealingBlocked:true, naturalRegenBlocked:true});
    expect(stanceGuards([]).skillsBlocked).toBe(false);
  });
});
