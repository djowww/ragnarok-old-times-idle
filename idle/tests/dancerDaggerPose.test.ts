import { describe, expect, it } from 'vitest';
import { getActorPose, getAttackAction, type DecodedActor } from '../web/assets/renderer';

// The supplied dancer dagger ACT has hidden -1 layers in group 40 and
// visible dagger frames in group 80. Keep the pinned table as the default.
function actor(job = 'dancer', hidden = true): DecodedActor {
  const image = { width: 1, height: 1, rgba: new Uint8ClampedArray([255,255,255,255]) };
  const frame = (index: number) => ({ layers: [{ index, type: 0, x: 0, y: 0,
    scaleX: 1, scaleY: 1, rotation: 0, mirror: false, color: [255,255,255,255] }], anchors: [], sound: -1 });
  const part = (weapon: boolean) => ({ sprite: { frames: [image], indexedCount: 1 },
    action: { actions: Array.from({ length: 96 }, (_, index) => ({ delayMs: 100,
      frames: [frame(weapon && hidden && index >= 40 && index < 48 ? -1 : 0)] })) } });
  return { kind: 'character', body: part(false), weapon: part(true),
    weaponVisual: { job, gender: 'female', type: 'dagger' } } as unknown as DecodedActor;
}
describe('dancer dagger asset compatibility', () => {
  it.each(['dancer', 'gypsy'])('keeps the %s body and visible dagger on the same attack', job => {
    const value = actor(job);
    expect(getAttackAction(value)).toBe(80);
    for (let direction = 0; direction < 8; direction++) {
      const pose = getActorPose(value, 'attack', 50, direction, 600);
      expect(pose.some(layer => layer.image === value.weapon!.sprite.frames[0])).toBe(true);
    }
  });
  it('preserves the client table when its dagger attack is drawable', () => {
    expect(getAttackAction(actor('dancer', false))).toBe(40);
  });
  it('does not borrow another attack when the replacement body is missing', () => {
    const value = actor(); value.body!.action.actions.splice(80);
    expect(getAttackAction(value)).toBe(40);
  });
  it('requires visible replacement equipment in every direction', () => {
    const value = actor(); value.weapon!.action.actions[83].frames[0].layers[0].index = -1;
    expect(getAttackAction(value)).toBe(40);
  });
  it('does not change other classes or unarmed attacks', () => {
    const value = actor('bard'); expect(getAttackAction(value)).toBe(80);
    value.weaponVisual = undefined; expect(getAttackAction(value)).toBe(40);
  });
});
