import {describe,it,expect} from 'vitest';
import {weaponRefineMaterial,weaponRefineThreshold,weaponRefineChancePercent} from '../shared/weaponRefineRules';
const vectors = [
[0,[[750,750,750,750,750,750,750,350,150,-60],[750,750,750,750,750,750,350,150,-50,-60],[750,750,750,750,750,350,250,-50,-50,-60],[750,750,750,750,350,150,150,-50,-50,-160]]],
[49,[[995,995,995,995,995,995,995,595,395,185],[995,995,995,995,995,995,595,395,195,185],[995,995,995,995,995,595,495,195,195,185],[995,995,995,995,595,395,395,195,195,85]]],
[50,[[1000,1000,1000,1000,1000,1000,1000,600,400,190],[1000,1000,1000,1000,1000,1000,600,400,200,190],[1000,1000,1000,1000,1000,600,500,200,200,190],[1000,1000,1000,1000,600,400,400,200,200,90]]],
[70,[[1100,1100,1100,1100,1100,1100,1100,700,500,290],[1100,1100,1100,1100,1100,1100,700,500,300,290],[1100,1100,1100,1100,1100,700,600,300,300,290],[1100,1100,1100,1100,700,500,500,300,300,190]]]
] as const;
describe('native pre-renewal weapon refinement',()=>{
 for(const [job,tables] of vectors) for(let w=0;w<4;w++)
  it('matches literal ten thresholds for weapon '+(w+1)+' Job '+job,()=>{
   expect(Array.from({length:10},(_,r)=>weaponRefineThreshold(w+1,r,job))).toEqual(tables[w]);
  });
 it('uses Phracon, Emveretarcon and Oridecon without enriched ore',()=>expect([1,2,3,4].map(weaponRefineMaterial)).toEqual([1010,1011,984,984]));
 it('clamps only the display percentage and retains half-percent accuracy',()=>{
  expect(weaponRefineChancePercent(1,0,49)).toBe(99.5);
  expect(weaponRefineChancePercent(1,0,70)).toBe(100);
  expect(weaponRefineChancePercent(4,9,0)).toBe(0);
  expect(weaponRefineThreshold(4,9,0)).toBe(-160);
 });
 it.each([0,5,1.5,NaN,Infinity])('rejects invalid weapon level %s',w=>expect(()=>weaponRefineMaterial(w)).toThrow());
 it.each([-1,10,0.5,NaN,Infinity])('rejects invalid current refinement %s',r=>expect(()=>weaponRefineThreshold(1,r,50)).toThrow());
 it.each([-1,1.5,NaN,Infinity])('rejects invalid Job oracle %s',j=>expect(()=>weaponRefineThreshold(1,0,j)).toThrow());
});
