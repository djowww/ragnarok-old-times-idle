import type { BattleEnemy, Catalog, GameState, Skill } from '../shared/types.js';
import { resolveMeltdownAdditionalEffects } from './meltdownRules.js';
import { random, event } from './state.js';

/** Native pre-re BF_* flag, distinct from the Idle damage-formula category. */
export function meltdownAttackKind(skill?: Skill): 'weapon' | 'magic' | 'misc' {
  if (!skill) return 'weapon';
  if (['MO_EXTREMITYFIST', 'AM_DEMONSTRATION', 'AS_SPLASHER', 'LK_SPIRALPIERCE', 'ASC_BREAKER'].includes(skill.sourceName ?? ''))
    return 'weapon';
  if (skill.sourceName === 'PA_PRESSURE') return 'misc';
  return skill.damageType === 'weapon' ? 'weapon' : skill.damageType === 'magic' ? 'magic' : 'misc';
}
/** Called in the native additional-effect order, once per damage phase and target. */
export function applyMeltdownHit(s: GameState, c: Catalog, enemy: BattleEnemy, at: number,
  damage: number, skill?: Skill): void {
  const active = Object.entries(s.buffs).find(([id,buff]) =>
    c.skills[id]?.sourceName === 'WS_MELTDOWN' && (buff.startsAt ?? 0) <= at && buff.expiresAt > at);
  if (!active) return;
  const id = active[0], capturedBuffLevel = s.combatEffects?.buffLevels?.[id] ?? 0;
  const statuses = enemy.statuses;
  resolveMeltdownAdditionalEffects({ capturedBuffLevel, attackKind: meltdownAttackKind(skill),
    skillSourceName: skill?.sourceName, damage, targetAlive: enemy.hp > 0,
    bossImmune: c.monsters[enemy.monsterId]?.boss === true,
    weaponProtected: (statuses?.SC_PROTECTWEAPON?.expiresAt ?? 0) > at,
    armorProtected: (statuses?.SC_PROTECTARMOR?.expiresAt ?? 0) > at },
    () => Math.floor(random(s) * 10000), slot => {
      // status_change_start rejects the pinned Emperium class before get_sc_def RNG.
      if (enemy.monsterId === 1288) return false;
      random(s); // status_get_sc_def default branch: guaranteed10000 still draws before overlap.
      const name = slot === 'weapon' ? 'SC_NOEQUIPWEAPON' : 'SC_NOEQUIPARMOR';
      const previous = enemy.statuses?.[name];
      if (previous && previous.expiresAt > at && previous.level > 0) return true;
      const stripSource = slot === 'weapon' ? 'RG_STRIPWEAPON' : 'RG_STRIPARMOR';
      const strip = Object.values(c.skills).find(candidate => candidate.sourceName === stripSource);
      // Both pinned source Lv1 durations are75000ms; never apply Rogue's DEX adjustment or success rate.
      const duration = strip?.statusDurationMs?.[0] ?? 75000;
      (enemy.statuses ??= {})[name] = { startsAt: at, expiresAt: at + duration, level: 0, sourceActorId: s.id, skillId: id };
      event(s, at, 'status-start', slot === 'weapon' ? 'Arma do monstro enfraquecida.' : 'Armadura do monstro enfraquecida.',
        undefined, 'enemy', { statusName: name, skillId: id, skillLevel: capturedBuffLevel,
          sourceActorId: s.id, targetActorId: enemy.id, enemyId: enemy.id, monsterId: enemy.monsterId, actorAction: 'none' });
      return true;
    });
}
