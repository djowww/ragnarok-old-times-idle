import { castSetup } from './cast-control-fixture';
import raw from '../content/catalog.json';
import type { Catalog } from '../shared/types';
export function priestSetup(monsterId=1175) {
  const {s,c,e}=castSetup(),real=raw as unknown as Catalog;
  c.classes.priest={...structuredClone(real.classes.priest),hp:Array(99).fill(1000),sp:Array(99).fill(100),jobBonuses:{}};
  for(const id of c.classes.priest.skills)c.skills[id]=structuredClone(real.skills[id]);
  for(const id of ['pr_strecovery','pr_lexdivina'])c.skills[id].implementation='supported';
  s.job='priest';s.baseLevel=15;s.learnedSkills={pr_strecovery:1,pr_lexdivina:1,al_ruwach:1};
  if(monsterId!==1175)c.monsters[monsterId]={...structuredClone(real.monsters[monsterId]),hp:1234,attack:[0,0],drops:[],baseExp:0,jobExp:0};
  e.monsterId=monsterId;s.battle!.monsterId=monsterId;
  return {s,c,e};
}
