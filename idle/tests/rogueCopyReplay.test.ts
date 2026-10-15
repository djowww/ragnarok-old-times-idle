import { describe, expect, it } from 'vitest';
import { advanceState, advanceStateCooperatively } from '../engine';
import { executeCommand } from '../engine/commands';
import { rogueSetup } from './rogue-copy-fixture';

describe('Rogue copy deterministic offline combat', () => {
  it('retains copied levels and exact combat/resource RNG across12h segmented and cooperative replay', async () => {
    const { s, c } = rogueSetup();
    let initial = advanceState(s, c, 250);
    expect(initial.copiedSkill).toEqual({ skillId: 'fire_bolt', level: 3 });
    initial.status = 'town'; initial.battle = null; initial.areaId = null; initial.job = 'stalker';
    initial.learnedSkills.st_preserve = 1;
    c.skills.st_preserve.implementation = 'supported';
    c.classes.stalker.hp = Array(99).fill(100_000); c.classes.stalker.sp = Array(99).fill(100_000);
    c.monsters[1002].drops = []; c.monsters[1002].baseExp = c.monsters[1002].jobExp = 0;
    c.monsters[1002].hp = 800; c.monsters[1002].attack = [0, 0]; c.monsters[1002].stats.int = 5;
    c.monsters[1002].npcStatusSkills = structuredClone(c.monsters[1175].npcStatusSkills);
    initial.stats.int = 60; initial.sp = 100_000; initial.hp = 100_000;
    executeCommand(initial, c, { type: 'setRotation', skillIds: ['st_preserve', 'fire_bolt'] }, 250);
    executeCommand(initial, c, { type: 'startHunt', areaId: c.areas[0].id }, 250);
    initial.lastSeenAt = 250;
    const until = 250 + 12 * 3600000;
    const full = advanceState(initial, c, until);
    let segmented = initial;
    for (let hour = 1; hour <= 12; hour++) segmented = advanceState(segmented, c, 250 + hour * 3600000);
    const cooperative = await advanceStateCooperatively(initial, c, until);
    expect(full.totals.kills).toBeGreaterThan(100);
    expect(full.copiedSkill).toEqual({ skillId: 'fire_bolt', level: 3 });
    expect(segmented).toEqual(full); expect(cooperative).toEqual(full);
    expect(full.learnedSkills.fire_bolt).toBeUndefined(); expect(full.skillPoints).toBe(initial.skillPoints);
  }, 120000); // Three complete12h simulations; this verifies equivalence, not a30s latency claim.
});
