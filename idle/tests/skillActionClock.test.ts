import { describe, expect, it, vi } from 'vitest';
import * as stateRuntime from '../engine/state';
import raw from '../content/catalog.json';
import type { Catalog, GameState } from '../shared/types';
import { createInitialState, applyCommand } from '../engine';
import { startOwnCast, clearOwnCast } from '../engine/ownCast';
import { resolveSupportCast } from '../engine/supportCasts';
import { beginBattle, tick } from '../engine/encounters';
import { cancelActorCast } from '../engine/castControl';
import { addItem } from '../engine/state';
import { BATTLE_HERO } from '../shared/battleSpatial';
import { sageEnchantCanStart } from '../engine/sageEnchantments';
import { derivedStats } from '../engine/stats';
const c = raw as unknown as Catalog;
type ClockState = GameState & { playerCanActAt?: number };
const ownSkill = Object.values(c.skills).find(s => s.sourceName === 'SA_FLAMELAUNCHER')!;
function player(): ClockState {
  const s = createInitialState(c, 0); s.job = 'sage'; s.stats.dex = 1; s.baseLevel = 50; s.sp = 300;
  addItem(s, c, 990, 2);
  s.learnedSkills[ownSkill.id] = 5; return s;
}
describe('source skill-action clock independent of swing animation', () => {
  it('locks only through the cast start deadline, without adding another motion to a long cast', () => {
    const s = player();
    startOwnCast(s, c, ownSkill, 5, 100, 3000);
    expect(s.playerCanActAt).toBe(3100);
    expect(resolveSupportCast(s, c, 3100)).toBe(true);
    expect(s.playerCanActAt).toBe(3100);
  });
  it('retains a genuine after-cast delay independently of the battle lifetime', () => {
    const s = player(); const skill = { ...ownSkill, afterCastDelayMs: [1500,1500,1500,1500,1500] };
    const catalog = { ...c, skills: { ...c.skills, [skill.id]: skill } };
    startOwnCast(s, catalog, skill, 5, 100, 3000);
    // Source canact is not precomputed as end+motion/delay at cast-start.
    expect(s.playerCanActAt).toBe(3100);
    expect(resolveSupportCast(s, catalog, 3100)).toBe(true);
    expect(s.playerCanActAt).toBe(4600);
    s.battle = null; expect(JSON.parse(JSON.stringify(s)).playerCanActAt).toBe(4600);
  });
  it('releases its own canceled cast lock in town without requiring a battle', () => {
    const s = player(); startOwnCast(s, c, ownSkill, 5, 100, 3000);
    expect(clearOwnCast(s, c, 200, 'cancel')).toBe(true);
    expect(s.playerCanActAt).toBe(200);
  });
  it('cannot erase a newer independently owned action deadline on cancellation', () => {
    const s = player(); startOwnCast(s, c, ownSkill, 5, 100, 3000);
    s.playerCanActAt = 9000;
    clearOwnCast(s, c, 200, 'cancel'); expect(s.playerCanActAt).toBe(9000);
  });
  it('shifts the global deadline and ownership together when offline time is discarded', () => {
    const s = player(); startOwnCast(s, c, ownSkill, 5, 0, 3000);
    s.status = 'paused'; s.pausedStatus = 'town'; s.pausedAt = 0;
    const resumed = applyCommand(s, c, { type: 'setPotions', hpThreshold: 0, spThreshold: 0 }, 10000) as ClockState;
    expect(resumed.playerCanActAt).toBe(13000);
    clearOwnCast(resumed, c, 10100, 'cancel'); expect(resumed.playerCanActAt).toBe(10100);
  });
  it('tracks and releases the offensive cast clock through real interruption', () => {
    const s = player(); s.status = 'challenge'; beginBattle(s, c, 1002, 0, 'mastering');
    s.battle!.cast = { skillId: 'fire_bolt', level: 1, targetId: 'mob', startedAt: 0, endsAt: 3000,
      actionId: 'offensive', clockOwnership: {} };
    // New source ownership on a persisted cast; presentation deadline is unrelated.
    Object.assign(s.battle!.cast, { skillClockOwnership: { readyAt: 3000 } }); s.playerCanActAt = 3000;
    cancelActorCast(s, c, { kind: 'player', actorId: s.id }, 200, 'manual');
    expect(s.playerCanActAt).toBe(200);
  });
  it('ordinary attack motion does not write the actor skill-action clock', () => {
    const s = player(); s.status = 'challenge'; beginBattle(s, c, 1002, 0, 'mastering');
    s.rotation = []; s.battle!.playerNextAttackAt = 0; s.battle!.playerNextSkillAt = 0;
    const enemy = s.battle!.enemies![0]; enemy.hp = enemy.maxHp = 100000;
    enemy.position = { ...BATTLE_HERO }; enemy.approachFrom = { ...BATTLE_HERO }; enemy.startedAt = 0; enemy.arrivedAt = 0;
    tick(s, c, 1, 1);
    expect(s.events.some(e => e.kind === 'damage' && e.target === 'enemy')).toBe(true);
    expect(s.playerCanActAt).toBeUndefined();
  });
  it('a source delay prevents starting another manual own cast, independently of motion', () => {
    const s = player(); s.playerCanActAt = 500;
    expect(sageEnchantCanStart(s, c, ownSkill, 5, 499)).toBe(false);
    expect(sageEnchantCanStart(s, c, ownSkill, 5, 500)).toBe(true);
  });
  it('an actor source delay blocks a new battle basic attack until its exact deadline', () => {
    const s = player(); s.status = 'challenge'; beginBattle(s, c, 1002, 0, 'mastering');
    s.rotation = []; s.playerCanActAt = 500; s.battle!.playerNextAttackAt = 0; s.battle!.playerNextSkillAt = 0;
    const enemy = s.battle!.enemies![0]; enemy.hp = enemy.maxHp = 100000; enemy.hostile = false;
    enemy.position = { ...BATTLE_HERO }; enemy.approachFrom = { ...BATTLE_HERO }; enemy.arrivedAt = 0;
    tick(s, c, 499, 499);
    expect(s.events.some(e => e.kind === 'damage' && e.target === 'enemy')).toBe(false);
    tick(s, c, 500, 1);
    expect(s.events.some(e => e.kind === 'damage' && e.target === 'enemy' && e.at === 500)).toBe(true);
  });
  it('tracks a real offensive cast-start and preserves only native delay on completion', () => {
    const s = player(), bolt = Object.values(c.skills).find(skill => skill.sourceName === 'MG_FIREBOLT')!;
    s.status = 'challenge'; s.learnedSkills[bolt.id] = 1; s.rotation = [bolt.id];
    beginBattle(s, c, 1002, 0, 'mastering'); s.battle!.playerNextSkillAt = 0;
    const enemy = s.battle!.enemies![0]; enemy.hp = enemy.maxHp = 100000; enemy.hostile = false;
    enemy.position = { ...BATTLE_HERO }; enemy.approachFrom = { ...BATTLE_HERO }; enemy.arrivedAt = 0;
    tick(s, c, 1, 1);
    const cast = s.battle!.cast!; expect(cast).toBeDefined();
    const endsAt = cast.endsAt;
    expect(s.playerCanActAt).toBe(Math.max(endsAt, derivedStats(s, c).attackMotionMs));
    s.rotation = []; tick(s, c, endsAt, endsAt - 1);
    expect(s.playerCanActAt).toBe(endsAt + bolt.afterCastDelayMs![0]);
  });
  it('can begin an automatic skill during a prior basic swing, without waiting for the visual pose', () => {
    const s = player(), bolt = Object.values(c.skills).find(skill => skill.sourceName === 'MG_FIREBOLT')!;
    s.status = 'challenge'; s.learnedSkills[bolt.id] = 1; s.rotation = [bolt.id];
    beginBattle(s, c, 1002, 0, 'mastering');
    Object.assign(s.battle!, { playerNextSkillAt: 0, playerNextAttackAt: 500, playerActionReadyAt: 500 });
    const enemy = s.battle!.enemies![0]; enemy.hp = enemy.maxHp = 100000; enemy.hostile = false;
    enemy.position = { ...BATTLE_HERO }; enemy.approachFrom = { ...BATTLE_HERO }; enemy.arrivedAt = 0;
    tick(s, c, 1, 1);
    expect(s.battle!.cast?.startedAt).toBe(0);
    expect(s.events.some(e => e.kind === 'cast' && e.skillId === bolt.id && e.at === 0)).toBe(true);
  });
  it('does not assign an additional visual motion to the next own-cast skill decision', () => {
    const s = player(); s.status = 'challenge'; beginBattle(s, c, 1002, 0, 'mastering');
    startOwnCast(s, c, ownSkill, 5, 100, 3000);
    expect(s.battle!.playerNextSkillAt).toBe(3100);
    expect(s.battle!.playerActionReadyAt).toBeGreaterThan(3100);
  });
  it.each([1,2])('uses the selected level %s source delay when a short own cast fails', level => {
    const s = player(), skill = { ...ownSkill, afterCastDelayMs: [0,1500,0,0,0] };
    const catalog = { ...c, skills: { ...c.skills, [skill.id]: skill } };
    s.sp = 0; startOwnCast(s, catalog, skill, level, 100, 0); const before = s.playerCanActAt;
    expect(resolveSupportCast(s, catalog, 100)).toBe(false);
    expect(s.playerCanActAt).toBe(level === 1 ? before : 100);
  });
  it.each([0,1])('Triple Attack applies source combo delay only with Chain Combo learned (%s)', chainLevel => {
    const s = player(); s.job = 'monk'; s.status = 'challenge';
    const triple = Object.values(c.skills).find(skill => skill.sourceName === 'MO_TRIPLEATTACK')!;
    const chain = Object.values(c.skills).find(skill => skill.sourceName === 'MO_CHAINCOMBO')!;
    s.learnedSkills = { [triple.id]: 10, [chain.id]: chainLevel }; s.rotation = [];
    const attributes = derivedStats(s, c).attributes!;
    const expected = 1000 - 4 * attributes.agi - 2 * attributes.dex;
    beginBattle(s, c, 1002, 0, 'mastering'); s.battle!.playerNextAttackAt = 0; s.battle!.playerNextSkillAt = 0;
    const enemy = s.battle!.enemies![0]; enemy.hp = enemy.maxHp = 100000; enemy.hostile = false;
    enemy.position = { ...BATTLE_HERO }; enemy.approachFrom = { ...BATTLE_HERO }; enemy.arrivedAt = 0;
    const rng = vi.spyOn(stateRuntime, 'random').mockReturnValue(0);
    try {
      tick(s, c, 1, 1);
      expect(s.events.some(e => e.kind === 'damage' && e.skillId === triple.id && e.hitCount === 3)).toBe(true);
      expect(s.playerCanActAt).toBe(chainLevel ? expected : undefined);
    } finally { rng.mockRestore(); }
  });
  it('does not apply a successful postdelay when the offensive cast loses its target', () => {
    const s = player(); s.status = 'challenge'; s.rotation = []; beginBattle(s, c, 1002, 0, 'mastering');
    const enemy = s.battle!.enemies![0]; enemy.hp = 0; enemy.hostile = false;
    s.battle!.enemies!.push({ ...structuredClone(enemy), id: 'live-target', hp: 10000 });
    s.battle!.cast = { skillId: 'fire_bolt', level: 1, targetId: enemy.id, startedAt: 0, endsAt: 1000,
      actionId: 'lost-target', afterCastDelayMs: 2000, skillClockOwnership: { readyAt: 1000 } };
    s.playerCanActAt = 1000; tick(s, c, 1000, 1000);
    expect(s.events.some(e => e.kind === 'cast-failed' && e.actionId === 'lost-target')).toBe(true);
    expect(s.playerCanActAt).toBe(1000);
    expect(s.battle!.playerActionReadyAt ?? 0).toBeLessThanOrEqual(1000);
  });
});
