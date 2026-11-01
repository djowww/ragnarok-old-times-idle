import { describe, expect, it, vi } from 'vitest';
import { groundTrapVisualState, GROUND_TRAP_ASSET, spentGroundTrap, hasSceneAction, trapCueAction, loadGroundTrap } from '../web/assets/groundTraps';
import type { DecodedActor } from '../web/assets/renderer';
import { loadActor } from '../web/assets/renderer';
vi.mock('../web/assets/renderer', () => ({ loadActor: vi.fn() }));

describe('persistent Hunter trap presentation', () => {
  it('retries a missing asset instead of retaining a null cache forever', async () => {
    const loaded = { kind: 'monster', fallback: false } as DecodedActor;
    vi.mocked(loadActor).mockResolvedValueOnce({ kind: 'monster', fallback: true })
      .mockResolvedValueOnce({ kind: 'monster', fallback: true }).mockResolvedValueOnce({ kind: 'monster', fallback: true }).mockResolvedValueOnce(loaded);
    expect(await loadGroundTrap()).toBeNull();
    expect(await loadGroundTrap()).toBe(loaded);
    expect(await loadGroundTrap()).toBe(loaded);
    expect(loadActor).toHaveBeenCalledTimes(4);
  });
  it('presents placement and trigger without turning the hero for trigger effects', () => {
    expect(hasSceneAction('trap-placed', true)).toBe(true);
    expect(hasSceneAction('trap-trigger', true)).toBe(true);
    expect(hasSceneAction('trap-trigger', false)).toBe(false);
    expect(hasSceneAction('loot', true)).toBe(false);
    expect(trapCueAction('trap-placed')).toBe('skill');
    expect(trapCueAction('trap-trigger')).toBe('none');
  });
  const trap = { skillId: 'HT_SKIDTRAP', placedAt: 1000, expiresAt: 5000 };
  it('uses the original placed trap effect rather than an inventory icon', () => {
    expect(GROUND_TRAP_ASSET.spr).toBe('data/sprite/이팩트/기본트랩.spr');
  });
  it('keeps armed traps visible across cue lifetimes and removes at expiry', () => {
    expect(groundTrapVisualState(trap, 999)).toBeNull();
    expect(groundTrapVisualState(trap, 4500)).toBe('armed');
    expect(groundTrapVisualState(trap, 5000)).toBeNull();
  });
  it('retains spent control traps until server expiry and retains an active Ankle Snare capture', () => {
    expect(groundTrapVisualState({ ...trap, triggeredAt: 2000 }, 2100)).toBe('spent');
    expect(groundTrapVisualState({ ...trap, skillId: 'HT_ANKLESNARE', triggeredAt: 2000, capturedEnemyId: 'enemy' }, 4500)).toBe('captured');
    expect(groundTrapVisualState({ ...trap, skillId: 'HT_ANKLESNARE', triggeredAt: 2000 }, 2100)).toBe('spent');
  });
  it('rejects unsupported skills and invalid times', () => {
    expect(groundTrapVisualState({ ...trap, skillId: 'MG_FIREWALL' }, 2000)).toBeNull();
    expect(groundTrapVisualState(trap, Number.NaN)).toBeNull();
  });
  it('dims spent original layers without mutating the armed asset', () => {
    const actor = { kind: 'monster', fallback: false, body: {
      sprite: { frames: [] }, action: { actions: [{ frames: [{ layers: [{ color: [255, 220, 200, 255] }] }] }] },
    } } as unknown as DecodedActor;
    const spent = spentGroundTrap(actor);
    expect(spent.body!.sprite).toBe(actor.body!.sprite);
    expect(spent.body!.action.actions[0].frames[0].layers[0].color).toEqual([255, 220, 200, 115]);
    expect(actor.body!.action.actions[0].frames[0].layers[0].color[3]).toBe(255);
  });
});
