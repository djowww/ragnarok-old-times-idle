import { createInitialState } from '../engine';
import { fixture } from './engine-fixture';
import raw from '../content/catalog.json';
import type { Catalog } from '../shared/types';
import { beginBattle } from '../engine/encounters';
import { BATTLE_HERO } from '../shared/battleSpatial';
export function castSetup() {
    const real = raw as unknown as Catalog, c = fixture();
    c.classes.sage = { ...structuredClone(real.classes.sage), hp: Array(99).fill(1000), sp: Array(99).fill(100), jobBonuses: {} };
    for (const id of new Set([...c.classes.sage.skills, ...real.classes.mage.skills]))
        c.skills[id] = structuredClone(real.skills[id]);
    for (const id of ['sa_castcancel', 'sa_spellbreaker'])
        c.skills[id].implementation = 'supported';
    c.skills.sa_castcancel.manualUse = 'castCancel' as any;
    c.monsters[1175] = { ...structuredClone(real.monsters[1175]), hp: 1234, attack: [0, 0], attackDelay: 1000, drops: [], baseExp: 0, jobExp: 0 };
    const s = createInitialState(c, 0);
    s.job = 'sage';
    s.hp = 800;
    s.sp = 100;
    s.stats = { str: 0, agi: 0, vit: 0, int: 0, dex: 0, luk: 0 };
    s.learnedSkills = { sa_castcancel: 1, sa_spellbreaker: 1, fire_bolt: 1 };
    s.autoPotion = { hpThreshold: 0, spThreshold: 0 };
    s.status = 'challenge';
    s.areaId = 'prontera';
    beginBattle(s, c, 1175, 0, 'mastering');
    const e = s.battle!.enemies![0], position = { x: BATTLE_HERO.x + 1 / 12, y: BATTLE_HERO.y };
    Object.assign(e, { position, approachFrom: { ...position }, homePosition: { ...position }, arrivedAt: 0, enemyNextAttackAt: 999999, hostile: true, npcCombat: { firstAttackDone: true, readyAt: { 176: 7000 }, cast: { skillId: 176, level: 1, targetActorId: s.id, startedAt: 0, endsAt: 800, areaId: s.areaId, actionId: 'tarou-poison' } } });
    s.battle!.playerNextAttackAt = 999999;
    s.battle!.playerNextSkillAt = s.battle!.playerActionReadyAt = 0;
    s.battle!.supportNeedsOffense = true;
    return { s, c, e };
}
export function ownCast() { const x = castSetup(), b = x.s.battle!; delete x.e.npcCombat!.cast; x.c.skills.fire_bolt.spCost = [25]; b.cast = { skillId: 'fire_bolt', level: 1, targetId: x.e.id, startedAt: 0, endsAt: 1000, actionId: 'own-bolt', afterCastDelayMs: 0, clockOwnership: { actionReadyAt: 1500, previousActionReadyAt: 0, nextSkillAt: 1500, previousNextSkillAt: 0 } }; b.playerActionReadyAt = b.playerNextSkillAt = 1500; b.playerNextAttackAt = 777; return x; }
