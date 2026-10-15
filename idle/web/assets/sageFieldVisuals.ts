import type { ElementalField, GameState, SageFieldSource } from '../../shared/types';
import { classicGroundSceneKey } from '../../engine/classicBuffs';
import { mapGroundHeight, projectMapPoint, type MapProjection } from './mapProjection';
import { BATTLE_CELLS_PER_UNIT, BATTLE_HERO } from '../../shared/battleSpatial';

// roBrowserLegacy d88a3cd4 EffectTable239..241 and PropertyGround.fs.
const textures: Record<SageFieldSource, string> = {
  SA_VOLCANO: 'ring_red', SA_DELUGE: 'ring_blue', SA_VIOLENTGALE: 'ring_yellow',
};
export function sageFieldTexture(source: string): string | undefined {
  return Object.hasOwn(textures, source) ? `data/texture/effect/${textures[source as SageFieldSource]}.tga` : undefined;
}
export function propertyGroundPixels(original: Uint8ClampedArray): Uint8ClampedArray {
  if (original.length % 4) throw new Error('Invalid property ground pixels');
  const pixels = new Uint8ClampedArray(original);
  for (let index = 0; index < pixels.length; index += 4)
    pixels[index + 3] = !pixels[index + 3] || Math.min(pixels[index], pixels[index + 1], pixels[index + 2]) < 128 ? 0 : 107;
  return pixels;
}
/** Cosmetic phase stays independent of the authoritative combat RNG. */
export function propertyGroundScale(tick: number, phase = 0, reducedMotion = false): number {
  return reducedMotion ? 1 : Math.max(.5, Math.sin(tick / (360 * Math.PI) + phase));
}
export function visibleSageField(s: GameState, map: string, at: number): ElementalField | undefined {
  const group = s.elementalField;
  return group && group.map === map && group.ownerActorId === s.id && s.hp > 0 &&
    group.sceneKey === classicGroundSceneKey(s) && group.placedAt <= at && group.expiresAt > at &&
    sageFieldTexture(group.sourceName) && group.cells.length > 0 && group.cells.length <= 49 &&
    Number.isFinite(group.cellOffset.x) && Number.isFinite(group.cellOffset.y) &&
    group.cells.every(cell => Number.isSafeInteger(cell.x) && Number.isSafeInteger(cell.y)) ? group : undefined;
}
/** Fixed GAT planes for native camera and fallback overlay; never caster-relative.
 * The overlay reuses source ring pixels on the ground; native cone choreography
 * is not reproduced by this canvas projection.
 */
export function projectFieldCell(camera: MapProjection, cell: { x: number; y: number }, radius: number,
  width: number, height: number): { x: number; y: number }[] | undefined {
  const ground = camera.ground;
  if (!ground || !Number.isFinite(radius) || radius <= 0) return undefined;
  const points = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([dx, dy]) => ({
    x: cell.x + .5 + dx * radius, y: cell.y + .5 + dy * radius,
  }));
  if (points.some(p => p.x - .5 < ground.x || p.y - .5 < ground.y ||
    p.x - .5 >= ground.x + ground.size - 1 || p.y - .5 >= ground.y + ground.size - 1)) return undefined;
  return points.map(p => projectMapPoint(camera, [p.x, mapGroundHeight(camera, p.x - .5, p.y - .5), p.y], width, height));
}

export function sageFieldQuads(s: GameState, map: string, at: number, camera: MapProjection | null,
  width: number, height: number, reducedMotion = false, arriving = false): { x: number; y: number }[][] {
  const field = visibleSageField(s, map, at);
  if (!field || arriving || camera && camera.map !== map || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return [];
  const quads: { x: number; y: number }[][] = [];
  for (const cell of field.cells) {
    const phase = ((cell.x * 31 + cell.y * 17) % 1000) / 100;
    const radius = propertyGroundScale(at, phase, reducedMotion);
    if (camera) {
      const corners = projectFieldCell(camera, cell, radius, width, height);
      if (corners) quads.push(corners);
    } else {
      const anchor = { x: s.status === 'challenge' ? .38 : .48, y: .76 };
      quads.push([[-1,-1],[1,-1],[1,1],[-1,1]].map(([dx,dy]) => ({
        x: (anchor.x + (cell.x + .5 + dx * radius - field.cellOffset.x - BATTLE_HERO.x * BATTLE_CELLS_PER_UNIT) / 22) * width,
        y: (anchor.y + (cell.y + .5 + dy * radius - field.cellOffset.y - BATTLE_HERO.y * BATTLE_CELLS_PER_UNIT) / 18) * height,
      })));
    }
  }
  return quads;
}
