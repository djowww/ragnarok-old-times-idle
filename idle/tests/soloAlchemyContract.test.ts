import { describe, expect, it } from 'vitest';
import rawCatalog from '../content/catalog.json';
import type { Catalog, GameState, GameCommand } from '../shared/types';
import { createInitialState, applyCommand, advanceState } from '../engine';
import { derivedStats } from '../engine/stats';
import { parseCommandRequest } from '../server/validation';
const catalog = rawCatalog as unknown as Catalog;
const skillBySource = (source: string, c = catalog) => Object.values(c.skills).find(s => s.sourceName === source)!;
const pitcher = skillBySource('AM_POTIONPITCHER'), meltdown = skillBySource('WS_MELTDOWN');
function fixture(job = 'alchemist', c = catalog) {
 const s = createInitialState(c, 1000, 'Alchemy QA');
 s.job = job; s.family = c.classes[job].family; s.baseLevel = 99; s.jobLevel = 1;
 s.stats.vit = 10; s.stats.int = 20; s.equipment = {}; s.rotation = [];
 s.learnedSkills = { [pitcher.id]: 5, [meltdown.id]: 10,
  [skillBySource('AM_PHARMACY').id]: 3, [skillBySource('AM_LEARNINGPOTION').id]: 10 };
 const d = derivedStats(s,c); s.hp = 1; s.sp = d.maxSp;
 return s;
}
const preference = (id: string, level: number | null) => ({type:'setSkillUseLevel',skillId:id,level} as unknown as GameCommand);

describe('solo alchemy complete contract', () => {
 it('exports both native skills as supported with their real timing and ingredients', () => {
  expect(pitcher).toMatchObject({implementation:'supported',manualUse:'activate',spCost:[1,1,1,1,1],castTimeMs:[0,0,0,0,0],afterCastDelayMs:[500,500,500,500,500]});
  expect(pitcher.itemCostByLevel).toEqual([501,502,503,504,505].map(itemId=>[{itemId,quantity:1}]));
  expect(meltdown).toMatchObject({implementation:'supported',manualUse:'activate'});
  expect(meltdown.statusDurationMs).toEqual(Array.from({length:10},(_,i)=>15000+5000*i));
 });
 it('accepts a strict persisted level command without changing learning or resources', () => {
  const c=structuredClone(catalog); c.skills[pitcher.id].implementation='supported';
  const s=fixture('alchemist',c), before=structuredClone(s);
  const parsed=parseCommandRequest({requestId:'alchemy-level-001',command:preference(pitcher.id,1)});
  expect(parsed.command).toEqual(preference(pitcher.id,1));
  const chosen=applyCommand(s,c,parsed.command,1000) as GameState & {skillUseLevels?:Record<string,number>};
  expect(chosen.skillUseLevels).toEqual({[pitcher.id]:1});expect(chosen.learnedSkills).toEqual(before.learnedSkills);
  expect(chosen.inventory).toEqual(before.inventory);expect(chosen.hp).toBe(before.hp);expect(chosen.sp).toBe(before.sp);
  const reset=applyCommand(chosen,c,preference(pitcher.id,null),1000) as typeof chosen;
  expect(reset.skillUseLevels?.[pitcher.id]).toBeUndefined();
 });
 it.each([0,-1,1.5,6,NaN,Infinity])('rejects unavailable or malformed pitcher level %s without mutation', level=>{
  const c=structuredClone(catalog);c.skills[pitcher.id].implementation='supported';const s=fixture('alchemist',c),before=structuredClone(s);
  expect(()=>applyCommand(s,c,preference(pitcher.id,level),1000)).toThrow();expect(s).toEqual(before);
 });
 it('uses Red Potion at level1 while keeping the full learned level5 recovery bonus',()=>{
  const s=fixture() as GameState & {skillUseLevels?:Record<string,number>};s.skillUseLevels={[pitcher.id]:1};
  const beforeRed=s.inventory.filter(e=>e.itemId===501).reduce((a,e)=>a+e.quantity,0),beforeSP=s.sp;
  const d=derivedStats(s,catalog), recovery=Math.trunc(Math.trunc(55*200/100)*(100+2*d.attributes!.vit)/100);
  const next=applyCommand(s,catalog,{type:'useSkill',skillId:pitcher.id},1000);
  expect(next.hp).toBe(1+recovery);expect(next.sp).toBe(beforeSP-1);
  expect(next.inventory.filter(e=>e.itemId===501).reduce((a,e)=>a+e.quantity,0)).toBe(beforeRed-1);
  expect(next.supportCast).toBeUndefined();expect(next.playerCanActAt).toBe(1500);
  expect(next.events.some(e=>e.kind==='heal'&&e.skillId===pitcher.id&&e.targetActorId===s.id&&e.amount===recovery)).toBe(true);
 });
 it('self-casts Meltdown with captured level1 and resolves its own buff and payment',()=>{
  const s=fixture('whitesmith') as GameState & {skillUseLevels?:Record<string,number>};s.hp=derivedStats(s,catalog).maxHp;s.skillUseLevels={[meltdown.id]:1};
  const before=s.sp;const casting=applyCommand(s,catalog,{type:'useSkill',skillId:meltdown.id},1000);
  expect(casting.supportCast?.level).toBe(1);expect(casting.sp).toBe(before);
  const end=casting.supportCast!.endsAt;const done=advanceState(casting,catalog,Math.ceil(end / 250) * 250);
  expect(done.sp).toBe(before-50);expect(done.buffs[meltdown.id]?.expiresAt).toBe(end+15000);
  expect(done.combatEffects?.buffLevels?.[meltdown.id]).toBe(1);expect(done.supportCast).toBeUndefined();
 });
});
