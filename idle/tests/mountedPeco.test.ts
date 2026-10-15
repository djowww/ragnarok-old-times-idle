import { describe, expect, it } from 'vitest';
import type { Pool } from 'mysql2/promise';
import type { Catalog, GameCommand, GameState } from '../shared/types';
import { applyCommand, createInitialState, GameError } from '../engine/index';
import { canPecoMount, isPecoMounted, mountedCavalierPenalty } from '../engine/mountedPeco';
import { derivedStats, inventoryLoad } from '../engine/stats';
import { parseCommandRequest } from '../server/validation';
import { GameRepository } from '../server/repository';
import { fixture } from './engine-fixture';

function setup(job = 'knight') {
  const c = fixture();
  c.skills.riding = { ...c.skills.firstaid, id: 'riding', sourceName: 'KN_RIDING', kind: 'passive', implementation: 'unsupported' };
  c.skills.cavalier = { ...c.skills.riding, id: 'cavalier', sourceName: 'KN_CAVALIERMASTERY', maxLevel: 5 };
  c.classes.crusader = { ...c.classes.knight, id: 'crusader' };
  c.classes.paladin = { ...c.classes.lord_knight, id: 'paladin' };
  for (const id of ['knight', 'lord_knight', 'crusader', 'paladin']) {
    c.classes[id] = { ...c.classes[id], skills: ['firstaid', 'riding', 'cavalier'],
      baseWeight: 3000, weaponAspd: { dagger: 800, unarmed: 800 } };
  }
  const s = createInitialState(c, 0);
  s.job = job;
  s.learnedSkills.riding = 1;
  return { s: s as GameState & { mounted?: boolean }, c };
}
const setMount = (mounted: boolean) => ({ type: 'setMount', mounted }) as unknown as GameCommand;

describe('persistent Peco eligibility', () => {
  // Catches granting a mount to an invalid job, missing Riding, or a truthy save.
  it.each(['knight', 'lord_knight', 'crusader', 'paladin'])('requires active state and learned Riding for %s', job => {
    const { s, c } = setup(job);
    expect(canPecoMount(s, c)).toBe(true);
    expect(isPecoMounted(s, c)).toBe(false);
    s.mounted = true;
    expect(isPecoMounted(s, c)).toBe(true);
    s.learnedSkills.riding = 0;
    expect(canPecoMount(s, c)).toBe(false);
    expect(isPecoMounted(s, c)).toBe(false);
  });
  it.each(['novice', 'swordsman', 'hunter', 'mage', 'missing'])('rejects mount eligibility for %s even with copied Riding', job => {
    const { s, c } = setup(job); s.mounted = true;
    expect(canPecoMount(s, c)).toBe(false);
    expect(isPecoMounted(s, c)).toBe(false);
  });
  it('accepts Riding by source identity without requiring the catalog support flag', () => {
    const { s, c } = setup(); s.mounted = true;
    expect(c.skills.riding.implementation).toBe('unsupported');
    expect(isPecoMounted(s, c)).toBe(true);
  });
});

describe('Peco source stat projections', () => {
  // Independent literals catch multiplying the post-buff interval, wrong rate,
  // uncapped Cavalier levels, permanent bonuses, and invalid mount bonuses.
  it.each([
    [-1, 50, 2388], [0, 50, 2388], [1, 40, 2228], [2, 30, 2068],
    [3, 20, 1910], [4, 10, 1750], [5, 0, 1592], [6, 0, 1592],
  ])('uses Cavalier level %i penalty %i and interval %i', (level, penalty, interval) => {
    const { s, c } = setup(); s.mounted = true; s.learnedSkills.cavalier = level;
    expect(mountedCavalierPenalty(s, c)).toBe(penalty);
    expect(derivedStats(s, c).attackIntervalMs).toBe(interval);
  });
  it('adds mount penalty to the source rate before applying an ASPD buff', () => {
    const { s, c } = setup(); c.items[2301].effects.aspd = 30;
    expect(derivedStats(s, c).attackIntervalMs).toBe(1114);
    s.mounted = true;
    expect(derivedStats(s, c).attackIntervalMs).toBe(1910);
    expect(derivedStats(s, c).effects.aspd).toBe(-20);
    s.mounted = false;
    expect(derivedStats(s, c).attackIntervalMs).toBe(1114);
  });
  it('adds exactly 1000 weight capacity and removes it on dismount without accumulating', () => {
    const { s, c } = setup(); s.inventory = [{ uid: 'weight', itemId: 501, quantity: 20, refine: 0, cards: [], favorite: false }];
    c.items[501].weight = 90;
    expect(inventoryLoad(s, c)).toEqual({ weight: 1800, maxWeight: 3030, recoveryBlocked: true });
    s.mounted = true;
    expect(inventoryLoad(s, c)).toEqual({ weight: 1800, maxWeight: 4030, recoveryBlocked: false });
    expect(inventoryLoad(s, c).maxWeight).toBe(4030);
    expect(s.stats.str).toBe(1);
    s.mounted = false;
    expect(inventoryLoad(s, c).maxWeight).toBe(3030);
  });
  it('ignores stale invalid mount state in every stat projection', () => {
    const { s, c } = setup(); s.mounted = true; delete s.learnedSkills.riding;
    expect(inventoryLoad(s, c).maxWeight).toBe(3030);
    expect(mountedCavalierPenalty(s, c)).toBe(0);
    expect(derivedStats(s, c).attackIntervalMs).toBe(1592);
  });
});

describe('explicit mount command', () => {
  it('mounts and dismounts idempotently without charging resources or changing owned progress', () => {
    const { s, c } = setup(); const owned = structuredClone(s.inventory), learned = { ...s.learnedSkills };
    const mounted = applyCommand(s, c, setMount(true), 0) as GameState & { mounted?: boolean };
    expect(mounted.mounted).toBe(true);
    expect(applyCommand(mounted, c, setMount(true), 0)).toEqual(mounted);
    const unmounted = applyCommand(mounted, c, setMount(false), 0) as GameState & { mounted?: boolean };
    expect(unmounted.mounted).toBe(false);
    expect(applyCommand(unmounted, c, setMount(false), 0)).toEqual(unmounted);
    expect(unmounted.inventory).toEqual(owned); expect(unmounted.learnedSkills).toEqual(learned);
    expect(unmounted.zeny).toBe(s.zeny); expect(unmounted.sp).toBe(s.sp); expect(unmounted.hp).toBe(s.hp);
    expect(s.mounted).toBeUndefined();
  });
  it('rejects mounting without Riding or an eligible class before mutation', () => {
    for (const job of ['knight', 'mage']) {
      const { s, c } = setup(job); if (job === 'knight') delete s.learnedSkills.riding;
      const previous = structuredClone(s);
      expect(() => applyCommand(s, c, setMount(true), 0)).toThrow(GameError);
      expect(s).toEqual(previous);
    }
  });
  it('allows explicit dismount of stale mount state after eligibility is lost', () => {
    const { s, c } = setup('mage'); s.mounted = true; delete s.learnedSkills.riding;
    expect((applyCommand(s, c, setMount(false), 0) as GameState & { mounted?: boolean }).mounted).toBe(false);
  });
  it('rejects nonboolean mount requests at both command and API boundaries', () => {
    const { s, c } = setup();
    for (const mounted of [undefined, null, 0, 1, 'true']) {
      const command = { type: 'setMount', mounted };
      expect(() => parseCommandRequest({ requestId: 'mount_123', command })).toThrow();
      expect(() => applyCommand(s, c, command as unknown as GameCommand, 0)).toThrow(GameError);
    }
  });
  it.each([true, false])('accepts an explicit API boolean %s', mounted => {
    expect(parseCommandRequest({ requestId: 'mount_123', command: setMount(mounted) }).command).toEqual(setMount(mounted));
  });
  it('clears an invalid mount on class change while preserving inventory and learned skills', () => {
    const { s, c } = setup('novice'); s.jobLevel = 10; s.mounted = true;
    const next = applyCommand(s, c, { type: 'changeClass', classId: 'swordsman' }, 0) as GameState & { mounted?: boolean };
    expect(next.mounted).toBe(false);
    expect(next.inventory).toEqual(s.inventory); expect(next.learnedSkills).toEqual(s.learnedSkills);
  });
  it('clears mount on rebirth while preserving owned items and history', () => {
    const { s, c } = setup(); s.mounted = true; s.baseLevel = 99; s.jobLevel = 50; s.zeny = 50000; s.bestiary[1002] = 42;
    const next = applyCommand(s, c, { type: 'rebirth' }, 0) as GameState & { mounted?: boolean };
    expect(next.mounted).toBe(false); expect(next.job).toBe('high_novice');
    expect(next.inventory).toEqual(s.inventory); expect(next.bestiary[1002]).toBe(42);
  });
});

describe('mounted save compatibility', () => {
  // The SQL pool boundary returns the real mysql tuple shape; decoding, cloning
  // and normalization are exercised through GameRepository.read itself.
  async function load(c: Catalog, state: GameState) {
    const pool = { query: async (sql: string) => [sql.startsWith('SELECT id')
      ? [{ id: 'local-djow' }] : [{ state_json: JSON.stringify(state) }], []] } as unknown as Pool;
    return new GameRepository(pool, () => createInitialState(c, 0)).read();
  }
  it.each([undefined, null, 0, 1, 'true', false])('normalizes legacy/nonboolean saved mount %s to false', async mounted => {
    const { s, c } = setup(); Object.assign(s, { mounted }); s.bestiary[1002] = 42;
    const next = await load(c, s) as GameState & { mounted?: boolean };
    expect(next.mounted).toBe(false); expect(next.bestiary[1002]).toBe(42);
    expect(next.inventory).toEqual(s.inventory); expect(next.learnedSkills).toEqual(s.learnedSkills);
  });
  it('preserves an explicitly mounted save', async () => {
    const { s, c } = setup(); s.mounted = true;
    expect((await load(c, s) as GameState & { mounted?: boolean }).mounted).toBe(true);
  });
});
