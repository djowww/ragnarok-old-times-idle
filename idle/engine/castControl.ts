import type { BattleEnemy, Catalog, GameState, Skill } from '../shared/types.js';
import { battleHeroAt, enemyPositionAt, playerBattleDistance } from '../shared/battleSpatial.js';
import { classicBuffActive } from './classicBuffs.js';
import { activePlayerStatus } from './playerStatuses.js';
import { classSkills, inventoryLoad, derivedStats } from './stats.js';
import { canPaySkillResources, paySkillResources } from './skillResources.js';
import { castCancelAdditionalSp, spellBreakerEffects } from './castControlRules.js';
import { event, random, requireRule } from './state.js';
import { classicCastTime } from './classic.js';
import { currentPlayerCast } from './playerCast.js';
import { cancelSageEnchantCast } from './sageEnchantments.js';
export type CastSubject = {
    kind: 'player' | 'monster';
    actorId: string;
};
export function castControlEligible(s: GameState, c: Catalog, skill: Skill, level: number, at: number) {
    const load = inventoryLoad(s, c);
    return s.hp > 0 && Number.isSafeInteger(level) && level > 0 && level <= skill.maxLevel && s.learnedSkills[skill.id] === level && skill.implementation === 'supported' && classSkills(c, s.job).includes(skill.id) &&
        ['hunting', 'challenge'].includes(s.status) && load.weight * 10 < load.maxWeight * 9 && !activePlayerStatus(s, 'SC_SILENCE', at) &&
        !['MO_STEELBODY', 'LK_BERSERK', 'TF_HIDING', 'AS_CLOAKING', 'KN_AUTOCOUNTER', 'RG_CHASEWALK', 'ST_INVISIBILITY', 'NV_TRICKDEAD'].some(source => classicBuffActive(s, c, source, at));
}
export function castCancelEligible(s: GameState, c: Catalog, skill: Skill, level: number, at: number) {
    if (castControlEligible(s, c, skill, level, at)) return true;
    const cast = currentPlayerCast(s, at), load = inventoryLoad(s, c);
    return cast?.kind === 'support' && s.status === 'town' && s.hp > 0 &&
        Number.isSafeInteger(level) && level > 0 && level <= skill.maxLevel && s.learnedSkills[skill.id] === level &&
        skill.implementation === 'supported' && classSkills(c, s.job).includes(skill.id) &&
        load.weight * 10 < load.maxWeight * 9 && !activePlayerStatus(s, 'SC_SILENCE', at) &&
        !['MO_STEELBODY', 'LK_BERSERK', 'TF_HIDING', 'AS_CLOAKING', 'KN_AUTOCOUNTER', 'RG_CHASEWALK',
          'ST_INVISIBILITY', 'NV_TRICKDEAD'].some(source => classicBuffActive(s, c, source, at));
}
export function spellBreakerCastMs(s: GameState, c: Catalog, skill: Skill, level: number, at: number) {
    const d = derivedStats(at === s.lastSimulatedAt ? s : { ...s, lastSimulatedAt: at }, c), base = skill.castTimeMs?.[level - 1] ?? 700;
    let ms = Math.floor((skill.ignoresDex ? base : classicCastTime(base, d.attributes?.dex ?? s.stats.dex)) * (1 - Math.min(100, skill.ignoresStatusEffects ? 0 : d.effects.castReductionPct ?? 0) / 100));
    if (!skill.ignoresStatusEffects && classicBuffActive(s, c, 'PF_MEMORIZE', at) && (s.combatEffects?.memorizeCharges ?? 0) > 0)
        ms = Math.floor(ms / 2);
    return ms;
}
export function liveNpcCast(s: GameState, enemy: BattleEnemy, at: number) {
    const cast = enemy.npcCombat?.cast;
    return cast && enemy.hp > 0 && enemy.hostile !== false && (enemy.fieldSlot === undefined || enemy.engaged) && cast.areaId === s.areaId && cast.targetActorId === s.id && cast.startedAt <= at && at < cast.endsAt ? cast : undefined;
}
export function findInterruptibleNpcCast(s: GameState, _c: Catalog, at: number, heroCastMs: number): BattleEnemy | undefined {
    return s.battle?.enemies?.find(enemy => { const cast = liveNpcCast(s, enemy, at); return !!cast && at + heroCastMs < cast.endsAt && playerBattleDistance(battleHeroAt(s, at), enemyPositionAt(enemy, at)) <= 9; });
}
export function cancelActorCast(s: GameState, c: Catalog, subject: CastSubject, at: number, reason: 'manual' | 'spellBreaker') {
    if (subject.kind === 'player') {
        const b = s.battle, cast = b?.cast;
        if (subject.actorId !== s.id || !b || !cast || cast.startedAt > at || cast.endsAt <= at)
            return;
        const ownership = cast.clockOwnership;
        delete b.cast;
        if (ownership) {
            if (b.playerActionReadyAt === ownership.actionReadyAt)
                b.playerActionReadyAt = Math.max(at, ownership.previousActionReadyAt ?? at);
            if (b.playerNextSkillAt === ownership.nextSkillAt)
                b.playerNextSkillAt = Math.max(at, ownership.previousNextSkillAt ?? at);
            if (s.fieldHero && s.fieldHero.moveBlockedUntil === ownership.moveBlockedUntil)
                s.fieldHero.moveBlockedUntil = Math.max(at, ownership.previousMoveBlockedUntil ?? at);
        }
        else {
            // Legacy casts had no ownership record. Only the old pipeline's exact cast
            // deadlines can be released; unrelated deadlines remain authoritative.
            const motion = derivedStats(s, c).attackMotionMs, action = cast.endsAt + Math.max(motion, cast.afterCastDelayMs ?? 0);
            if (b.playerActionReadyAt === action)
                b.playerActionReadyAt = at;
            if (b.playerNextSkillAt === action)
                b.playerNextSkillAt = at;
            if (s.fieldHero?.moveBlockedUntil === cast.endsAt + motion)
                s.fieldHero.moveBlockedUntil = at;
        }
        event(s, at, 'cast-interrupted', 'Conjuração cancelada.', undefined, 'player', { skillId: cast.skillId, skillLevel: cast.level, sourceActorId: s.id, targetActorId: s.id, actionId: cast.actionId, actorAction: 'none' });
        return cast;
    }
    const enemy = s.battle?.enemies?.find(enemy => enemy.id === subject.actorId), cast = enemy && liveNpcCast(s, enemy, at);
    if (!enemy || !cast)
        return;
    for (const copy of new Set([...(s.battle?.enemies ?? []), ...(s.fieldPopulation?.enemies ?? [])]))
        if (copy.id === enemy.id && copy.npcCombat?.cast?.actionId === cast.actionId) {
            const ownership = copy.npcCombat.cast.clockOwnership;
            if (ownership && copy.enemyNextAttackAt === ownership.attackReadyAt)
                copy.enemyNextAttackAt = Math.max(at, ownership.previousAttackReadyAt);
            delete copy.npcCombat.cast;
        }
    event(s, at, 'cast-interrupted', 'Conjuração do monstro interrompida.', undefined, 'enemy', { skillId: c.monsters[enemy.monsterId].npcStatusSkills?.find(skill => skill.skillId === cast.skillId)?.sourceName.toLowerCase(), skillLevel: cast.level, enemyId: enemy.id, monsterId: enemy.monsterId, sourceActorId: enemy.id, targetActorId: s.id, actionId: cast.actionId, actorAction: 'none' });
    return cast;
}
export function useCastCancel(s: GameState, c: Catalog, skill: Skill, level: number, at: number, expectedCastActionId?: string) {
    const cast = currentPlayerCast(s, at);
    requireRule(castCancelEligible(s, c, skill, level, at),
        'SKILL_UNAVAILABLE', 'Esta habilidade manual não está disponível.');
    requireRule(cast && (expectedCastActionId === undefined || cast.actionId === expectedCastActionId),
        'CAST_REQUIRED', 'A conjuração escolhida já terminou ou mudou.');
    requireRule(canPaySkillResources(s, c, skill, level, at), 'SP_REQUIRED', 'Tenha SP suficiente para cancelar a conjuração.');
    const base = c.skills[cast.skillId]?.spCost[cast.level - 1] ?? c.skills[cast.skillId]?.spCost.at(-1) ?? 0;
    paySkillResources(s, c, skill, level, at);
    s.sp = Math.max(0, s.sp - castCancelAdditionalSp(base, level));
    if (cast.kind === 'support') cancelSageEnchantCast(s, c, at, 'Conjuração cancelada por Cast Cancel.');
    else cancelActorCast(s, c, { kind: 'player', actorId: s.id }, at, 'manual');
    event(s, at, 'skill', skill.name, undefined, 'player', { skillId: skill.id, skillLevel: level, sourceActorId: s.id, targetActorId: s.id, actorAction: 'none' });
}
export function resolveSpellBreaker(s: GameState, c: Catalog, skill: Skill, level: number, enemy: BattleEnemy, at: number) {
    const cast = liveNpcCast(s, enemy, at);
    if (!cast)
        return undefined;
    const monster = c.monsters[enemy.monsterId], base = cast.baseSp ?? monster.npcStatusSkills?.find(skill => skill.skillId === cast.skillId)?.baseSp ?? 0;
    const effect = spellBreakerEffects({ boss: !!monster.boss, level, targetMaxHp: enemy.maxHp, canceledSkillBaseSp: base, ...(monster.boss ? { bossRoll: Math.floor(random(s) * 100) } : {}) });
    if (!effect.success)
        return effect;
    cancelActorCast(s, c, { kind: 'monster', actorId: enemy.id }, at, 'spellBreaker');
    return effect;
}
