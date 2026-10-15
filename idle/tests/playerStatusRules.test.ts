import { describe, expect, it } from "vitest";
import {
  deadlyPoisonInitialDamage, playerDiseaseModifiers, playerStatusResistance,
  poisonTickDecision, poisonTickParameters,
} from "../engine/playerStatusRules.js";

const resistance = { vit: 10, int: 0, luk: 5, targetLevel: 50, sourceLevel: 20, chanceBp: 6000, durationMs: 60000 };
const tick = { kind: "SC_POISON" as const, hp: 500, maxHp: 1001, damage: 18, remainingTicks: 5, slowPoison: false };

describe("Hercules pre-renewal PC diseases", () => {
  it("keeps the PC Poison duration instead of halving it like a monster", () => {
    expect(playerStatusResistance({ ...resistance, kind: "SC_POISON" })).toEqual({ chanceBp: 5050, durationMs: 55000 });
    expect(playerStatusResistance({ ...resistance, kind: "SC_DPOISON" })).toEqual({ chanceBp: 5050, durationMs: 55000 });
  });
  it("uses VIT and INT for Blind, with its separate LUK duration reduction", () => {
    expect(playerStatusResistance({ kind: "SC_BLIND", vit: 11, int: 20, luk: 3, targetLevel: 25, sourceLevel: 20, chanceBp: 8000, durationMs: 30001 })).toEqual({ chanceBp: 6680, durationMs: 25321 });
  });
  it("truncates fractional reductions before rounding positive chances up to ten basis points", () => {
    for (const chanceBp of [499, 500, 501]) {
      expect(playerStatusResistance({ ...resistance, kind: "SC_POISON", vit: 1, luk: 0, targetLevel: 20, sourceLevel: 20, chanceBp }).chanceBp).toBe(500);
    }
    expect(playerStatusResistance({ ...resistance, kind: "SC_POISON", vit: 7, luk: 3, targetLevel: 20, sourceLevel: 20, chanceBp: 1, durationMs: 60001 })).toEqual({ chanceBp: 0, durationMs: 56551 });
    expect(playerStatusResistance({ ...resistance, kind: "SC_POISON", vit: 1, luk: 0, targetLevel: 20, sourceLevel: 20, chanceBp: 1 }).chanceBp).toBe(10);
  });
  it("caps both levels at99 and represents chance boundaries without a blanket VIT immunity", () => {
    expect(playerStatusResistance({ ...resistance, kind: "SC_POISON", vit: 0, luk: 0, targetLevel: 150, sourceLevel: 120 }).chanceBp).toBe(6000);
    expect(playerStatusResistance({ ...resistance, kind: "SC_POISON", vit: 0, luk: 0, targetLevel: 150, sourceLevel: 50 }).chanceBp).toBe(5510);
    expect(playerStatusResistance({ ...resistance, kind: "SC_POISON", vit: 200, luk: 0, targetLevel: 20, sourceLevel: 20 })).toEqual({ chanceBp: 0, durationMs: 1 });
    expect(playerStatusResistance({ ...resistance, kind: "SC_POISON", vit: 200, luk: 0, targetLevel: 1, sourceLevel: 99 }).chanceBp).toBe(980);
    expect(playerStatusResistance({ ...resistance, kind: "SC_POISON", vit: 0, luk: 0, targetLevel: 1, sourceLevel: 99, chanceBp: 10000 }).chanceBp).toBe(10000);
    expect(playerStatusResistance({ ...resistance, kind: "SC_BLIND", durationMs: 0 }).durationMs).toBe(1);
  });
  it("captures PC damage, integer counts and the separate source duration at application", () => {
    expect(poisonTickParameters("SC_POISON", 1001, 56551)).toEqual({ damage: 18, remainingTicks: 56, firstTickMs: 1000, sourceDurationMs: 56551 });
    expect(poisonTickParameters("SC_DPOISON", 1001, 2999)).toEqual({ damage: 23, remainingTicks: 2, firstTickMs: 1000, sourceDurationMs: 2999 });
    expect(poisonTickParameters("SC_POISON", 199, 1)).toEqual({ damage: 5, remainingTicks: 1, firstTickMs: 1000, sourceDurationMs: 1 });
  });
  it("decrements before damage, so the last count expires without an extra tick", () => {
    expect(poisonTickDecision(tick)).toEqual({ hp: 482, remainingTicks: 4, end: false, damageApplied: 18 });
    expect(poisonTickDecision({ ...tick, remainingTicks: 1 })).toEqual({ hp: 500, remainingTicks: 0, end: true, damageApplied: 0 });
  });
  it("ends Poison at the HP floor before decrement or Slow Poison suppression", () => {
    expect(poisonTickDecision({ ...tick, hp: 250, slowPoison: true })).toEqual({ hp: 250, remainingTicks: 5, end: true, damageApplied: 0 });
    expect(poisonTickDecision({ ...tick, hp: 3, maxHp: 8, damage: 3 })).toEqual({ hp: 3, remainingTicks: 5, end: true, damageApplied: 0 });
    expect(poisonTickDecision({ ...tick, hp: 251 })).toEqual({ hp: 233, remainingTicks: 4, end: false, damageApplied: 18 });
  });
  it("continues consuming counts during Slow Poison and still expires on the last timer", () => {
    expect(poisonTickDecision({ ...tick, slowPoison: true })).toEqual({ hp: 500, remainingTicks: 4, end: false, damageApplied: 0 });
    expect(poisonTickDecision({ ...tick, slowPoison: true, remainingTicks: 1 })).toEqual({ hp: 500, remainingTicks: 0, end: true, damageApplied: 0 });
    expect(poisonTickDecision({ ...tick, kind: "SC_DPOISON", hp: 10, slowPoison: true })).toEqual({ hp: 10, remainingTicks: 4, end: false, damageApplied: 0 });
  });
  it("uses the captured damage even when maxHP changes, and allows DPoison death", () => {
    expect(poisonTickDecision({ ...tick, maxHp: 1200 })).toEqual({ hp: 482, remainingTicks: 4, end: false, damageApplied: 18 });
    expect(poisonTickDecision({ ...tick, kind: "SC_DPOISON", hp: 10, damage: 23 })).toEqual({ hp: 0, remainingTicks: 4, end: true, damageApplied: 10 });
  });
  it("deals initial DPoison ten percent without crossing the integer quarter-HP floor", () => {
    expect(deadlyPoisonInitialDamage(1001, 1001)).toEqual({ hp: 901, damageApplied: 100 });
    expect(deadlyPoisonInitialDamage(300, 1001)).toEqual({ hp: 250, damageApplied: 50 });
    expect(deadlyPoisonInitialDamage(250, 1001)).toEqual({ hp: 250, damageApplied: 0 });
    expect(deadlyPoisonInitialDamage(249, 1001)).toEqual({ hp: 249, damageApplied: 0 });
  });
  it("returns DEF/HIT/FLEE category reductions while preserving base attributes", () => {
    expect(playerDiseaseModifiers({ poison: true, blind: true })).toEqual({ defReductionPercent: 25, hitReductionPercent: 25, fleeReductionPercent: 25 });
    expect(playerDiseaseModifiers({ poison: false, blind: false })).toEqual({ defReductionPercent: 0, hitReductionPercent: 0, fleeReductionPercent: 0 });
  });
});
