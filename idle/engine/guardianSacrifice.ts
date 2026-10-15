import type { Catalog, GameState, Skill } from '../shared/types.js';
import {
  SACRIFICE_AFK_EXPIRES_AT,
  SACRIFICE_CHARGES,
  SHRINK_DURATION_MS,
  sacrificeHpCost,
} from './guardianSacrificeRules.js';
import { cancelClassicBuff } from './classicBuffs.js';
import { classSkills } from './stats.js';

export function guardianShieldEquipped(s: GameState, c: Catalog): boolean {
  const uid = s.equipment.shield;
  const entry = uid && s.inventory.find(item => item.uid === uid);
  return !!entry && c.items[entry.itemId]?.slot === 'shield';
}

/** pc_checkallowskill clears these status groups when equipment leaves the shield slot. */
export function clearShieldDependentStatuses(s: GameState, c: Catalog): void {
  if (guardianShieldEquipped(s, c)) return;
  for (const source of ['CR_AUTOGUARD', 'CR_DEFENDER', 'CR_REFLECTSHIELD', 'LG_REFLECTDAMAGE'])
    cancelClassicBuff(s, c, source);
}

export function guardianSkillEligible(s: GameState, c: Catalog, skill: Skill): boolean {
  const prerequisites = skill.prerequisitesByClass?.[s.job] ?? skill.prerequisites ?? [];
  return classSkills(c, s.job).includes(skill.id) &&
    prerequisites.every(requirement => (s.learnedSkills[requirement.skillId] ?? 0) >= requirement.level);
}

export function guardianStatusActive(s: GameState, c: Catalog, source: 'CR_SHRINK' | 'PA_SACRIFICE', at: number): boolean {
  return Object.entries(s.buffs).some(([id, buff]) =>
    buff.expiresAt > at && c.skills[id]?.sourceName === source);
}

export function activeSacrifice(s: GameState, c: Catalog, at: number): { level: number; charges: number } | undefined {
  if (!guardianStatusActive(s, c, 'PA_SACRIFICE', at)) return undefined;
  const skillId = Object.keys(s.buffs).find(id => c.skills[id]?.sourceName === 'PA_SACRIFICE');
  const state = s.combatEffects?.sacrifice;
  if (!skillId || !state || state.charges <= 0) return undefined;
  return { level: s.combatEffects?.buffLevels?.[skillId] ?? state.level, charges: state.charges };
}

/** Sets only status state; the caller owns payment, source status RNG, and the event. */
export function applyGuardianStatus(s: GameState, skill: Skill, level: number, at: number): void {
  const source = (skill.sourceName ?? skill.id).toUpperCase();
  const expiresAt = source === 'CR_SHRINK' ? at + SHRINK_DURATION_MS : SACRIFICE_AFK_EXPIRES_AT;
  s.buffs[skill.id] = { expiresAt, effects: {} };
  const combat = (s.combatEffects ??= {});
  (combat.buffLevels ??= {})[skill.id] = level;
  if (source === 'PA_SACRIFICE') combat.sacrifice = { level, charges: SACRIFICE_CHARGES };
}

/** Charge is removed before the attack resolves; its captured level survives the last charge. */
export function consumeSacrificeCharge(s: GameState, c: Catalog, at: number, maxHp: number) {
  const state = activeSacrifice(s, c, at);
  if (!state) return undefined;
  const skillId = Object.keys(s.buffs).find(id => c.skills[id]?.sourceName === 'PA_SACRIFICE')!;
  const remaining = state.charges - 1;
  if (remaining <= 0) cancelClassicBuff(s, c, 'PA_SACRIFICE');
  else s.combatEffects!.sacrifice!.charges = remaining;
  return { level: state.level, remainingCharges: Math.max(0, remaining), selfHpCost: sacrificeHpCost(maxHp) };
}
