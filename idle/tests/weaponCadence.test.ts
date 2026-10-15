import { describe, expect, it } from 'vitest';
import catalogJSON from '../content/catalog.json';
import type { Catalog, WeaponType } from '../shared/types';
import { createInitialState } from '../engine/index';
import { derivedStats } from '../engine/stats';
import { resolveInheritance } from '../tools/libconfig.mjs';
const catalog = catalogJSON as unknown as Catalog;

function equipped(job: string, type: WeaponType | null, twoHanded = false, c = catalog) {
  const s = createInitialState(c, 1000, 'Cadence QA');
  s.job = job; s.family = c.classes[job].family; s.baseLevel = 99; s.jobLevel = 1;
  s.gender = c.classes[job].gender ?? 'male'; s.stats.agi = 10; s.stats.dex = 10;
  s.learnedSkills = {}; s.rotation = []; s.equipment = {};
  if (type) {
    const item = Object.values(c.items).find(item => item.slot === 'weapon' && item.weaponType === type &&
      !!item.twoHanded === twoHanded && item.allowedClasses.includes(job) && !Object.keys(item.effects).length);
    if (!item) throw Error(`No legal ${job}/${type}/${twoHanded} fixture`);
    s.inventory.push({ uid: 'cadence-weapon', itemId: item.id, quantity: 1, refine: 0, cards: [], favorite: false, identified: true });
    s.equipment.weapon = 'cadence-weapon';
  }
  return s;
}
// Independent numeric values from pinned job_db.conf; C integer reduction at status.c3769.
const cases: [string, WeaponType | null, boolean, number][] = [
  ['swordsman','sword',false,550], ['swordsman','sword',true,600],
  ['high_swordsman','sword',true,600], ['knight','sword',false,500], ['knight','sword',true,550],
  ['alchemist','axe',false,675], ['alchemist','axe',true,700],
  ['bard','instrument',false,575], ['clown','instrument',false,575],
  ['dancer','bow',true,650], ['gypsy','bow',true,650],
  ['dancer','dagger',false,550], ['gypsy','dagger',false,550],
  ['dancer','whip',false,575], ['gypsy','whip',false,575],
  ['dancer',null,false,400], ['gypsy',null,false,400],
];
describe('source weapon subtype cadence', () => {
  it.each(cases)('%s %s twoHanded=%s uses native base %s', (job,type,twoHanded,base) => {
    const s = equipped(job,type,twoHanded), d = derivedStats(s,catalog);
    const motion = Math.max(catalog.classes[job].minimumAttackMotionMs ?? 100,
      Math.min(2000,base - Math.trunc(base * (4*d.attributes!.agi+d.attributes!.dex)/1000)));
    expect(d.attackMotionMs).toBe(motion); expect(d.attackIntervalMs).toBe(motion*2);
  });
  it('uses native default2000 for an equipped missing subtype instead of Fist', () => {
    const c = structuredClone(catalog); delete c.classes.swordsman.weaponAspd!.sword;
    const s = equipped('swordsman','sword',false,c), d = derivedStats(s,c);
    expect(d.attackMotionMs).toBe(2000-Math.trunc(2000*(4*d.attributes!.agi+d.attributes!.dex)/1000));
  });
  it('uses native default2000 when no Fist table entry exists', () => {
    const c = structuredClone(catalog); delete c.classes.swordsman.weaponAspd!.unarmed;
    const d = derivedStats(equipped('swordsman',null,false,c),c);
    expect(d.attackMotionMs).toBe(2000-Math.trunc(2000*(4*d.attributes!.agi+d.attributes!.dex)/1000));
  });
  it('does not treat an equipped item with unknown subtype as bare hands', () => {
    const c = structuredClone(catalog), s = equipped('swordsman','sword',false,c);
    const entry = s.inventory.find(e => e.uid === s.equipment.weapon)!;
    delete c.items[entry.itemId].weaponType;
    const d = derivedStats(s,c);
    expect(d.attackMotionMs).toBe(2000-Math.trunc(2000*(4*d.attributes!.agi+d.attributes!.dex)/1000));
  });
  it('uses Fist when the equipped weapon is broken', () => {
    const s = equipped('swordsman','sword',true); s.inventory.find(e=>e.uid===s.equipment.weapon)!.broken=true;
    const d=derivedStats(s,catalog);
    expect(d.attackMotionMs).toBe(400-Math.trunc(400*(4*d.attributes!.agi+d.attributes!.dex)/1000));
  });
  it('does not add the Renewal shield surcharge in pre-renewal', () => {
    const c=structuredClone(catalog); c.classes.swordsman.weaponAspd!.shield=200;
    const s=equipped('swordsman','sword',false,c), before=derivedStats(s,c).attackMotionMs;
    const shield=Object.values(c.items).find(i=>i.slot==='shield' && i.allowedClasses.includes(s.job) && !Object.keys(i.effects).length)!;
    s.inventory.push({uid:'cadence-shield',itemId:shield.id,quantity:1,refine:0,cards:[],favorite:false,identified:true});s.equipment.shield='cadence-shield';
    expect(derivedStats(s,c).attackMotionMs).toBe(before);
  });
});

describe('native BaseASPD inheritance', () => {
  it('overrides own weapon entries and keeps other entries from the final parent', () => {
    const entries={Bard:{BaseASPD:{Fist:400,Dagger:550,Bow:650,Instrument:575},HPTable:[10]},Dancer:{Inherit:['Bard'],BaseASPD:{Whip:575,Instrument:2000}},Gypsy:{Inherit:['Dancer']}};
    expect(resolveInheritance(entries,'Dancer').BaseASPD).toEqual({Fist:400,Dagger:550,Bow:650,Instrument:2000,Whip:575});
    expect(resolveInheritance(entries,'Gypsy').BaseASPD).toEqual(resolveInheritance(entries,'Dancer').BaseASPD);
    expect(resolveInheritance(entries,'Gypsy').HPTable).toEqual([10]);
  });
  it('copies the last parent table, not a union of earlier parents', () => {
    const entries={First:{BaseASPD:{Fist:400,Dagger:550}},Last:{BaseASPD:{Bow:650}},Child:{Inherit:['First','Last'],BaseASPD:{Whip:575}}};
    expect(resolveInheritance(entries,'Child').BaseASPD).toEqual({Bow:650,Whip:575});
  });
  it('uses defaults when the final parent has no weapon overrides', () => {
    const entries={First:{BaseASPD:{Fist:400}},Last:{HPTable:[1]},Child:{Inherit:['First','Last']}};
    expect(resolveInheritance(entries,'Child').BaseASPD).toBeUndefined();
  });
  it('does not mutate source tables while resolving overrides', () => {
    const entries={Bard:{BaseASPD:{Fist:400}},Dancer:{Inherit:['Bard'],BaseASPD:{Whip:575}}};
    const resolved=resolveInheritance(entries,'Dancer'); resolved.BaseASPD.Fist=999;
    expect(entries.Bard.BaseASPD).toEqual({Fist:400});expect(entries.Dancer.BaseASPD).toEqual({Whip:575});
  });
  it('retains cycle and unknown parent validation', () => {
    expect(()=>resolveInheritance({A:{Inherit:['B']},B:{Inherit:['A']}},'A')).toThrow(/cycle/i);
    expect(()=>resolveInheritance({A:{Inherit:['missing']}},'A')).toThrow(/Unknown/i);
  });
});
