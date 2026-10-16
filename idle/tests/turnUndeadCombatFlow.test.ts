import { afterEach, describe, expect, it, vi } from 'vitest';
import rawCatalog from '../content/catalog.json';
import type { Catalog } from '../shared/types.js';
import { BATTLE_CELLS_PER_UNIT, BATTLE_HERO } from '../shared/battleSpatial.js';
import { advanceState, createInitialState } from '../engine/index.js';
import { beginBattle } from '../engine/encounters.js';
import * as stateTools from '../engine/state.js';

const source = rawCatalog as unknown as Catalog;
const skillId = 'pr_turnundead';

function tile(dx: number, dy = 0) {
  const x = Math.floor(BATTLE_HERO.x * BATTLE_CELLS_PER_UNIT) + dx;
  const y = Math.floor(BATTLE_HERO.y * BATTLE_CELLS_PER_UNIT) + dy;
  return { x: (x + .5) / BATTLE_CELLS_PER_UNIT, y: (y + .5) / BATTLE_CELLS_PER_UNIT };
}

function setup(element = 'Water') {
  vi.spyOn(stateTools, 'random').mockReturnValue(0);
  const c = structuredClone(source);
  const s = createInitialState(c, 0, 'turn-undead-flow');
  s.id = 'turn-undead-flow';
  s.job = 'priest'; s.baseLevel = 50; s.jobLevel = 50;
  s.learnedSkills[skillId] = 10;
  s.learnedSkills.all_resurrection = 1; s.learnedSkills.pr_lexdivina = 3;
  s.rotation = [skillId];
  s.status = 'hunting'; s.areaId = c.areas[0].id;
  s.autoPotion = { hpThreshold: 0, spThreshold: 0 }; s.sp = 100;
  beginBattle(s, c, 1002, 0);
  const enemy = s.battle!.enemies!.find(row => row.id === s.battle!.targetId)!;
  Object.assign(c.monsters[enemy.monsterId], { hp: 10000, attack: [1, 1], attackRange: 1,
    attackDelay: 100000, attackMotionMs: 500, baseExp: 0, jobExp: 0, boss: false,
    canMove: true, race: 'Plant', element, mdef: 0,
    stats: { str: 1, agi: 1, vit: 0, int: 0, dex: 1, luk: 1 } });
  Object.assign(enemy, { hp: 10000, maxHp: 10000, engaged: true, hostile: true,
    approachFrom: tile(1), position: tile(1), startedAt: 0, arrivedAt: 0,
    enemyNextAttackAt: Number.MAX_SAFE_INTEGER, statuses: {} });
  s.battle!.enemies = [enemy]; s.battle!.targetId = enemy.id;
  s.battle!.playerNextAttackAt = Number.MAX_SAFE_INTEGER;
  s.battle!.playerNextSkillAt = 0; s.battle!.playerActionReadyAt = 0;
  if (s.fieldPopulation) s.fieldPopulation.enemies = [enemy];
  if (s.fieldPopulation) s.fieldPopulation.respawns = [1, 2, 3].map(slot => ({ slot, at: 1_000_000_000 }));
  if (s.fieldHero) Object.assign(s.fieldHero, { from: { ...BATTLE_HERO }, position: { ...BATTLE_HERO },
    startedAt: 0, arrivedAt: 0, phase: 'fighting', targetId: enemy.id });
  return { c, s, enemy };
}

afterEach(() => vi.restoreAllMocks());

describe('PR_TURNUNDEAD AFK combat flow', () => {
  it('does not cast or spend SP against a non-Undead element', () => {
    const { c, s } = setup();
    const next = advanceState(s, c, 1250);

    expect(next.sp).toBe(100);
    expect(next.events.some(entry => entry.kind === 'skill' && entry.skillId === skillId)).toBe(false);
  });

  it('starts the skill against an Undead element target', () => {
    const { c, s } = setup('Undead');
    const next = advanceState(s, c, 1250);

    expect(next.sp).toBe(80);
    expect(next.events.some(entry => entry.kind === 'skill' && entry.skillId === skillId)).toBe(true);
  });
});
