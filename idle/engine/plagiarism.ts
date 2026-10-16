import type { BattleEnemy, Catalog, GameState, Skill } from '../shared/types.js';
import { copiedSpell, NPC_COPY_SOURCES, plagiarismLevel } from '../shared/copiedSkills.js';
import { event } from './state.js';

export function clearCopiedSpell(s: GameState, _c: Catalog): void {
  const id = s.copiedSkill?.skillId;
  delete s.copiedSkill;
  if (id && !(s.learnedSkills[id] > 0)) {
    s.rotation = s.rotation.filter(candidate => candidate !== id);
    if (s.rotationByArea) for (const [areaId, ids] of Object.entries(s.rotationByArea))
      s.rotationByArea[areaId] = ids.filter(candidate => candidate !== id);
  }
  // A committed cast owns its ID/level snapshot: clearing the slot does not cancel it.
}
/** skill.c:3670..3737: after defenses, before damage; acquisition makes no RNG draw. */
export function captureNpcSpell(s: GameState, c: Catalog, skill: Skill, incomingLevel: number,
  damage: number, hpBefore: number, at: number, enemy?: BattleEnemy): boolean {
  const cap = plagiarismLevel(s, c);
  if (!cap || !(damage > 0 && damage < hpBefore) || !Number.isSafeInteger(incomingLevel) || incomingLevel <= 0 ||
    !skill.allowPlagiarism || skill.implementation !== 'supported' || !NPC_COPY_SOURCES.has(skill.sourceName ?? '')) return false;
  if (Object.entries(s.buffs).some(([id, buff]) => c.skills[id]?.sourceName === 'ST_PRESERVE' &&
    (buff.startsAt ?? -Infinity) <= at && buff.expiresAt > at)) return false;
  if (copiedSpell(s, c)?.skill.id === skill.id) return false;
  const level = Math.min(incomingLevel, cap, skill.maxLevel);
  clearCopiedSpell(s, c);
  if ((s.learnedSkills[skill.id] ?? 0) > level) return false;
  s.copiedSkill = { skillId: skill.id, level };
  event(s, at, 'skill-copy', `${skill.name} copiada · nível ${level}.`, undefined, 'player', {
    skillId: skill.id, skillLevel: level, sourceActorId: s.id, targetActorId: s.id,
    enemyId: enemy?.id, monsterId: enemy?.monsterId, actorAction: 'none',
  });
  return true;
}
