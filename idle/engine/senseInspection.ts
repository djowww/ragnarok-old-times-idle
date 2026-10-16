import type { BattleEnemy, Catalog, GameState, SenseElementRates, SenseInspectionResult, Skill } from '../shared/types.js';
import { battleHeroAt, enemyPositionAt, playerBattleDistance } from '../shared/battleSpatial.js';
import { classicBuffActive } from './classicBuffs.js';
import { activePlayerStatus } from './playerStatuses.js';
import { effectiveMonsterStatus } from './classicStatuses.js';
import { classicSoftMdef } from './classic.js';
import { derivedStats, classSkills, inventoryLoad } from './stats.js';
import { automaticSkillRotation } from '../shared/skillRotation.js';

const SENSE_ELEMENTS = ['water', 'earth', 'fire', 'wind', 'poison', 'holy', 'dark', 'ghost', 'undead'] as const;

export interface SenseEncounterIdentity {
  areaId: string | null;
  challengeId?: string;
  fieldGeneration?: number;
}

const CONTROL_STATUSES = ['MO_STEELBODY', 'LK_BERSERK', 'TF_HIDING', 'AS_CLOAKING', 'KN_AUTOCOUNTER',
  'ST_CHASEWALK', 'ST_INVISIBILITY', 'NV_TRICKDEAD'] as const;

function senseSkill(catalog: Catalog): Skill | undefined {
  return Object.values(catalog.skills).find(skill => skill.sourceName === 'WZ_ESTIMATION');
}

/** Source-target and manual-action eligibility shared by the command and UI. */
export function senseManualTarget(state: GameState, catalog: Catalog, at: number): BattleEnemy | undefined {
  const skill = senseSkill(catalog);
  const battle = state.battle;
  if (!skill || skill.implementation !== 'supported' || skill.manualUse !== 'inspect' ||
      skill.targetType !== 'enemy' || skill.maxLevel !== 1 || !battle ||
      (state.status !== 'hunting' && state.status !== 'challenge') || state.hp <= 0 ||
      automaticSkillRotation(state).includes(skill.id) || !classSkills(catalog, state.job).includes(skill.id) ||
      state.learnedSkills[skill.id] !== 1 || (battle.cast && battle.cast.endsAt > at) ||
      CONTROL_STATUSES.some(source => classicBuffActive(state, catalog, source, at)) ||
      activePlayerStatus(state, 'SC_SILENCE', at))
    return undefined;
  const load = inventoryLoad(state, catalog);
  if (load.weight * 10 >= load.maxWeight * 9) return undefined;
  if (state.status === 'hunting' && (!state.areaId ||
      (state.fieldPopulation && state.fieldPopulation.areaId !== state.areaId))) return undefined;
  if (state.status === 'challenge' && !battle.challengeId) return undefined;
  const enemyId = battle.targetId;
  const enemy = enemyId && battle.enemies?.find(row => row.id === enemyId && row.hp > 0);
  const monster = enemy && catalog.monsters[enemy.monsterId];
  if (!enemy || !monster || monster.aegisName.toUpperCase() === 'EMPERIUM') return undefined;
  if (state.status === 'hunting' && enemy.fieldSlot !== undefined &&
      !state.fieldPopulation?.enemies.some(row => row.id === enemy.id && row.hp > 0)) return undefined;
  const hero = battleHeroAt(state, at), target = enemyPositionAt(enemy, at);
  const rangeCells = playerBattleDistance(hero, target);
  if (rangeCells > (skill.range?.[0] ?? 0)) return undefined;
  return enemy;
}

/** Read-only modified SP requirement for the one-level Sense action. */
export function senseManualSpCost(state: GameState, catalog: Catalog, at: number): number | undefined {
  const skill = senseSkill(catalog);
  if (!skill || skill.implementation !== 'supported' || skill.manualUse !== 'inspect') return undefined;
  const effects = derivedStats(at === state.lastSimulatedAt ? state : { ...state, lastSimulatedAt: at }, catalog).effects;
  return Math.max(0, Math.floor((skill.spCost[0] ?? 0) * (1 - Math.min(100, effects.spCostReductionPct ?? 0) / 100)));
}

/** Returns the captured actor only while the same live encounter/population remains. */
export function senseInspectionEnemy(state: GameState): BattleEnemy | undefined {
  const result = state.senseInspection;
  const battle = state.battle;
  if (!result || !battle || state.areaId !== result.areaId || battle.challengeId !== result.challengeId) return undefined;
  if (result.fieldGeneration !== undefined && (state.fieldPopulation?.areaId !== result.areaId ||
      state.fieldPopulation.generation !== result.fieldGeneration)) return undefined;
  const live = (enemy: BattleEnemy | undefined) => enemy?.id === result.actorId &&
    enemy.monsterId === result.monsterId && enemy.hp > 0;
  const activeActor = battle.enemies?.find(row => row.id === result.actorId);
  // The active battle record wins over a stale population copy. A dead actor
  // cannot be revived by looking up the same ID in the other persisted view.
  const enemy = activeActor ?? state.fieldPopulation?.enemies.find(row => row.id === result.actorId);
  if (!enemy || !live(enemy)) return undefined;
  if (enemy.fieldSlot !== undefined && !state.fieldPopulation?.enemies.some(row => row.id === enemy.id && row.hp > 0)) return undefined;
  return enemy;
}

export function validSenseInspection(state: GameState): SenseInspectionResult | undefined {
  return senseInspectionEnemy(state) ? state.senseInspection : undefined;
}

/** Called at the end of simulation/commands to discard a dead or replaced actor snapshot. */
export function clearStaleSenseInspection(state: GameState): void {
  if (state.senseInspection && !senseInspectionEnemy(state)) delete state.senseInspection;
}

export function senseEncounterIdentity(state: GameState): SenseEncounterIdentity {
  return {
    areaId: state.areaId,
    ...(state.battle?.challengeId ? { challengeId: state.battle.challengeId } : {}),
    ...(state.fieldPopulation?.areaId === state.areaId ? { fieldGeneration: state.fieldPopulation.generation } : {}),
  };
}

/** clif.c:6194..6229. Captures the packet values for one live monster instance. */
export function makeSenseInspection(
  catalog: Catalog,
  enemy: BattleEnemy,
  at: number,
  identity: SenseEncounterIdentity,
  senseType = 3,
): SenseInspectionResult {
  const source = catalog.monsters[enemy.monsterId];
  if (!source) throw new RangeError(`Unknown Sense monster ${enemy.monsterId}`);
  const { monster } = effectiveMonsterStatus(source, enemy.statuses, at);
  const flags = Number.isSafeInteger(senseType) ? senseType : 3;
  const hardDef = monster.def;
  const softDef = monster.stats.vit;
  const hardMdef = monster.mdef;
  const softMdef = monster.stats.int + (monster.stats.vit >> 1);
  const element = monster.element.toLowerCase();
  const levelIndex = monster.elementLevel - 1;
  const elementRates = SENSE_ELEMENTS.map(attackElement => {
    const value = catalog.elementModifiers?.[attackElement]?.[element]?.[levelIndex] ?? 0;
    return Math.max(0, Math.trunc(value));
  }) as SenseElementRates;

  return {
    sourceSkill: 'WZ_ESTIMATION' as const,
    actorId: enemy.id,
    monsterId: enemy.monsterId,
    ...identity,
    observedAt: at,
    classId: monster.id,
    level: monster.level,
    size: monster.size,
    currentHp: enemy.hp,
    def: ((flags & 1) ? hardDef : 0) + ((flags & 2) ? softDef : 0),
    race: monster.race,
    mdef: ((flags & 1) ? hardMdef : 0) + ((flags & 2) ? classicSoftMdef(monster) : 0),
    element: monster.element,
    elementLevel: monster.elementLevel,
    elementRates,
  };
}
