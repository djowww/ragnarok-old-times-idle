import { describe, expect, it } from 'vitest';
import { SceneClock } from '../web/assets/sceneClock';
const active = (serverTime: number, receivedAt: number, at: number, id = 'hero') => ({ serverTime, receivedAt, at, id });

describe('scene clock for authoritative movement', () => {
  it('starts at the received anchor and follows local elapsed time', () => {
    const clock = new SceneClock();
    expect(clock.at(active(1000, 100, 200))).toBe(1100);
    expect(clock.at(active(1000, 100, 250))).toBe(1150);
  });
  it('never runs backward when a delayed response replaces its anchor', () => {
    const clock = new SceneClock();
    const before = clock.at(active(1000, 100, 200));
    const delayed = clock.at(active(1050, 250, 250));
    expect(delayed).toBeGreaterThan(before);
    expect(delayed).toBe(1145); // 50ms of movement with at most 5ms correction.
    expect(clock.at(active(1050, 250, 300))).toBe(1190);
  });
  it('corrects a forward anchor without teleporting the visual route', () => {
    const clock = new SceneClock(); clock.at(active(1000, 100, 200));
    expect(clock.at(active(5000, 250, 250))).toBe(1155);
  });
  it('clamps a repeated or decreasing animation timestamp', () => {
    const clock = new SceneClock(); clock.at(active(1000, 100, 200));
    expect(clock.at(active(1050, 250, 200))).toBe(1100);
    expect(clock.at(active(1050, 250, 190))).toBe(1100);
  });
  it('freezes at the exact paused deadline and resets on resume', () => {
    const clock = new SceneClock(); clock.at(active(1000, 100, 200));
    expect(clock.at({ ...active(9000, 300, 300), pausedAt: 950 })).toBe(950);
    expect(clock.at({ ...active(9000, 300, 500), pausedAt: 950 })).toBe(950);
    expect(clock.at(active(10000, 600, 600))).toBe(10000);
  });
  it('resets when the selected character changes', () => {
    const clock = new SceneClock(); clock.at(active(1000, 100, 200));
    expect(clock.at(active(400, 250, 250, 'other'))).toBe(400);
  });
  it('accepts an explicit visibility/reconnect reset without changing the snapshot', () => {
    const clock = new SceneClock(), sample = active(1000, 100, 200);
    clock.at(sample); clock.reset();
    expect(clock.at(active(400, 250, 250))).toBe(400);
    expect(sample).toEqual(active(1000, 100, 200));
  });
});
