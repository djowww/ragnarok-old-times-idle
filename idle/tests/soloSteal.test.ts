import { describe, expect, it } from 'vitest';
import { createInitialState } from '../engine/index.js';
import * as stealing from '../engine/steal.js';
import { classicStrippedMonster } from '../engine/classic.js';
import { effectiveMonsterStatus } from '../engine/classicStatuses.js';
import type { BattleEnemy } from '../shared/types.js';
import { fixture } from './engine-fixture.js';

const setup = () => {
  const c = fixture();
  c.skills.steal = { ...c.skills.firstaid, id: 'steal', sourceName: 'TF_STEAL', maxLevel: 10 };
  c.skills.gank = { ...c.skills.steal, id: 'gank', sourceName: 'RG_SNATCHER', kind: 'passive' };
  const s = createInitialState(c, 0); s.learnedSkills = { steal: 10, gank: 10 }; s.stats.dex = 200;
  const target: BattleEnemy = { id: 'a', monsterId: 1002, hp: 50, maxHp: 50, startedAt: 0, arrivedAt: 0, enemyNextAttackAt: 999, spawnDirection: 0, position: { x: 0, y: 0 } };
  s.rngState = 1972;
  return { c, s, target };
};
const gank = (...args: Parameters<typeof stealing.attemptGank>) => stealing.attemptGank?.(...args);
describe('pinned solo Gank and shield strip', () => {
  it('steals before landed basic damage without SP payment', () => {
    const { s, c, target } = setup(); const sp = s.sp;
    s.skillReadyAt.steal = 99999; const cooldowns = { ...s.skillReadyAt };
    gank(s, c, target, 100, { attackLanded: true, weaponType: 'dagger' });
    expect(target.stolenItem).toBe(true); expect(s.sp).toBe(sp);
    expect(s.skillReadyAt).toEqual(cooldowns);
    expect(s.events.find(e => e.skillId === 'steal')?.skillLevel).toBe(10);
  });
  it('consumes the Gank proc roll before discovering an already stolen target', () => {
    const { s, c, target } = setup(); target.stolenItem = true;
    gank(s, c, target, 100, { attackLanded: true, weaponType: 'dagger' });
    expect(s.rngState).toBe(1380227);
  });
  it.each(['bow', 'miss', 'boss', 'stolen', 'freeze'])('rejects %s without loot', kind => {
    const { s, c, target } = setup();
    if (kind === 'boss') c.monsters[1002].boss = true;
    if (kind === 'stolen') target.stolenItem = true;
    if (kind === 'freeze') target.statuses = { SC_FREEZE: { level: 1, expiresAt: 200 } };
    gank(s, c, target, 100, { attackLanded: kind !== 'miss', weaponType: kind === 'bow' ? 'bow' : 'dagger' });
    expect(s.events.filter(e => e.kind === 'loot')).toHaveLength(0);
  });
  it('fails above the pinned 305 per thousand threshold', () => {
    const { s, c, target } = setup(); s.rngState = 187;
    gank(s, c, target, 100, { attackLanded: true, weaponType: 'dagger' });
    expect(target.stolenItem).toBeUndefined();
  });
  it.each([{ seed: 176, stolen: true }, { seed: 179, stolen: false }])('uses strict boundary with seed $seed', ({ seed, stolen }) => {
    // Independent LCG draws are 304 and 305 per thousand respectively.
    const { s, c, target } = setup(); s.rngState = seed;
    gank(s, c, target, 100, { attackLanded: true, weaponType: 'dagger' });
    expect(target.stolenItem === true).toBe(stolen);
  });
  it('allows Steal zero only through passive Gank', () => {
    const { s, c, target } = setup(); delete s.learnedSkills.steal;
    gank(s, c, target, 100, { attackLanded: true, weaponType: 'dagger' });
    expect(target.stolenItem).toBe(true);
    expect(s.events.find(e => e.skillId === 'steal')?.skillLevel).toBe(0);
    const another = { ...target, stolenItem: false };
    stealing.attemptSteal(s, c, c.skills.steal, 0, another, 100);
    expect(another.stolenItem).toBe(false);
  });
  it('adds shield strip, poison and provoke defense reductions', () => {
    const monster = { ...fixture().monsters[1002], def: 80 };
    const stripped = classicStrippedMonster(monster, ['SC_NOEQUIPSHIELD']);
    expect(stripped.def).toBe(80);
    const result = effectiveMonsterStatus(stripped, {
      SC_NOEQUIPSHIELD: { expiresAt: 200 }, SC_POISON: { expiresAt: 200 }, SC_PROVOKE: { level: 5, expiresAt: 200 },
    }, 100);
    expect(result.monster.def).toBe(80); expect(result.defPercent).toBe(30);
  });
});
