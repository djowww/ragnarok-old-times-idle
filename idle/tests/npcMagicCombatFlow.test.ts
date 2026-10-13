import { afterEach, describe, expect, it, vi } from 'vitest';
import { advanceState } from '../engine';
import { executeCommand } from '../engine/commands';
import { castSetup } from './cast-control-fixture';
import * as tools from '../engine/state';
import rawCatalog from '../content/catalog.json';
import type { Catalog } from '../shared/types';
import { sceneEventSkill } from '../web/assets/combatPresentation';
import { hasSceneAction } from '../web/assets/groundTraps';
import { isNpcStatusAction } from '../shared/playerStatusView';
import { tryMonsterStatusSkill } from '../engine/monsterStatusSkills';

const sourceCatalog = rawCatalog as unknown as Catalog;

afterEach(() => vi.restoreAllMocks());

function boltFixture() {
  const { s, c, e } = castSetup();
  c.monsters[1175].stats.int = 30;
  c.monsters[1175].npcStatusSkills = [{ skillId: 19, sourceName: 'MG_FIREBOLT', damageType: 'magic', element: 'fire',
    hitCount: 1, baseSp: 17, level: 1, rate: 10000, castTimeMs: 300, delayMs: 3000,
    cancelable: true, range: 9, state: 'MSS_RUSH', condition: 'MSC_ALWAYS', sourceRowIndex: 9 }];
  e.npcCombat = { firstAttackDone: false, readyAt: {}, cast: { skillId: 19, sourceRowIndex: 9, baseSp: 17,
    level: 1, targetActorId: s.id, startedAt: 0, endsAt: 300, areaId: s.areaId, actionId: 'real-bolt',
    sourcePosition: { ...e.position } } };
  e.enemyNextAttackAt = 1000;
  s.rotation = [];
  return { s, c, e };
}

function soulStrikeFixture(casterElement: string) {
  const { s, c, e } = boltFixture();
  c.monsters[1175].element = casterElement;
  c.monsters[1175].npcStatusSkills = [{ skillId: 13, sourceName: 'MG_SOULSTRIKE', damageType: 'magic', element: 'ghost',
    hitCount: 1, baseSp: 42, level: 1, rate: 10000, castTimeMs: 300, delayMs: 3000,
    cancelable: true, range: 9, state: 'MSS_RUSH', condition: 'MSC_ALWAYS', sourceRowIndex: 11 }];
  e.npcCombat!.cast = { skillId: 13, sourceRowIndex: 11, baseSp: 42, level: 1, targetActorId: s.id,
    startedAt: 0, endsAt: 300, areaId: s.areaId, actionId: 'soul-strike' };
  return { s, c };
}

describe('source NPC magical attack flow', () => {
  it('routes a completed NPC bolt through player MDEF and elemental defense', () => {
    const { s, c, e } = boltFixture();
    s.stats.int = 30;
    vi.spyOn(tools, 'random').mockReturnValue(0);
    const end = advanceState(s, c, 500);
    const hit = end.events.find(event => event.skillId === 'mg_firebolt' && event.kind === 'damage');
    expect(end.hp).toBeLessThan(s.hp);
    expect(hit).toMatchObject({ sourceActorId: e.id, targetActorId: s.id, enemyId: e.id, actionId: 'real-bolt', actorAction: 'skill' });
  });

  it.each([
    ['MG_FIREBOLT', 'fire_bolt', 'fire', 19],
    ['MG_COLDBOLT', 'cold_bolt', 'water', 14],
    ['MG_LIGHTNINGBOLT', 'lightning_bolt', 'wind', 20],
    ['MG_SOULSTRIKE', 'soul_strike', 'ghost', 13],
  ])('admits actual %s NPC cast and damage events to source-mapped scene FX', (sourceName, skillId, element, herculesId) => {
    vi.spyOn(tools, 'random').mockReturnValue(0);
    const { s, c, e } = boltFixture();
    const row = c.monsters[1175].npcStatusSkills![0];
    Object.assign(row, { skillId: Number(herculesId), sourceName, element });
    row.state = 'MSS_BERSERK';
    delete e.npcCombat!.cast;
    const startEventId = s.nextEventId;
    tryMonsterStatusSkill(s, c, e, 0);
    const cast = s.events.find(event => event.id >= startEventId && event.kind === 'cast')!;
    expect(cast.text).toBe(c.skills[skillId].name);
    expect(isNpcStatusAction(cast, s.id)).toBe(true);
    expect(hasSceneAction(cast.kind, !!sceneEventSkill(cast, c.skills))).toBe(true);
    const end = advanceState(s, c, 500);
    const hit = end.events.find(event => event.kind === 'damage' && event.sourceActorId === e.id && event.skillId === sourceName.toLowerCase());
    expect(hit).toBeDefined();
    expect(isNpcStatusAction(hit!, s.id)).toBe(true);
    expect(hasSceneAction(hit!.kind, !!sceneEventSkill(hit!, c.skills))).toBe(true);
    expect(sceneEventSkill(hit!, c.skills)?.id).toBe(skillId);
  });

  it('uses caster attack motion on an instant NPC magic release', () => {
    vi.spyOn(tools, 'random').mockReturnValue(0);
    const { s, c, e } = boltFixture();
    c.monsters[1175].attackMotionMs = 487;
    c.monsters[1175].npcStatusSkills![0].state = 'MSS_BERSERK';
    c.monsters[1175].npcStatusSkills![0].castTimeMs = 0;
    e.npcCombat!.cast!.endsAt = 0;
    const end = advanceState(s, c, 500);
    expect(end.events.find(event => event.kind === 'damage' && event.skillId === 'mg_firebolt'))
      .toMatchObject({ actionStartedAt: 0, actionMotionMs: 487, actionId: 'real-bolt' });
  });

  it('labels the casted phase separately from the release motion while keeping one action identity', () => {
    vi.spyOn(tools, 'random').mockReturnValue(0);
    const { s, c, e } = boltFixture();
    c.monsters[1175].attackMotionMs = 487;
    c.monsters[1175].npcStatusSkills![0].state = 'MSS_BERSERK';
    delete e.npcCombat!.cast;
    const startEventId = s.nextEventId;
    expect(tryMonsterStatusSkill(s, c, e, 0)).toBe(true);
    const cast = s.events.find(event => event.id >= startEventId && event.kind === 'cast')!;
    const end = advanceState(s, c, 500);
    const hit = end.events.find(event => event.kind === 'damage' && event.skillId === 'mg_firebolt')!;
    expect(cast).toMatchObject({ castMs: 300, actionStartedAt: 0, actionMotionMs: 300 });
    expect(hit).toMatchObject({ actionStartedAt: 300, actionMotionMs: 487, actionId: cast.actionId });
  });

  it('does not apply Soul Strike undead bonus from an undead caster to the neutral player target', () => {
    vi.spyOn(tools, 'random').mockReturnValue(0);
    const undeadCaster = soulStrikeFixture('undead');
    const otherCaster = soulStrikeFixture('fire');
    const undeadEnd = advanceState(undeadCaster.s, undeadCaster.c, 500);
    const otherEnd = advanceState(otherCaster.s, otherCaster.c, 500);
    expect(undeadCaster.s.hp - undeadEnd.hp).toBe(otherCaster.s.hp - otherEnd.hp);
  });

  it('resolves NPC magic ratios through the source skill alias instead of the player Idle multiplier', () => {
    vi.spyOn(tools, 'random').mockReturnValue(0);
    const { s, c } = soulStrikeFixture('fire');
    c.skills.soul_strike.power[0] = 200;
    const end = advanceState(s, c, 500);
    expect(s.hp - end.hp).toBe(92);
  });

  it('applies learned Skin Temper and Dragonology as incoming magic passives', () => {
    vi.spyOn(tools, 'random').mockReturnValue(0);
    const base = boltFixture();
    const skin = boltFixture();
    skin.c.skills.bs_skintemper = structuredClone(sourceCatalog.skills.bs_skintemper);
    skin.s.learnedSkills.bs_skintemper = 1;
    const dragonBase = boltFixture();
    const dragonology = boltFixture();
    dragonBase.c.monsters[1175].race = dragonology.c.monsters[1175].race = 'dragon';
    dragonology.c.skills.sa_dragonology = structuredClone(sourceCatalog.skills.sa_dragonology);
    dragonology.s.learnedSkills.sa_dragonology = 2;

    const baseDamage = base.s.hp - advanceState(base.s, base.c, 500).hp;
    const skinDamage = skin.s.hp - advanceState(skin.s, skin.c, 500).hp;
    const dragonDamage = dragonBase.s.hp - advanceState(dragonBase.s, dragonBase.c, 500).hp;
    const dragonologyDamage = dragonology.s.hp - advanceState(dragonology.s, dragonology.c, 500).hp;
    expect(skinDamage).toBeLessThan(baseDamage);
    expect(dragonologyDamage).toBeLessThan(dragonDamage);
  });

  it('applies neutral equipment resistance only to neutral NPC spells', () => {
    vi.spyOn(tools, 'random').mockReturnValue(0);
    const fire = boltFixture();
    const fireResist = boltFixture();
    const neutral = boltFixture();
    const neutralResist = boltFixture();
    for (const fixture of [fireResist, neutralResist]) {
      fixture.c.items[4133] = structuredClone(sourceCatalog.items[4133]);
      fixture.s.inventory.push({ uid: 'test-raydric', itemId: 4133, quantity: 1, refine: 0, cards: [], favorite: false, identified: true });
      fixture.s.equipment.garment = 'test-raydric';
    }
    for (const fixture of [neutral, neutralResist])
      fixture.c.monsters[1175].npcStatusSkills![0].element = 'neutral';
    const fireDamage = fire.s.hp - advanceState(fire.s, fire.c, 500).hp;
    const fireWithNeutralResist = fireResist.s.hp - advanceState(fireResist.s, fireResist.c, 500).hp;
    const neutralDamage = neutral.s.hp - advanceState(neutral.s, neutral.c, 500).hp;
    const neutralWithResist = neutralResist.s.hp - advanceState(neutralResist.s, neutralResist.c, 500).hp;
    expect(fireWithNeutralResist).toBe(fireDamage);
    expect(neutralWithResist).toBeLessThan(neutralDamage);
  });

  it('does not route incoming magic through physical resistance, Auto Guard, or reflect', () => {
    vi.spyOn(tools, 'random').mockReturnValue(0);
    const plain = boltFixture();
    const protectedPlayer = boltFixture();
    const raydric = structuredClone(sourceCatalog.items[4133]);
    raydric.effects = { ...raydric.effects, physicalResistPct: 100, autoGuardPct: 100, reflectPct: 100 };
    protectedPlayer.c.items[4133] = raydric;
    protectedPlayer.s.inventory.push({ uid: 'test-physical-defenses', itemId: 4133, quantity: 1, refine: 0, cards: [], favorite: false, identified: true });
    protectedPlayer.s.equipment.garment = 'test-physical-defenses';
    protectedPlayer.c.skills.cr_autoguard = structuredClone(sourceCatalog.skills.cr_autoguard);
    protectedPlayer.s.learnedSkills.cr_autoguard = 10;
    const initialEnemyHp = protectedPlayer.e.hp;
    const plainEnd = advanceState(plain.s, plain.c, 500);
    const protectedEnd = advanceState(protectedPlayer.s, protectedPlayer.c, 500);
    expect(protectedPlayer.s.hp - protectedEnd.hp).toBe(plain.s.hp - plainEnd.hp);
    expect(protectedEnd.battle!.enemies![0].hp).toBe(initialEnemyHp);
    expect(protectedEnd.events.some(event => event.kind === 'guard')).toBe(false);
  });

  it('lets Fog Wall fail a direct NPC cast before damage, Rod refund, and Endure charge', () => {
    vi.spyOn(tools, 'random').mockReturnValue(0.5);
    const { s, c, e } = boltFixture();
    c.skills.pf_fogwall = structuredClone(sourceCatalog.skills.pf_fogwall);
    c.skills.sm_endure = structuredClone(sourceCatalog.skills.sm_endure);
    s.buffs.pf_fogwall = { expiresAt: 10_000, effects: {} };
    s.buffs.sa_magicrod = { expiresAt: 1_200, effects: {} };
    s.combatEffects = { buffLevels: { sa_magicrod: 5 }, endure: { level: 10, charges: 2, expiresAt: 10_000 } };
    s.learnedSkills.sa_magicrod = 5;
    s.buffs.sm_endure = { expiresAt: 10_000, effects: {} };
    const end = advanceState(s, c, 500);
    expect(end.events.find(event => event.kind === 'miss' && event.skillId === 'mg_firebolt'))
      .toMatchObject({ sourceActorId: e.id, targetActorId: s.id, actionId: 'real-bolt' });
    expect(end.events.some(event => event.kind === 'damage' && event.skillId === 'mg_firebolt')).toBe(false);
    expect(end.events.some(event => event.skillId === 'sa_magicrod')).toBe(false);
    expect(end.combatEffects?.endure?.charges).toBe(2);
  });

  it('reduces a successful direct NPC hit by the source 25 percent and consumes one Endure charge', () => {
    vi.spyOn(tools, 'random').mockReturnValue(0.9);
    const plain = boltFixture();
    const guarded = boltFixture();
    guarded.c.skills.pf_fogwall = structuredClone(sourceCatalog.skills.pf_fogwall);
    guarded.c.skills.sm_endure = structuredClone(sourceCatalog.skills.sm_endure);
    guarded.s.buffs.pf_fogwall = { expiresAt: 10_000, effects: {} };
    guarded.s.combatEffects = { endure: { level: 10, charges: 2, expiresAt: 10_000 } };
    guarded.s.buffs.sm_endure = { expiresAt: 10_000, effects: {} };
    const plainDamage = plain.s.hp - advanceState(plain.s, plain.c, 500).hp;
    const end = advanceState(guarded.s, guarded.c, 500);
    const hit = end.events.find(event => event.kind === 'damage' && event.skillId === 'mg_firebolt')!;
    expect(hit.amount).toBe(plainDamage - Math.floor(plainDamage * 25 / 100));
    expect(hit.hitMotionMs).toBe(0);
    expect(end.combatEffects?.endure?.charges).toBe(1);
  });

  it('does not spend Endure when Magic Rod reduces the NPC hit to zero', () => {
    vi.spyOn(tools, 'random').mockReturnValue(0);
    const { s, c } = boltFixture();
    c.skills.sm_endure = structuredClone(sourceCatalog.skills.sm_endure);
    s.learnedSkills.sa_magicrod = 5;
    s.buffs.sa_magicrod = { expiresAt: 1_200, effects: {} };
    s.combatEffects = { buffLevels: { sa_magicrod: 5 }, endure: { level: 10, charges: 2, expiresAt: 10_000 } };
    s.buffs.sm_endure = { expiresAt: 10_000, effects: {} };
    const end = advanceState(s, c, 500);
    expect(end.events.find(event => event.kind === 'damage' && event.skillId === 'mg_firebolt')?.amount).toBe(0);
    expect(end.combatEffects?.endure?.charges).toBe(2);
  });

  it('keeps simultaneous casts from different NPCs on separate actor identities', () => {
    const { s, c, e } = boltFixture();
    const second = structuredClone(e);
    second.id = 'second-caster';
    second.npcCombat!.cast!.actionId = 'second-bolt';
    s.battle!.enemies!.push(second);
    vi.spyOn(tools, 'random').mockReturnValue(0);
    const end = advanceState(s, c, 500);
    const hits = end.events.filter(event => event.skillId === 'mg_firebolt' && event.kind === 'damage');
    expect(hits).toHaveLength(2);
    expect(hits.map(hit => [hit.sourceActorId, hit.actionId]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))))
      .toEqual([[e.id, 'real-bolt'], [second.id, 'second-bolt']].sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
  });

  it('lets magical damage pass through Kyrie while consuming its source pool and one hit', () => {
    const { s, c } = boltFixture();
    s.combatEffects = { kyrieHp: 10000, kyrieHits: 3 };
    vi.spyOn(tools, 'random').mockReturnValue(0);
    const end = advanceState(s, c, 500);
    const damage = s.hp - end.hp;
    expect(damage).toBeGreaterThan(0);
    expect(end.hp).toBe(s.hp - damage);
    expect(end.combatEffects).toMatchObject({ kyrieHp: 10000 - damage, kyrieHits: 2 });
  });

  it('applies this hit reduction then ends Energy Coat when its SP charge is unaffordable', () => {
    vi.spyOn(tools, 'random').mockReturnValue(0);
    const { s, c } = boltFixture();
    c.classes.sage.sp = Array(99).fill(500);
    c.skills.mg_energycoat = structuredClone(sourceCatalog.skills.mg_energycoat);
    s.sp = 1;
    s.combatEffects = { energyCoat: true };
    s.buffs.mg_energycoat = { expiresAt: 10_000, effects: {} };
    const base = boltFixture();
    const baseDamage = base.s.hp - advanceState(base.s, base.c, 500).hp;
    const end = advanceState(s, c, 500);
    const coatedDamage = s.hp - end.hp;
    expect(coatedDamage).toBeLessThan(baseDamage);
    expect(end.sp).toBe(1);
    expect(end.combatEffects?.energyCoat).toBe(false);
    expect(end.buffs.mg_energycoat).toBeUndefined();
    expect(end.events.filter(event => event.kind === 'status-end' && event.skillId === 'mg_energycoat')).toHaveLength(1);
  });

  it('spends 2 SP and refunds the original NPC spell SP when Magic Rod catches its completion', () => {
    const { s, c, e } = boltFixture();
    s.learnedSkills.sa_magicrod = 5;
    s.sp = 20;
    executeCommand(s, c, { type: 'useSkill', skillId: 'sa_magicrod' }, 100);
    expect(s.sp).toBe(18);
    const end = advanceState(s, c, 500);
    expect(end.hp).toBe(s.hp);
    expect(end.sp).toBe(35);
    expect(end.events.find(event => event.skillId === 'sa_magicrod' && event.kind === 'skill' && event.amount === 17))
      .toMatchObject({ amount: 17, sourceActorId: s.id, targetActorId: s.id, actionId: 'real-bolt' });
    expect(end.events.find(event => event.skillId === 'mg_firebolt' && event.kind === 'damage'))
      .toMatchObject({ amount: 0, sourceActorId: e.id, targetActorId: s.id, actorAction: 'skill' });
  });

  it('catches a pending cast from the AFK rotation and resumes player offense after the refund', () => {
    const { s, c, e } = boltFixture();
    s.learnedSkills.sa_magicrod = 1;
    s.sp = 20;
    executeCommand(s, c, { type: 'setRotation', skillIds: ['sa_magicrod'] }, 0);
    s.battle!.playerNextAttackAt = 1000;
    s.battle!.supportNeedsOffense = false;
    const end = advanceState(s, c, 1200);
    expect(end.events.some(event => event.skillId === 'sa_magicrod' && event.kind === 'skill' && event.actionId === 'real-bolt')).toBe(true);
    expect(end.events.some(event => event.skillId === 'mg_firebolt' && event.kind === 'damage' && event.amount === 0)).toBe(true);
    expect(end.events.find(event => event.kind === 'damage' && event.sourceActorId === s.id && event.targetActorId === e.id))
      .toMatchObject({ actorAction: 'attack', targetActorId: e.id });
  });

  it('pre-arms Magic Rod before the NPC starts its cast and intercepts the later completion', () => {
    const { s, c, e } = boltFixture();
    s.learnedSkills.sa_magicrod = 2;
    s.sp = 20;
    delete e.npcCombat!.cast;
    executeCommand(s, c, { type: 'useSkill', skillId: 'sa_magicrod' }, 0);
    expect(s.buffs.sa_magicrod?.expiresAt).toBe(600);
    expect(s.sp).toBe(18);
    const afterPrearm = advanceState(s, c, 100);
    const caster = afterPrearm.battle!.enemies![0];
    caster.npcCombat!.cast = { skillId: 19, sourceRowIndex: 9, baseSp: 17, level: 1, targetActorId: s.id,
      startedAt: 100, endsAt: 300, areaId: s.areaId, actionId: 'later-bolt' };
    const end = advanceState(afterPrearm, c, 500);
    expect(end.hp).toBe(s.hp);
    expect(end.sp).toBe(24);
    expect(end.events.some(event => event.skillId === 'sa_magicrod' && event.kind === 'skill' && event.actionId === 'later-bolt')).toBe(true);
  });

  it('allows learned Magic Rod in the rotation without stalling offense when no NPC magic is pending', () => {
    const { s, c, e } = boltFixture();
    s.learnedSkills.sa_magicrod = 1;
    executeCommand(s, c, { type: 'setRotation', skillIds: ['sa_magicrod'] }, 0);
    expect(s.rotation).toEqual(['sa_magicrod']);
    delete e.npcCombat!.cast;
    e.npcCombat!.readyAt = {};
    s.battle!.playerNextAttackAt = 1000;
    s.battle!.playerNextSkillAt = 0;
    s.battle!.playerActionReadyAt = 0;
    s.battle!.supportNeedsOffense = false;
    const end = advanceState(s, c, 1000);
    expect(end.events.some(event => event.skillId === 'sa_magicrod' && event.kind === 'skill')).toBe(false);
    expect(end.sp).toBe(s.sp);
    expect(end.events.find(event => event.kind === 'damage' && event.sourceActorId === s.id && event.targetActorId === e.id))
      .toMatchObject({ at: 1000, actorAction: 'attack', targetActorId: e.id });
  });
});
