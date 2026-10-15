import { describe, expect, it } from 'vitest';
import { hasSceneAction, trapCueAction } from '../web/assets/groundTraps';
import { spiderWebRadius, spiderWebPixels, venomDustPose } from '../web/assets/sceneEffects';

describe('ground skill presentation', () => {
  it('animates placement once and does not animate periodic status effects as attacks', () => {
    expect(hasSceneAction('ground-placed', true)).toBe(true);
    expect(trapCueAction('ground-placed')).toBe('skill');
    expect(hasSceneAction('status', true)).toBe(false);
  });
  it('uses the original three-cell ground footprint and its small breathing cycle', () => {
    expect(spiderWebRadius(0)).toBe(1.5);
    expect(spiderWebRadius(540 * Math.PI * Math.PI / 2)).toBeCloseTo(1.55);
    expect(spiderWebRadius(540 * Math.PI * Math.PI * 1.5)).toBeCloseTo(1.45);
    expect(spiderWebRadius(12345, 3, true)).toBe(1.5);
  });
  it('matches the original web shader threshold and alpha without changing source pixels', () => {
    const original = new Uint8ClampedArray([255,255,255,255, 127,255,255,255, 128,128,128,0]);
    expect([...spiderWebPixels(original)]).toEqual([255,255,255,179, 127,255,255,0, 128,128,128,179]);
    expect(original[11]).toBe(0);
  });
  it('converts the original hundred-millisecond GAT height to world height with a centered shadow-free anchor', () => {
    expect(venomDustPose(50)).toEqual({ scale: .8, height: -.25, bottom: 0, shadow: undefined });
    expect(venomDustPose(100).height).toBe(0);
    expect(venomDustPose(50,true).height).toBe(0);
  });
});
