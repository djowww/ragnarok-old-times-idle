import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import catalogJSON from '../content/catalog.json';
import type { Catalog, Item, WeaponType } from '../shared/types';
import { createInitialState } from '../engine';
import { derivedStats } from '../engine/stats';
import { parseConfig } from '../tools/libconfig.mjs';

const catalog = catalogJSON as unknown as Catalog;
const fixtureUrl = new URL('./fixtures/job_db.conf', import.meta.url);
// Complete Hercules 410b9738 db/pre-re/job_db.conf; fixture is byte-identical.
const originalSourceSha256 = '38ca10f6ad491d216b9e7603b7ef11fa549ae1651a1200629089c9a8b357b6cc';
const sourceClassByJob: Record<string, string> = {
  novice:'Novice', high_novice:'Novice_High', swordsman:'Swordsman', high_swordsman:'Swordsman_High',
  mage:'Magician', high_mage:'Magician_High', archer:'Archer', high_archer:'Archer_High',
  acolyte:'Acolyte', high_acolyte:'Acolyte_High', merchant:'Merchant', high_merchant:'Merchant_High',
  thief:'Thief', high_thief:'Thief_High', knight:'Knight', lord_knight:'Lord_Knight',
  crusader:'Crusader', paladin:'Paladin', wizard:'Wizard', high_wizard:'High_Wizard', sage:'Sage',
  professor:'Professor', hunter:'Hunter', sniper:'Sniper', bard:'Bard', clown:'Clown', dancer:'Dancer',
  gypsy:'Gypsy', priest:'Priest', high_priest:'High_Priest', monk:'Monk', champion:'Champion',
  blacksmith:'Blacksmith', whitesmith:'Whitesmith', alchemist:'Alchemist', creator:'Creator',
  assassin:'Assassin', assassin_cross:'Assassin_Cross', rogue:'Rogue', stalker:'Stalker',
};
const nativeKeys = ['Fist','Dagger','Sword','TwoHandSword','Spear','TwoHandSpear','Axe','TwoHandAxe',
  'Mace','TwoHandMace','Rod','Bow','Knuckle','Instrument','Whip','Book','Katar','Revolver','Rifle',
  'GatlingGun','Shotgun','GrenadeLauncher','FuumaShuriken','TwoHandRod'];
const exportKey: Record<string,string> = { Fist:'fist', Dagger:'dagger', Sword:'sword', TwoHandSword:'twoHandSword',
  Spear:'spear', TwoHandSpear:'twoHandSpear', Axe:'axe', TwoHandAxe:'twoHandAxe', Mace:'mace',
  TwoHandMace:'twoHandMace', Rod:'staff', TwoHandRod:'twoHandStaff', Bow:'bow', Knuckle:'knuckle',
  Instrument:'instrument', Whip:'whip', Book:'book', Katar:'katar' };
const weaponAspdKey: Partial<Record<string, WeaponType | 'twoHandSword' | 'twoHandSpear' | 'twoHandAxe' | 'twoHandMace' | 'twoHandStaff'>> = {
  Dagger:'dagger', Sword:'sword', TwoHandSword:'twoHandSword', Spear:'spear', TwoHandSpear:'twoHandSpear',
  Axe:'axe', TwoHandAxe:'twoHandAxe', Mace:'mace', TwoHandMace:'twoHandMace', Rod:'staff',
  TwoHandRod:'twoHandStaff', Bow:'bow', Instrument:'instrument', Whip:'whip', Book:'book', Katar:'katar',
};
const sourceText = readFileSync(fixtureUrl, 'utf8');
const sourceEntries = parseConfig(sourceText) as Record<string, any>; // syntax parser only; inheritance below is independently mirrored.
const fixtureSha256 = '38ca10f6ad491d216b9e7603b7ef11fa549ae1651a1200629089c9a8b357b6cc';
const sourceHash = createHash('sha256').update(sourceText).digest('hex');
function nativeTable(name: string, path: string[] = []): Record<string, number> {
  if (path.includes(name)) throw new Error(`Native job inheritance cycle: ${[...path, name].join(' -> ')}`);
  const row = sourceEntries[name];
  if (!row) throw new Error(`Missing native job ${name}`);
  let table = Object.fromEntries(nativeKeys.map(key => [key, 2000])) as Record<string, number>;
  for (const parent of row.Inherit ?? []) table = { ...nativeTable(parent, [...path, name]) };
  for (const [key, value] of Object.entries(row.BaseASPD ?? {})) {
    if (!nativeKeys.includes(key)) throw new Error(`Unknown native weapon type ${key} on ${name}`);
    table[key] = Number(value);
  }
  return table;
}
function itemFor(job: string, type: WeaponType, twoHanded: boolean): Item | undefined {
  return Object.values(catalog.items).find(item => item.slot === 'weapon' && item.equipSupported !== false &&
    item.weaponType === type && !!item.twoHanded === twoHanded && item.allowedClasses.includes(job));
}
const statPairs = [[0,0],[1,1],[10,10],[50,50],[99,99],[0,99],[99,0]] as const;
const keysForItem: Partial<Record<WeaponType, { one: string; two?: string }>> = {
  dagger:{one:'Dagger'}, sword:{one:'Sword',two:'TwoHandSword'}, spear:{one:'Spear',two:'TwoHandSpear'},
  axe:{one:'Axe',two:'TwoHandAxe'}, mace:{one:'Mace',two:'TwoHandMace'}, staff:{one:'Rod',two:'TwoHandRod'},
  bow:{one:'Bow'}, instrument:{one:'Instrument'}, whip:{one:'Whip'}, book:{one:'Book'}, katar:{one:'Katar'},
};

describe('independent numeric native BaseASPD matrix', () => {
  it('matches all class exports and derived cadence against pinned pre-renewal source', () => {
    expect(sourceHash, 'portable fixture SHA-256; identical to pinned source').toBe(fixtureSha256);
    expect(sourceHash, 'original pinned native job_db.conf SHA-256').toBe(originalSourceSha256);
    expect(Object.keys(sourceClassByJob)).toHaveLength(40);
    expect(Object.keys(catalog.classes)).toHaveLength(40);
    expect(Object.values(sourceClassByJob)).toHaveLength(40);

    const expectedByJob = new Map<string, Record<string, number>>();
    for (const [job, sourceName] of Object.entries(sourceClassByJob)) {
      const expected = nativeTable(sourceName);
      expectedByJob.set(job, expected);
      const exported = catalog.classes[job];
      expect(exported, `catalog class ${job}`).toBeTruthy();
      for (const key of nativeKeys) {
        const value = expected[key];
        if (exportKey[key]) expect(exported.attackMotion?.[exportKey[key]] ?? 2000, `${job}.attackMotion.${exportKey[key]}`).toBe(value);
        const typedKey = weaponAspdKey[key];
        if (typedKey) expect(exported.weaponAspd?.[typedKey] ?? 2000, `${job}.weaponAspd.${typedKey}`).toBe(value);
      }
      expect(exported.weaponAspd?.unarmed ?? 2000, `${job}.weaponAspd.unarmed`).toBe(expected.Fist);
    }

    let numericComparisons = 0; // 182 job/weapon variants (including Fist) x 7 AGI/DEX boundaries x 2 outputs = 2,548 assertions.
    for (const job of Object.keys(sourceClassByJob)) {
      const expected = expectedByJob.get(job)!;
      const isolated = structuredClone(catalog);
      isolated.classes[job].jobBonuses = {};
      const legal = new Map<string, { item: Item; sourceWeapon: string }>();
      for (const type of Object.keys(keysForItem) as WeaponType[]) {
        for (const twoHanded of [false, true]) {
          const item = itemFor(job, type, twoHanded);
          if (!item) continue;
          const mapping = keysForItem[type]!;
          const sourceWeapon = twoHanded && mapping.two ? mapping.two : mapping.one;
          if (!sourceWeapon) throw new Error(`No native slot map for ${job}/${type}/2h`);
          legal.set(`${type}/${twoHanded}`, { item, sourceWeapon });
        }
      }
      const variants: Array<{ item?: Item; sourceWeapon: string }> = [{ sourceWeapon: 'Fist' },
        ...[...legal.values()].map(value => ({ item: value.item, sourceWeapon: value.sourceWeapon }))];
      for (const variant of variants) {
        if (variant.item) isolated.items[variant.item.id].effects = {};
        for (const [agi, dex] of statPairs) {
        const state = createInitialState(isolated, 0, 'native cadence matrix');
        state.job = job; state.family = isolated.classes[job].family; state.baseLevel = 1; state.jobLevel = 1;
        state.gender = isolated.classes[job].gender ?? 'male';
        state.stats = { str: 1, agi, vit: 1, int: 1, dex, luk: 1 };
        state.learnedSkills = {}; state.rotation = []; state.buffs = {}; state.equipment = {}; state.inventory = [];
        if (variant.item) {
          const uid = 'matrix-weapon';
          state.inventory.push({ uid, itemId: variant.item.id, quantity: 1, refine: 0, cards: [], favorite: false, identified: true });
          state.equipment.weapon = uid;
        }
        const d = derivedStats(state, isolated);
        expect(d.attributes, `${job} derived attributes`).toBeDefined();
        const attributes = d.attributes!;
        const base = expected[variant.sourceWeapon];
        const raw = base - Math.trunc(base * (4 * attributes.agi + attributes.dex) / 1000);
        const motion = Math.max(isolated.classes[job].minimumAttackMotionMs ?? 100, Math.max(0, Math.min(2000, raw)));
        expect(d.attackMotionMs, `${job}/${variant.item?.weaponType ?? 'Fist'}/${!!variant.item?.twoHanded}/agi${agi}-dex${dex}`).toBe(motion);
        expect(d.attackIntervalMs).toBe(motion * 2);
        numericComparisons += 2;
      }
      }
    }
    expect(numericComparisons).toBe(2548); // 182 variants x 7 AGI/DEX pairs x motion and interval.

    const capCatalog = structuredClone(catalog);
    capCatalog.classes.dancer.jobBonuses = {};
    const capState = createInitialState(capCatalog, 0, 'native cadence cap boundary');
    capState.job = 'dancer'; capState.family = capCatalog.classes.dancer.family; capState.baseLevel = 1; capState.jobLevel = 1;
    capState.stats = { str: 1, agi: 175, vit: 1, int: 1, dex: 100, luk: 1 };
    capState.learnedSkills = {}; capState.rotation = []; capState.buffs = {}; capState.equipment = {}; capState.inventory = [];
    const capBase = expectedByJob.get('dancer')!.Fist;
    expect(capBase, 'native Dancer Fist base motion').toBe(400);
    const capResult = derivedStats(capState, capCatalog);
    expect(capResult.attributes, 'Dancer high-stat cap probe attributes').toBeDefined();
    expect(capResult.attackMotionMs, 'Fist400 at 4*AGI+DEX above 1000 is clamped to the 100ms minimum').toBe(100);
    expect(capResult.attackIntervalMs).toBe(200); // 2,548 matrix outputs + 2 cap boundary outputs = 2,550.
  });
});
