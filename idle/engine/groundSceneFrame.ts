import type { Catalog, GameState } from '../shared/types.js';
import { BATTLE_CELLS_PER_UNIT, BATTLE_HERO, type BattlePoint } from '../shared/battleSpatial.js';
import { isTownScene } from '../shared/worldScene.js';
import type { FieldNavigationGrid, GridPoint } from '../shared/fieldNavigation.js';
import type { SimulationContext } from './fieldNavigation.js';
export interface GroundSceneFrame { map: string; origin: GridPoint; cellOffset: BattlePoint; grid: FieldNavigationGrid }
/** Same selection/anchor as Scene/MapViewer: area origin or native GAT center. */
export function groundSceneFrame(s: GameState, c: Catalog, context: SimulationContext): GroundSceneFrame {
  if (!context.navigation) throw new Error('Ground scene terrain is unavailable');
  const nav = context.navigation, area = c.areas.find(a => a.id === s.areaId);
  const map = isTownScene(s) ? 'prontera' : area?.map || 'prontera';
  const spec = s.areaId ? nav.publicAreas[s.areaId] : undefined;
  const frame = spec?.map === map ? { grid: nav.area(s.areaId!).grid, origin: spec.origin } : nav.scene(map);
  const cellOffset = { x: frame.origin.x + .5 - BATTLE_HERO.x * BATTLE_CELLS_PER_UNIT,
    y: frame.origin.y + .5 - BATTLE_HERO.y * BATTLE_CELLS_PER_UNIT };
  return { map, ...frame, cellOffset };
}
