import { describe, expect, it } from 'vitest';
import rawCatalog from '../content/catalog.json';
import rawManifest from '../content/source-manifest.json';
import type { Catalog, Monster } from '../shared/types';
import {
  classicAttackInterval, classicBashStunChance, classicCastTime, classicCrucisBaseChance, classicHeal, classicMagicDamage,
  classicPhysicalDamage, classicSkillEffects, classicSkillRecovery, classicSoulDrain,
} from '../engine/classic';
import { classicCrucisAffects, effectiveMonsterStatus, classicDecreaseAgilityBaseChance, classicStatusResistance } from '../engine/classicStatuses';

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
    expect(Object.keys(catalog.classes)).toHaveLength(40);
    expect(Object.keys(catalog.skills)).toHaveLength(348);
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
    expect(skill('SM_PROVOKE').implementation).toBe('supported');
    expect(skill('SM_FATALBLOW').implementation).toBe('supported');
    expect(skill('PR_LEXAETERNA').implementation).toBe('supported');
    expect(skill('AL_DECAGI').implementation).toBe('supported');
    expect(skill('AL_CRUCIS').implementation).toBe('supported');
    expect(skill('LK_AURABLADE').implementation).toBe('supported');
    expect(skill('WZ_ICEWALL').implementation).toBe('unsupported');
    expect(skill('HW_GANBANTEIN').damageType).toBe('none');
    expect(catalog.monsters[1038].boss).toBe(true);
    expect(catalog.monsters[1002].boss).toBe(false);
  });
});

describe('Assassin dual-wield source arithmetic', () => {
  it('applies the pinned right and left hand percentages only to basic attacks', () => {
    const dual = {
      ...attacker, baseAttack: 10, dex: 100,
      weaponAttack: 100, weaponLevel: 1, weaponType: 'dagger' as const,
      leftWeaponAttack: 50, leftWeaponLevel: 1, leftWeaponType: 'dagger' as const,
      skillLevelsBySource: { AS_RIGHT: 5, AS_LEFT: 5 },
    };
    expect(classicPhysicalDamage(dual, monster, undefined, 1, fixedRng)).toBe(156);
    expect(classicPhysicalDamage({ ...dual, leftWeaponAttack: undefined }, monster, undefined, 1, fixedRng)).toBe(109);
    expect(classicPhysicalDamage({ ...dual, sizeMultiplier: 0.5, leftSizeMultiplier: 0.25 }, monster, undefined, 1, fixedRng)).toBe(75);
    for (const source of ['AS_SONICBLOW', 'KN_BRANDISHSPEAR']) {
      expect(classicPhysicalDamage(dual, monster, skill(source), 1, fixedRng))
        .toBe(classicPhysicalDamage({ ...dual, leftWeaponAttack: undefined }, monster, skill(source), 1, fixedRng));
    }
  });
});

describe('Hercules integer arithmetic golden cases', () => {
  it('applies Advanced Book only to books and only when the passive is supported', () => {
    for (let level = 1; level <= 10; level++) {
      const base = { ...attacker, baseAttack: 40, weaponAttack: 100, weaponType: 'book' as const,
        skillLevelsBySource: { SA_ADVANCEDBOOK: level } };
      const book = classicPhysicalDamage(base, monster, undefined, 1, fixedRng);
      const staff = classicPhysicalDamage({ ...base, weaponType: 'staff' }, monster, undefined, 1, fixedRng);
      const unavailable = classicPhysicalDamage({ ...base, skillLevelsBySource: {} }, monster, undefined, 1, fixedRng);
      expect(book - staff).toBe(3 * level);
      expect(staff).toBe(unavailable);
    }
  });

  it('enables Fatal Blow stun on Bash only above level 5 using the attacker base level', () => {
    expect(classicBashStunChance(5, 99, 1)).toBe(0);
    expect(classicBashStunChance(6, 99, 1)).toBe(9.9);
    expect(classicBashStunChance(10, 99, 1)).toBe(49.5);
    expect(classicBashStunChance(10, 50, 0)).toBe(0);
  });

  it('matches Signum Crucis chance, target eligibility and hard-defense reduction', () => {
    expect(classicCrucisBaseChance(5, 50, 20)).toBe(73);
    expect(classicCrucisBaseChance(10, 99, 1)).toBe(100);
    expect(classicCrucisBaseChance(1, 1, 99)).toBe(0);
    expect(classicCrucisAffects({ ...monster, race: 'demon', element: 'neutral' })).toBe(true);
    expect(classicCrucisAffects({ ...monster, race: 'formless', element: 'undead' })).toBe(true);
    expect(classicCrucisAffects({ ...monster, race: 'formless', element: 'neutral' })).toBe(false);
    expect(effectiveMonsterStatus({ ...monster, def: 101 }, {
      SC_CRUCIS: { expiresAt: 2000, level: 5 },
    }, 1000).monster.def).toBe(71);
  });

  it('halves frozen hard DEF before applying Signum Crucis integer reduction', () => {
    expect(effectiveMonsterStatus({ ...monster, def: 7 }, {
      SC_FREEZE: { expiresAt: 2000, level: 1 },
      SC_CRUCIS: { expiresAt: 2000, level: 5 },
    }, 1000).monster.def).toBe(3);
  });

  it('adds Aura Blade damage after hard DEF and skips Spiral Pierce', () => {
    const target = { ...monster, def: 50, stats: { ...monster.stats, vit: 0 } };
    const base = classicPhysicalDamage(attacker, target, undefined, 1, fixedRng);
    const enhanced = classicPhysicalDamage({ ...attacker, activeSkillsBySource: { LK_AURABLADE: 5 } }, target, undefined, 1, fixedRng);
    const spiralPierce = classicPhysicalDamage({ ...attacker, activeSkillsBySource: { LK_AURABLADE: 5 } }, target, skill('LK_SPIRALPIERCE'), 5, fixedRng);
    const normalSpiralPierce = classicPhysicalDamage(attacker, target, skill('LK_SPIRALPIERCE'), 5, fixedRng);
    expect(enhanced - base).toBe(100);
    expect(spiralPierce).toBe(normalSpiralPierce);
  });

  it('applies Decrease Agility to monster stats and keeps the source success-rate formula', () => {
    const target = { ...monster, stats: { ...monster.stats, agi: 15, luk: 0 } };
    const effective = effectiveMonsterStatus(target, { SC_DEC_AGI: { expiresAt: 2000, level: 3 } }, 1000);
    expect(effective.monster.stats.agi).toBe(10);
    expect(effective.flee).toBe(target.level + 10);
    expect(classicDecreaseAgilityBaseChance(10, 50, 50)).toBe(80);
  });

  it('uses Hercules STR plus INT chance resistance and LUK duration resistance for Confusion', () => {
    const target = { ...monster, level: 20, stats: { str: 20, agi: 1, vit: 10, int: 20, dex: 1, luk: 5 } };
    expect(classicStatusResistance(target, 'SC_CONFUSION', 50, 17000,
      { level: 20, luk: 5 })).toEqual({ chancePct: 39.5, durationMs: 13550 });
    expect(classicStatusResistance(target, 'SC_CONFUSION', 50, 17000,
      { level: 20, luk: 5, fixedRate: true })).toEqual({ chancePct: 50, durationMs: 13550 });
    expect(classicStatusResistance(target, 'SC_CONFUSION', 50, 17000,
      { level: 20, luk: 5, fixedDuration: true })).toEqual({ chancePct: 39.5, durationMs: 17000 });
    expect(classicStatusResistance({ ...target, boss: true }, 'SC_CONFUSION', 50, 17000,
      { level: 20, luk: 0, fixedRate: true })).toEqual({ chancePct: 0, durationMs: 0 });
  });

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
    expect(classicMagicDamage(attacker, monster, skill('MG_FIREBOLT'), 10, fixedRng)).toBe(990);
    expect(classicMagicDamage(attacker, monster, skill('MG_THUNDERSTORM'), 10, fixedRng)).toBe(790);
    expect(classicMagicDamage(attacker, monster, skill('MG_FIREBALL'), 10, fixedRng)).toBe(169);
    expect(classicMagicDamage({ ...attacker, targetCount: 2 }, monster, skill('MG_NAPALMBEAT'), 10, fixedRng)).toBe(84);
    expect(classicMagicDamage(attacker, monster, skill('MG_SOULSTRIKE'), 10, fixedRng)).toBe(495);
    expect(classicMagicDamage(attacker, { ...monster, element: 'undead' }, skill('MG_SOULSTRIKE'), 10, fixedRng)).toBe(745);
    expect(classicMagicDamage(attacker, monster, skill('WZ_VERMILION'), 10, fixedRng)).toBe(279);
    expect(classicMagicDamage(attacker, monster, skill('WZ_FIREPILLAR'), 10, fixedRng)).toBe(839);
    expect(classicMagicDamage(attacker, monster, skill('HW_NAPALMVULCAN'), 5, fixedRng)).toBe(595);
  });

  it('matches Hercules Turn Undead eligibility, chance boundary, and boss fallback', () => {
    const turnUndead = skill('PR_TURNUNDEAD');
    const target = { ...monster, hp: 10000, element: 'undead', mdef: 0,
      stats: { ...monster.stats, int: 0, vit: 0 } };
    const stats = { ...attacker, baseLevel: 50, int: 80, luk: 40,
      targetHp: 5000, targetIsBoss: false };

    expect(classicMagicDamage(stats, target, turnUndead, 10, () => 0)).toBe(4999);
    expect(classicMagicDamage(stats, target, turnUndead, 10, () => .47)).toBe(229);
    expect(classicMagicDamage({ ...stats, targetIsBoss: true }, target, turnUndead, 10, () => 0)).toBe(229);
    expect(classicMagicDamage(stats, { ...target, element: 'neutral', race: 'undead' },
      turnUndead, 10, () => 0)).toBe(0);
  });

  it('applies idle spell scaling after the complete Hercules result', () => {
    const fireBolt = skill('MG_FIREBOLT');
    expect(classicMagicDamage(attacker, monster,
      { ...fireBolt, idleDamageMultiplierPct: [50] }, 10, fixedRng)).toBe(495);

    for (const source of ['CR_GRANDCROSS', 'HW_GRAVITATION', 'HW_MAGICCRASHER']) {
      const spell = skill(source);
      const normal = classicPhysicalDamage(attacker, monster, spell, spell.maxLevel, fixedRng);
      const scaled = classicPhysicalDamage(attacker, monster,
        { ...spell, idleDamageMultiplierPct: [50] }, spell.maxLevel, fixedRng);
      expect(scaled, source).toBe(Math.trunc(normal / 2));
    }

    const turnUndead = skill('PR_TURNUNDEAD');
    const undeadMonster = { ...monster, element: 'undead' };
    const normalTurnUndead = classicPhysicalDamage(attacker, undeadMonster, turnUndead, 10, fixedRng);
    const scaledTurnUndead = classicPhysicalDamage(attacker, undeadMonster,
      { ...turnUndead, idleDamageMultiplierPct: [50] }, 10, fixedRng);
    expect(scaledTurnUndead).toBe(Math.trunc(normalTurnUndead / 2));
  });

  it('exports a per-level idle multiplier for every supported offensive spell', () => {
    const extraSpellSources = new Set(['PR_TURNUNDEAD', 'CR_GRANDCROSS', 'HW_GRAVITATION', 'HW_MAGICCRASHER']);
    const offensiveSpells = Object.values(catalog.skills).filter(s =>
      ((s.kind === 'magical' && s.damageType === 'magic') || extraSpellSources.has(s.sourceName ?? '')) &&
      s.implementation === 'supported',
    );
    expect(offensiveSpells).toHaveLength(29);
    for (const spell of offensiveSpells)
      expect(spell.idleDamageMultiplierPct, spell.sourceName).toHaveLength(spell.maxLevel);
    expect(skill('WZ_STORMGUST').idleDamageMultiplierPct)
      .toEqual([171, 178, 182, 185, 187, 189, 190, 191, 191, 192]);
    expect(skill('MG_FIREBOLT').idleDamageMultiplierPct).toEqual(Array(10).fill(100));
  });

  it('applies magic defense before positive hit multiplication and rejects missing mechanics', () => {
    const resistant = { ...monster, mdef: 80, stats: { ...monster.stats, int: 5, vit: 10 } };
    expect(classicMagicDamage(attacker, resistant, skill('MG_FIREBOLT'), 3, fixedRng)).toBe(30);
    expect(classicMagicDamage({ ...attacker, elementMultiplier: 0 }, monster, skill('MG_SOULSTRIKE'), 10, fixedRng)).toBe(0);
    expect(classicMagicDamage(attacker, monster, skill('WZ_ICEWALL'), 10, fixedRng)).toBe(0);
    expect(classicPhysicalDamage(attacker, monster, { ...skill('KN_BRANDISHSPEAR'), implementation: 'unsupported' }, 10, fixedRng)).toBe(0);
    expect(classicPhysicalDamage(attacker, monster, skill('AS_POISONREACT'), 10, fixedRng)).toBe(399);
  });

  it('applies weapon hit multiplication before defense and refinement afterward', () => {
    const armored = { ...monster, def: 50, stats: { ...monster.stats, vit: 10 } };
    expect(classicPhysicalDamage(attacker, armored, skill('AC_DOUBLE'), 10, fixedRng)).toBe(180);
    expect(classicPhysicalDamage({ ...attacker, str: 50 }, monster, skill('HT_POWER'), 1, fixedRng)).toBe(899);
    expect(classicPhysicalDamage({ ...attacker, weaponRefineAttack: 20 }, armored, skill('AC_DOUBLE'), 10, fixedRng)).toBe(200);
    expect(classicPhysicalDamage(attacker, armored, skill('MO_INVESTIGATE'), 5, fixedRng)).toBe(570);
    expect(classicPhysicalDamage({ ...attacker, weaponWeight: 100, str: 50 }, monster, skill('LK_SPIRALPIERCE'), 5, fixedRng)).toBe(1525);
    expect(classicPhysicalDamage({ ...attacker, weaponType: 'sword', skillLevelsBySource: { SM_SWORD: 10 } }, armored, undefined, 1, fixedRng)).toBe(80);
  });

  it('translates representable source statuses instead of invented flat bonuses', () => {
    expect(classicSkillEffects(skill('AL_BLESSING'), 10)).toEqual({ str: 10, int: 10, dex: 10 });
    expect(classicSkillEffects(skill('MG_SRECOVERY'), 10)).toEqual({});
    expect(classicSkillEffects(skill('CR_AUTOGUARD'), 10)).toEqual({ autoGuardPct: 30 });
    expect(classicSkillEffects(skill('CR_REFLECTSHIELD'), 10)).toEqual({ reflectPct: 40 });
    expect(classicSkillEffects(skill('TF_MISS'), 10, { jobId: 'assassin' })).toEqual({ flee: 40 });
    expect(classicSkillEffects(skill('BA_POEMBRAGI'), 10, { dex: 50, int: 40, skillLevelsBySource: { BA_MUSICALLESSON: 10 } })).toEqual({ castReductionPct: 55, afterCastReductionPct: 78 });
  });
});
