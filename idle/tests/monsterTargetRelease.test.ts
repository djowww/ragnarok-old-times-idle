import {describe,it,expect,vi,afterEach} from 'vitest';
import {priestSetup} from './priest-control-fixture';
import {resolvePriestSoloControl,releaseMonsterAttackTarget,reacquireReleasedMonster,monsterAttackTarget,rememberMonsterAttacker,priestControlTarget} from '../engine/priestSoloControl';
import {takeMonsterStatusCast} from '../engine/monsterStatusSkills';
import {liveNpcCast,cancelActorCast} from '../engine/castControl';
import {advanceState,applyCommand} from '../engine';
import {BATTLE_HERO} from '../shared/battleSpatial';
import * as rng from '../engine/state';
afterEach(()=>vi.restoreAllMocks());
describe('Released attack target is independent of skill timer',()=>{
 it.each(['failure','boss','overlap'])('Recovery %s rolls then unlocks without changing pending cast or cooldown',mode=>{
  const {s,c,e}=priestSetup(1015),random=vi.spyOn(rng,'random').mockReturnValue(mode==='failure'?.999:.02);
  if(mode==='boss')c.monsters[1015].boss=true;
  if(mode==='overlap')e.statuses={SC_BLIND:{expiresAt:3000,level:1}};
  expect(resolvePriestSoloControl(s,c,c.skills.pr_strecovery,1,e,100)).toBe(true);
  expect(monsterAttackTarget(s,e)).toBeUndefined();expect(random).toHaveBeenCalledTimes(2);
  expect(e.npcCombat!.cast?.actionId).toBe('tarou-poison');expect(e.npcCombat!.readyAt[176]).toBe(7000);
  expect(e.statuses?.SC_BLIND?.expiresAt).toBe(mode==='overlap'?3000:undefined);
 });
 it('retained NPC timer stays selectable for a real Spell Breaker cancellation',()=>{
  const {s,c,e}=priestSetup();releaseMonsterAttackTarget(s,c,e,100);
  expect(liveNpcCast(s,e,200)?.actionId).toBe('tarou-poison');cancelActorCast(s,c,{kind:'monster',actorId:e.id},200,'spellBreaker');
  expect(e.npcCombat!.cast).toBeUndefined();expect(e.npcCombat!.readyAt[176]).toBe(7000);
 });
 it('does not reacquire during pending cast and allows vision reacquire before wander',()=>{
  const {s,c,e}=priestSetup(1015);c.monsters[1015].aggressive=true;vi.spyOn(rng,'random').mockReturnValue(.5);
  releaseMonsterAttackTarget(s,c,e,0);e.statuses={SC_BLIND:{expiresAt:9000,level:1}};
  reacquireReleasedMonster(s,c,e,100);expect(monsterAttackTarget(s,e)).toBeUndefined();expect(e.npcCombat!.nextTargetCheckAt).toBe(800);
  delete e.npcCombat!.cast;reacquireReleasedMonster(s,c,e,800);expect(monsterAttackTarget(s,e)).toBe(s.id);
  expect(e.npcCombat!.nextWanderAt).toBe(4500);expect(e.enemyNextAttackAt).toBe(999999);
 });
 it.each([3,4])('Blind acquisition uses square vision three cells at distance %s',distance=>{
  const {s,c,e}=priestSetup(1015);delete e.npcCombat!.cast;c.monsters[1015].aggressive=true;
  e.position=e.approachFrom={x:BATTLE_HERO.x+distance/12,y:BATTLE_HERO.y};e.arrivedAt=0;
  releaseMonsterAttackTarget(s,c,e,0);e.statuses={SC_BLIND:{expiresAt:1000,level:1}};reacquireReleasedMonster(s,c,e,100);
  expect(monsterAttackTarget(s,e)).toBe(distance===3?s.id:undefined);
 });
 it('control immobilization prevents acquisition and clears pending attacker at decision',()=>{
  const {s,c,e}=priestSetup();delete e.npcCombat!.cast;c.monsters[1175].aggressive=true;releaseMonsterAttackTarget(s,c,e,0);
  e.statuses={SC_STUN:{expiresAt:1000,level:1}};rememberMonsterAttacker(s,e,10,50);reacquireReleasedMonster(s,c,e,100);
  expect(monsterAttackTarget(s,e)).toBeUndefined();expect(e.npcCombat!.pendingAttackerActorId).toBeUndefined();
 });
 it('recent real damage memory survives release then expires at its first AI decision',()=>{
  const {s,c,e}=priestSetup();delete e.npcCombat!.cast;c.monsters[1175].aggressive=false;
  rememberMonsterAttacker(s,e,10,0);releaseMonsterAttackTarget(s,c,e,20);reacquireReleasedMonster(s,c,e,120);
  expect(monsterAttackTarget(s,e)).toBe(s.id);expect(e.npcCombat!.pendingAttackerActorId).toBeUndefined();
  releaseMonsterAttackTarget(s,c,e,200);reacquireReleasedMonster(s,c,e,300);expect(monsterAttackTarget(s,e)).toBeUndefined();
 });
 it('retains older unconsumed damage memory while an NPC cast blocks AI thinking',()=>{
  const {s,c,e}=priestSetup();c.monsters[1175].aggressive=false;
  rememberMonsterAttacker(s,e,10,100);releaseMonsterAttackTarget(s,c,e,400);
  expect(e.npcCombat!.pendingAttackerActorId).toBe(s.id);
  reacquireReleasedMonster(s,c,e,500);expect(monsterAttackTarget(s,e)).toBeUndefined();
  expect(e.npcCombat!.pendingAttackerActorId).toBe(s.id);
  delete e.npcCombat!.cast;reacquireReleasedMonster(s,c,e,800);
  expect(monsterAttackTarget(s,e)).toBe(s.id);expect(e.npcCombat!.pendingAttackerActorId).toBeUndefined();
 });
 it('non-undead Recovery cleans source controls and retains unrelated diseases and HP',()=>{
  const {s,c,e}=priestSetup();delete e.npcCombat!.cast;
  e.statuses=Object.fromEntries(['SC_STUN','SC_SLEEP','SC_WHITEIMPRISON','SC_NETHERWORLD','SC_POISON','SC_BLIND','SC_SILENCE'].map(x=>[x,{expiresAt:1000,level:1}]));
  const random=vi.spyOn(rng,'random').mockReturnValue(.5);
  resolvePriestSoloControl(s,c,c.skills.pr_strecovery,1,e,0);expect(Object.keys(e.statuses)).toEqual(['SC_POISON','SC_BLIND','SC_SILENCE']);
  expect(random).toHaveBeenCalledTimes(1);expect(e.hp).toBe(1234);
 });
 it('Lex toggles an existing Silence off without resistance RNG and AFK avoids it',()=>{
  const {s,c,e}=priestSetup();e.statuses={SC_SILENCE:{expiresAt:1000,level:1}};const random=vi.spyOn(rng,'random');
  expect(priestControlTarget(s,c,'PR_LEXDIVINA',0)).toBeUndefined();expect(resolvePriestSoloControl(s,c,c.skills.pr_lexdivina,1,e,0)).toBe(true);
  expect(e.statuses.SC_SILENCE).toBeUndefined();expect(random).not.toHaveBeenCalled();expect(e.npcCombat!.cast?.actionId).toBe('tarou-poison');
 });
 it('handler immune Recovery does not consume RNG or release target',()=>{
  const {s,c,e}=priestSetup(1015);e.statuses={SC_HERMODE:{expiresAt:1000,level:1}};const random=vi.spyOn(rng,'random');
  expect(resolvePriestSoloControl(s,c,c.skills.pr_strecovery,1,e,0)).toBe(false);expect(random).not.toHaveBeenCalled();expect(monsterAttackTarget(s,e)).toBe(s.id);
 });
 it('released position is interpolated and home/instance state remains stable',()=>{
  const {s,c,e}=priestSetup();e.startedAt=0;e.arrivedAt=1000;e.approachFrom={x:.5,y:.5};e.position={x:.7,y:.5};e.stolenItem=true;e.soulChangeUsed=true;
  const home=structuredClone(e.homePosition);releaseMonsterAttackTarget(s,c,e,500);
  expect(e.position).toEqual({x:.6,y:.5});expect(e.approachFrom).toEqual(e.position);expect(e.homePosition).toEqual(home);expect(e.stolenItem&&e.soulChangeUsed).toBe(true);
 });
});
