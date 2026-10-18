import { describe, expect, it } from 'vitest';
import { applyCommand, createInitialState } from '../engine/index';
import { fixture } from './engine-fixture';
import { beginBattle } from '../engine/combat';
import { awardKill } from '../engine/encounters';
import { BATTLE_HERO } from '../shared/battleSpatial';
import { teleportAvailable } from '../engine/teleport';

function setup() {
  const c = fixture();
  c.classes.blacksmith = { ...c.classes.novice, id: 'blacksmith', family: 'merchant', tier: 2,
    skills: ['bs_greed'], jobCap: 50 };
  c.skills.bs_greed = { id: 'bs_greed', sourceName: 'BS_GREED', name: 'Greed', description: '',
    kind: 'buff', maxLevel: 1, spCost: [10], castTimeMs: [0], afterCastDelayMs: [1000], cooldownMs: 0, power: [0],
    aoeRadius: [2], manualUse: 'greed', implementation: 'supported' };
  const s = createInitialState(c, 0);
  s.job = 'blacksmith'; s.learnedSkills = { bs_greed: 1 }; s.status = 'hunting'; s.areaId = 'prontera';
  s.fieldHero = { areaId: 'prontera', from: { x: 2, y: 2 }, position: { x: 2, y: 2 },
    startedAt: 0, arrivedAt: 0, routeIndex: 0, phase: 'waiting' };
  s.sp = 50;
  const entry = (uid: string, itemId: number) => ({ uid, itemId, quantity: 1, refine: 0,
    cards: [], favorite: false, identified: true });
  s.pendingLoot = [
    { source: 'monster', areaId: 'prontera', fieldPosition: { x: 4, y: 4 }, enemyId: 'near',
      entry: entry('near', 501), acquiredAt: 10 },
    { source: 'monster', areaId: 'prontera', fieldPosition: { x: 5, y: 4 }, enemyId: 'far',
      entry: entry('far', 501), acquiredAt: 11 },
    { source: 'monster', areaId: 'payon', fieldPosition: { x: 3, y: 2 }, enemyId: 'other-area',
      entry: entry('other-area', 501), acquiredAt: 12 },
    { source: 'monster', areaId: 'prontera', enemyId: 'legacy-positionless',
      entry: entry('legacy-positionless', 501), acquiredAt: 13 },
  ] as any;
  return { s, c };
}

describe('Hercules Greed', () => {
  it('picks only pending floor loot within its two-cell area and preserves distant or legacy loot', () => {
    const { s, c } = setup();
    const next = applyCommand(s, c, { type: 'useSkill', skillId: 'bs_greed' }, 100);
    expect(next.sp).toBe(40);
    expect(next.inventory.map(entry => entry.uid)).toContain('near');
    expect(next.pendingLoot?.map(row => row.entry.uid)).toEqual(['far', 'other-area', 'legacy-positionless']);
  });

  it('applies the one-second action clock to Greed and subsequent manual skills', () => {
    const { s, c } = setup();
    const first = applyCommand(s, c, { type: 'useSkill', skillId: 'bs_greed' }, 100);
    expect(first.playerCanActAt).toBe(1100);
    expect(() => applyCommand(first, c, { type: 'useSkill', skillId: 'bs_greed' }, 1099))
      .toThrow(expect.objectContaining({ code: 'ACTION_DELAY' }));

    c.classes.blacksmith.skills.push('al_teleport');
    c.skills.al_teleport = { id: 'al_teleport', sourceName: 'AL_TELEPORT', herculesId: 26,
      manualUse: 'teleport', implementation: 'supported', maxLevel: 2, spCost: [10, 9],
      castTimeMs: [0, 0], power: [0, 0], cooldownMs: 0 } as any;
    c.teleportBlockedMaps = [];
    first.learnedSkills.al_teleport = 1;
    first.learnedSkills.al_ruwach = 1;
    expect(teleportAvailable(first, c, 'random', 1099)).toBe(false);
    expect(teleportAvailable(first, c, 'random', 1100)).toBe(true);

    const atBoundary = applyCommand(first, c, { type: 'useSkill', skillId: 'bs_greed' }, 1100);
    expect(atBoundary.sp).toBe(30);
    expect(atBoundary.playerCanActAt).toBe(2100);
  });

  it('saves the live field actor cell on drops that wait for backpack capacity', () => {
    const c = fixture(); c.classes.novice.baseWeight = 0; c.items[501].weight = 100000;
    c.monsters[1002].hp = 1; c.monsters[1002].drops = [{ itemId: 501, chance: 10000 }];
    const s = createInitialState(c, 0); s.inventory = []; s.equipment = {}; s.baseLevel = 99; s.stats.dex = 99;
    s.status = 'hunting'; s.areaId = 'prontera';
    s.fieldHero = { areaId: 'prontera', from: { x: 2, y: 2 }, position: { x: 2, y: 2 },
      startedAt: 0, arrivedAt: 0, routeIndex: 0, phase: 'fighting' };
    beginBattle(s, c, 1002, 0);
    const enemy = s.battle!.enemies![0];
    Object.assign(enemy, { hp: 1, maxHp: 1, engaged: true, hostile: true,
      position: { x: 2, y: 2 }, approachFrom: { x: 2, y: 2 }, homePosition: { x: 2, y: 2 },
      startedAt: 0, arrivedAt: 0 });
    s.battle!.enemies = [enemy]; s.battle!.targetId = enemy.id;
    s.fieldPopulation!.enemies = [enemy]; s.fieldHero.targetId = enemy.id;
    enemy.hp = 0;
    awardKill(s, c, enemy, 100);
    expect(s.pendingLoot?.[0]).toMatchObject({ source: 'monster', enemyId: enemy.id,
      fieldPosition: { x: 2, y: 2 } });
  });
});
