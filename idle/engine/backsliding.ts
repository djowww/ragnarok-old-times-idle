import { battleHeroAt, stopHeroMovement } from '../shared/battleSpatial.js';
import { gridHerculesDisplacement } from '../shared/fieldNavigation.js';
import type { Catalog, GameState, Skill } from '../shared/types.js';
import { event, requireRule } from './state.js';
import { classSkills } from './stats.js';
import { inventoryLoad } from './stats.js';
import type { SimulationContext } from './fieldNavigation.js';
import { paySkillResources } from './skillResources.js';
import { cancelClassicBuff, classicBuffActive } from './classicBuffs.js';
import { activePlayerStatus } from './playerStatuses.js';

// map_calc_dir treats positive GAT y as north (pinned Hercules map.c).
const HERCULES_NORTH = { x: 0, y: 1 } as const;
const HERCULES_DIRECTIONS = [
  { x: 0, y: 1 }, { x: -1, y: 1 }, { x: -1, y: 0 }, { x: -1, y: -1 },
  { x: 0, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 0 }, { x: 1, y: 1 },
] as const;

/** Source skill_check_condition gates for statuses represented by RagIDLE. */
export function backslidingStatusBlocked(state: GameState, catalog: Catalog, at: number): boolean {
  return !!state.battle?.cast || !!state.supportCast || activePlayerStatus(state, 'SC_SILENCE', at) ||
    ['MO_STEELBODY', 'LK_BERSERK', 'TF_HIDING', 'ST_CHASEWALK', 'SC_INVISIBILITY']
      .some(source => classicBuffActive(state, catalog, source, at));
}

/** Resolve one manual TF_BACKSLIDING action without changing the encounter. */
export function applyBacksliding(state: GameState, catalog: Catalog, skill: Skill, level: number, at: number,
  context: SimulationContext | undefined): void {
  requireRule(skill.sourceName === 'TF_BACKSLIDING' && skill.implementation === 'supported' &&
    skill.manualUse === 'activate' && skill.maxLevel === 1 && level === 1 &&
    state.learnedSkills[skill.id] === 1 && classSkills(catalog, state.job).includes(skill.id),
  'SKILL_UNAVAILABLE', 'Back Slide não está aprendida ou disponível para esta classe.');
  requireRule(state.hp > 0, 'FIELD_REQUIRED', 'Use Back Slide enquanto estiver vivo durante a caça no campo.');
  requireRule(state.status === 'hunting' && !!state.areaId && state.fieldHero?.areaId === state.areaId,
    'FIELD_REQUIRED', 'Use Back Slide durante uma caça em campo com personagem materializado.');
  requireRule(!backslidingStatusBlocked(state, catalog, at), 'SKILL_STATUS_BLOCKED',
    'Seu estado atual impede usar Back Slide.');
  const load = inventoryLoad(state, catalog);
  requireRule(load.weight * 10 < load.maxWeight * 9, 'SKILL_WEIGHT_BLOCKED',
    'Alivie o peso para ficar abaixo de 90% antes de usar a habilidade.');
  const navigation = context?.navigation;
  requireRule(!!navigation && navigation.areaIds.includes(state.areaId), 'NAVIGATION_UNAVAILABLE',
    'Back Slide exige a navegação GAT carregada para esta área.');

  const start = battleHeroAt(state, at);
  const area = navigation.area(state.areaId);
  const gridStart = navigation.toGridPoint(state.areaId, start);
  requireRule(area.grid && gridStart.x >= 0 && gridStart.y >= 0 &&
    gridStart.x < area.grid.width - 1 && gridStart.y < area.grid.height - 1 &&
    navigation.isWalkableBattlePoint(state.areaId, start), 'NAVIGATION_UNAVAILABLE',
  'A posição atual não está em uma célula passável do mapa.');
  const facing = state.playerFacing ?? HERCULES_NORTH;
  requireRule(HERCULES_DIRECTIONS.some(direction => direction.x === facing.x && direction.y === facing.y),
    'SKILL_UNAVAILABLE', 'A direção atual do personagem é inválida.');
  const endGrid = gridHerculesDisplacement(area.grid, gridStart, -facing.x, -facing.y, 5);
  const destination = navigation.toBattlePoint(state.areaId, endGrid);

  requireRule(paySkillResources(state, catalog, skill, 1, at), 'SP_REQUIRED',
    'Tenha SP suficiente para usar Back Slide.');
  // Pinned unit_skilluse_id2 ends PC Cloaking on any skill with default
  // player_cloak_check_type=1; this runtime has no val4 keep-on-skill override.
  cancelClassicBuff(state, catalog, 'AS_CLOAKING');
  const hero = state.fieldHero!;
  stopHeroMovement(hero, destination, at);
  event(state, at, 'skill', skill.name, undefined, 'player', {
    skillId: skill.id, skillLevel: 1, areaId: state.areaId,
    sourceActorId: state.id, targetActorId: state.id, actorAction: 'skill', actionStartedAt: at,
    actionSourcePosition: { ...start }, movementDestination: { ...destination },
    actionFacing: { ...(state.playerFacing ?? HERCULES_NORTH) },
  });
}
