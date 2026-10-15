import { describe, expect, it } from 'vitest';
import raw from '../content/catalog.json';
import type { Catalog } from '../shared/types';
import { advanceState } from '../engine';
import { executeCommand } from '../engine/commands';
import { placeSageField } from '../engine/sageFields';
import { addItem } from '../engine/state';
import { castSetup } from './cast-control-fixture';
import { derivedStats } from '../engine/stats';
const center = { x: .48, y: .65 };
function setup(element = 'fire') {
  const x = castSetup(), { s, c, e } = x;
  for (const id of ['sa_volcano', 'sa_deluge', 'sa_violentgale'])
    Object.assign(c.skills[id], { implementation: 'supported', manualUse: 'activate' });
  c.items[715] = structuredClone((raw as unknown as Catalog).items[715]); addItem(s, c, 715, 1);
  s.learnedSkills.sa_volcano = s.learnedSkills.sa_deluge = s.learnedSkills.sa_violentgale = 5;
  s.rotation = []; s.equipment = {}; s.stats = { str: 0, agi: 0, vit: 0, int: 0, dex: 0, luk: 0 };
  c.monsters[e.monsterId].element = element; c.monsters[e.monsterId].def = c.monsters[e.monsterId].mdef = 0;
  c.monsters[e.monsterId].stats.vit = c.monsters[e.monsterId].stats.int = 0;
  c.monsters[e.monsterId].stats.dex = 1000;
  c.monsters[e.monsterId].npcStatusSkills = []; delete e.npcCombat!.cast;
  s.battle!.playerNextSkillAt = s.battle!.playerActionReadyAt = s.battle!.playerNextAttackAt = 999999;
  return x;
}
describe('event-owned source Sage field combat', () => {
  it('adds outgoing Fire ratio points before rounding against a150% target, not a post-damage multiplier', () => {
    const { s, c, e } = setup('water');
    c.elementModifiers = { fire: { water: [150] } }; s.stats.int = 7;
    const skill = c.skills.fire_bolt; Object.assign(skill, { power: [100], hitCount: [1], sourceHitCount: [1], idleDamageMultiplierPct: [100] });
    s.battle!.cast = { skillId: skill.id, level: 1, targetId: e.id, startedAt: 0, endsAt: 250 };
    const baseline = structuredClone(s);
    placeSageField(s, c, c.skills.sa_volcano, 5, 0, center); s.rngState = baseline.rngState;
    const plain = advanceState(baseline, c, 250), field = advanceState(s, c, 250);
    const amount = (state: typeof s) => state.events.find(event => event.kind === 'damage' && event.sourceActorId === s.id)?.amount;
    // MATK8 - minimum monster softMDEF1: floor(7*1.5)=10 vs floor(7*1.7)=11.
    expect(amount(plain)).toBe(10); expect(amount(field)).toBe(11);
  });
  it('adds incoming NPC Fire ratio points for a caster inside the field', () => {
    const { s, c, e } = setup('fire'); c.monsters[e.monsterId].stats.int = 7;
    c.elementModifiers = { fire: { neutral: [150] } };
    c.monsters[e.monsterId].npcStatusSkills = [{ skillId: 19, sourceName: 'MG_FIREBOLT', damageType: 'magic', element: 'fire',
      hitCount: 1, level: 1, rate: 10000, castTimeMs: 250, delayMs: 3000, cancelable: true, range: 9,
      state: 'MSS_RUSH', condition: 'MSC_ALWAYS', sourceRowIndex: 9 }];
    e.npcCombat!.cast = { skillId: 19, sourceRowIndex: 9, level: 1, targetActorId: s.id,
      startedAt: 0, endsAt: 250, areaId: s.areaId, actionId: 'field-bolt' };
    const baseline = structuredClone(s); placeSageField(s, c, c.skills.sa_volcano, 5, 0, center); s.rngState = baseline.rngState;
    const amount = (state: typeof s) => state.events.find(event => event.kind === 'damage' && event.actionId === 'field-bolt')?.amount;
    expect(amount(advanceState(baseline, c, 250))).toBe(12);
    expect(amount(advanceState(s, c, 250))).toBe(13);
  });
  it('adds Fire-defense monster WATK before its attack percent without treating its neutral attack as Fire', () => {
    const { s, c, e } = setup(); c.monsters[e.monsterId].attack = [10, 10]; e.enemyNextAttackAt = 250;
    placeSageField(s, c, c.skills.sa_volcano, 5, 0, center); s.rngState = 0;
    const end = advanceState(s, c, 250);
    expect(end.events.find(event => event.kind === 'damage' && event.sourceActorId === e.id)?.amount).toBe(60);
  });
  it('expires and clamps Deluge monster maxHP before a same-time enemy attack', () => {
    const { s, c, e } = setup('water'); e.maxHp = 100; e.hp = 100;
    placeSageField(s, c, c.skills.sa_deluge, 1, 0, center); expect(e.maxHp).toBe(105);
    s.elementalField!.expiresAt = 250; e.hp = 105; e.enemyNextAttackAt = 250;
    const end = advanceState(s, c, 250), enemy = end.battle!.enemies![0];
    expect(end.elementalField).toBeUndefined(); expect(enemy.maxHp).toBe(100); expect(enemy.hp).toBe(100);
  });
  it('starts one field from the AFK rotation and follows with offense instead of recasting', () => {
    const { s, c } = setup(); s.stats.str = 10; s.rotation = ['sa_volcano']; s.battle!.supportNeedsOffense = false;
    s.battle!.playerNextAttackAt = s.battle!.playerNextSkillAt = s.battle!.playerActionReadyAt = 0;
    const end = advanceState(s, c, Math.ceil((5000 + derivedStats(s, c).attackMotionMs + 1000) / 250) * 250);
    expect(end.events.filter(event => event.kind === 'cast' && event.skillId === 'sa_volcano')).toHaveLength(1);
    expect(end.events.some(event => event.actorAction === 'attack' && event.sourceActorId === s.id &&
      ['damage', 'miss'].includes(event.kind))).toBe(true);
    expect(end.elementalField?.sourceName).toBe('SA_VOLCANO');
  });
  it('replays field cast and expiry identically across request boundaries', () => {
    const { s, c } = setup();
    executeCommand(s, c, { type: 'useSkill', skillId: 'sa_deluge' }, 0);
    const whole = advanceState(s, c, 6500); let pieces = s;
    for (let at = 250; at <= 6500; at += 250) pieces = advanceState(pieces, c, at);
    expect(pieces).toEqual(whole); expect(whole.elementalField?.sourceName).toBe('SA_DELUGE');
  });
  it('clears the owned field immediately when the caster dies and restores surviving enemy maxHP', () => {
    const { s, c, e } = setup('water'); s.hp = 1; e.maxHp = e.hp = 100;
    c.monsters[e.monsterId].attack = [5000, 5000]; e.enemyNextAttackAt = 250;
    placeSageField(s, c, c.skills.sa_deluge, 5, 0, center); s.rngState = 0;
    const end = advanceState(s, c, 250);
    expect(end.totals.deaths).toBe(1); expect(end.elementalField).toBeUndefined();
  });
});
