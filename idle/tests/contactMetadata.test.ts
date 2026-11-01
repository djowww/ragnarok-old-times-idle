import { afterEach, describe, expect, it, vi } from 'vitest';
import { advanceState, createInitialState } from '../engine/index';
import { beginBattle } from '../engine/encounters';
import * as stateTools from '../engine/state';
import { fixture } from './engine-fixture';
afterEach(()=>vi.restoreAllMocks());
describe('authoritative contact event metadata',()=>{
  it('records exact pre-hit health on a lethal overkill before the target is removed',()=>{
    vi.spyOn(stateTools,'random').mockReturnValue(.1);
    const c=fixture(),s=createInitialState(c,0);
    s.status='challenge';s.rotation=[];s.stats.str=99;s.stats.dex=150;
    beginBattle(s,c,1002,0,'mastering');
    Object.assign(s.battle!.enemies![0],{hp:5,position:{x:.48,y:.65},approachFrom:{x:.48,y:.65},arrivedAt:0,enemyNextAttackAt:999999});
    const next=advanceState(s,c,1000);
    const hit=next.events.find(e=>e.kind==='damage'&&e.target==='enemy')!;
    expect(hit.amount).toBeGreaterThan(5);expect(hit.targetHpBefore).toBe(5);
    expect(hit.actionSourcePosition).toEqual({x:.48,y:.65});
    expect(next.events.some(e=>e.kind==='kill'&&e.enemyId===hit.enemyId)).toBe(true);
    expect(JSON.parse(JSON.stringify(hit)).targetHpBefore).toBe(5);
  });
  it('retains the strike origin after the field route has replanned beyond that action',()=>{
    vi.spyOn(stateTools,'random').mockReturnValue(.1);
    const c=fixture(),s=createInitialState(c,0);
    s.status='hunting';s.areaId='prontera';s.rotation=[];s.stats.str=99;s.stats.dex=150;
    // Isolate contact from the field AI; the hero still uses field coordinates.
    beginBattle(s,c,1002,0,'mastering');
    s.fieldHero={areaId:'prontera',from:{x:.6,y:.65},position:{x:.6,y:.65},startedAt:0,arrivedAt:0,routeIndex:0,phase:'fighting'};
    Object.assign(s.battle!.enemies![0],{hp:5,position:{x:.6,y:.65},approachFrom:{x:.6,y:.65},arrivedAt:0,enemyNextAttackAt:999999});
    const next=advanceState(s,c,1000);
    const hit=next.events.find(e=>e.kind==='damage'&&e.target==='enemy')!;
    expect(hit.actionSourcePosition).toEqual({x:.6,y:.65});
    expect(hit.areaId).toBe('prontera');
    next.fieldHero!.position={x:.9,y:.8};
    expect(JSON.parse(JSON.stringify(hit)).actionSourcePosition).toEqual({x:.6,y:.65});
  });
});
