import { describe, expect, it } from 'vitest';
import rawCatalog from '../content/catalog.json';
import rawManifest from '../content/source-manifest.json';
import type { Catalog, Monster } from '../shared/types';
import {
  classicAttackInterval, classicCastTime, classicHeal, classicMagicDamage,
  classicPhysicalDamage, classicSkillEffects, classicSkillRecovery, classicSoulDrain,
} from '../engine/classic';

const catalog = rawCatalog as unknown as Catalog;
const skill = (source: string) => Object.values(catalog.skills).find(s => s.sourceName === source)!;
const monster: Monster = {
  ...catalog.monsters[1002], def: 0, mdef: 0, hp: 10000,
  element: 'neutral', race: 'formless', size: 'medium',
  stats: { str: 0, agi: 0, vit: 0, int: 0, dex: 0, luk: 0 },
};
const attacker = { attack: 100, magicAttack: [100, 100] as [number, number] };
const fixedRng = () => 0;

describe('pinned pre-renewal skill export', () => {
  it('contains every resolved source class tree and exact level metadata', () => {
    expect(Object.keys(catalog.classes)).toHaveLength(rawManifest.skillCoverage.classes);
    expect(Object.keys(catalog.skills)).toHaveLength(rawManifest.skillCoverage.skills);
    for (const job of Object.values(catalog.classes)) {
      expect(job.jobBonuses?.str).toHaveLength(job.jobCap);
      expect(job.weaponAspd?.unarmed).toBeGreaterThan(0);
      for (const id of job.skills) expect(catalog.skills[id], id).toBeDefined();
    }
    for (const s of Object.values(catalog.skills)) {
      for (const values of [s.castTimeMs, s.afterCastDelayMs, s.hitCount, s.sourceHitCount, s.aoeRadius, s.range]) {
        expect(values, s.sourceName).toHaveLength(s.maxLevel);
        expect(values!.every(Number.isFinite), s.sourceName).toBe(true);
      }
      for (const row of Object.values(s.prerequisitesByClass ?? {}))
        for (const prerequisite of row) expect(catalog.skills[prerequisite.skillId], prerequisite.skillId).toBeDefined();
      for (const row of s.itemCostByLevel ?? [])
        for (const reagent of row) expect(catalog.items[reagent.itemId], `${s.id}: ${reagent.itemId}`).toBeDefined();
      if (s.implementation === 'unsupported') expect(s.unsupportedReason).toBeTruthy();
    }
    expect(rawManifest.sources.some(s => s.path === 'src/map/battle.c')).toBe(true);
    expect(rawManifest.sources.some(s => s.path === 'db/job_db2.txt')).toBe(true);
  });

  it('preserves old save ids and complete Mage/Wizard/High Wizard source trees', () => {
    expect(skill('MG_FIREBOLT').id).toBe('fire_bolt');
    expect(skill('WZ_STORMGUST').id).toBe('storm_gust');
    for (const source of ['MG_SRECOVERY', 'MG_NAPALMBEAT', 'MG_SOULSTRIKE', 'MG_FIREBALL', 'MG_THUNDERSTORM'])
      expect(catalog.classes.mage.skills).toContain(skill(source).id);
    for (const source of ['WZ_METEOR', 'WZ_VERMILION', 'WZ_WATERBALL', 'WZ_ICEWALL', 'WZ_QUAGMIRE'])
      expect(catalog.classes.wizard.skills).toContain(skill(source).id);
    for (const source of ['HW_SOULDRAIN', 'HW_MAGICCRASHER', 'HW_MAGICPOWER', 'HW_NAPALMVULCAN', 'HW_GANBANTEIN', 'HW_GRAVITATION'])
      expect(catalog.classes.high_wizard.skills).toContain(skill(source).id);
    expect(skill('MG_FIREBALL').castTimeMs).toEqual([1500, 1500, 1500, 1500, 1500, 1000, 1000, 1000, 1000, 1000]);
    expect(skill('MG_FIREBALL').prerequisitesByClass?.mage).toEqual([{ skillId: 'fire_bolt', level: 4 }]);
    expect(skill('MG_THUNDERSTORM').aoeRadius).toEqual(Array(10).fill(2));
    expect(skill('HW_MAGICPOWER').ignoresDex).toBe(true);
    expect(skill('WZ_ICEWALL').implementation).toBe('unsupported');
    expect(skill('HW_GANBANTEIN').damageType).toBe('none');
    expect(catalog.monsters[1038].boss).toBe(true);
    expect(catalog.monsters[1002].boss).toBe(false);
  });
});

describe('Hercules integer arithmetic golden cases', () => {
  it('uses DEX/150 casting, pre-renewal ASPD motion and source recovery', () => {
    expect(classicCastTime(7000, 0)).toBe(7000);
    expect(classicCastTime(7000, 75)).toBe(3500);
    expect(classicCastTime(7000, 150)).toBe(0);
    expect(classicAttackInterval(700, 10, 10)).toBe(1330);
    expect(classicAttackInterval(700, 300, 150)).toBe(200);
    expect(classicSkillRecovery(1000, 10, 'sp')).toBe(50);
    expect(classicSkillRecovery(1000, 10, 'hp')).toBe(70);
    expect(classicSoulDrain(50, 10)).toBe(122);
    expect(classicHeal(50, 50, 10)).toBe(1008);
  });

  it('distinguishes spell ratios, positive hit counts and visual hit division', () => {
    expect(classicMagicDamage(attacker, monster, skill('MG_FIREBOLT'), 10, fixedRng)).toBe(1000);
    expect(classicMagicDamage(attacker, monster, skill('MG_THUNDERSTORM'), 10, fixedRng)).toBe(800);
    expect(classicMagicDamage(attacker, monster, skill('MG_FIREBALL'), 10, fixedRng)).toBe(170);
    expect(classicMagicDamage({ ...attacker, targetCount: 2 }, monster, skill('MG_NAPALMBEAT'), 10, fixedRng)).toBe(85);
    expect(classicMagicDamage(attacker, monster, skill('MG_SOULSTRIKE'), 10, fixedRng)).toBe(500);
    expect(classicMagicDamage(attacker, { ...monster, element: 'undead' }, skill('MG_SOULSTRIKE'), 10, fixedRng)).toBe(750);
    expect(classicMagicDamage(attacker, monster, skill('WZ_VERMILION'), 10, fixedRng)).toBe(280);
    expect(classicMagicDamage(attacker, monster, skill('WZ_FIREPILLAR'), 10, fixedRng)).toBe(840);
    expect(classicMagicDamage(attacker, monster, skill('HW_NAPALMVULCAN'), 5, fixedRng)).toBe(600);
  });

  it('applies magic defense before positive hit multiplication and rejects missing mechanics', () => {
    const resistant = { ...monster, mdef: 80, stats: { ...monster.stats, int: 5, vit: 10 } };
    expect(classicMagicDamage(attacker, resistant, skill('MG_FIREBOLT'), 3, fixedRng)).toBe(30);
    expect(classicMagicDamage({ ...attacker, elementMultiplier: 0 }, monster, skill('MG_SOULSTRIKE'), 10, fixedRng)).toBe(0);
    expect(classicMagicDamage(attacker, monster, skill('WZ_ICEWALL'), 10, fixedRng)).toBe(0);
    expect(classicPhysicalDamage(attacker, monster, skill('AS_POISONREACT'), 10, fixedRng)).toBe(0);
  });

  it('applies weapon hit multiplication before defense and refinement afterward', () => {
    const armored = { ...monster, def: 50, stats: { ...monster.stats, vit: 10 } };
    expect(classicPhysicalDamage(attacker, armored, skill('AC_DOUBLE'), 10, fixedRng)).toBe(180);
    expect(classicPhysicalDamage({ ...attacker, weaponRefineAttack: 20 }, armored, skill('AC_DOUBLE'), 10, fixedRng)).toBe(200);
    expect(classicPhysicalDamage(attacker, armored, skill('MO_INVESTIGATE'), 5, fixedRng)).toBe(570);
    expect(classicPhysicalDamage({ ...attacker, weaponWeight: 100, str: 50 }, monster, skill('LK_SPIRALPIERCE'), 5, fixedRng)).toBe(1525);
    expect(classicPhysicalDamage({ ...attacker, weaponType: 'sword', skillLevelsBySource: { SM_SWORD: 10 } }, armored, undefined, 1, fixedRng)).toBe(80);
  });

  it('translates representable source statuses instead of invented flat bonuses', () => {
    expect(classicSkillEffects(skill('AL_BLESSING'), 10)).toEqual({ str: 10, int: 10, dex: 10 });
    expect(classicSkillEffects(skill('MG_SRECOVERY'), 10)).toEqual({});
    expect(classicSkillEffects(skill('CR_AUTOGUARD'), 10)).toEqual({ blockPct: 30 });
    expect(classicSkillEffects(skill('CR_REFLECTSHIELD'), 10)).toEqual({ reflectPct: 40 });
    expect(classicSkillEffects(skill('TF_MISS'), 10, { jobId: 'assassin' })).toEqual({ flee: 40 });
    expect(classicSkillEffects(skill('BA_POEMBRAGI'), 10, { dex: 50, int: 40, skillLevelsBySource: { BA_MUSICALLESSON: 10 } })).toEqual({ castReductionPct: 55, afterCastReductionPct: 78 });
  });
});
