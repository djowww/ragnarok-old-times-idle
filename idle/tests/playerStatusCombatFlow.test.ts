import { describe,it,expect,vi,afterEach } from 'vitest';
import { createInitialState,advanceState,applyCommand } from '../engine';
import { beginBattle } from '../engine/encounters';
import { fixture } from './engine-fixture';
import { BATTLE_HERO } from '../shared/battleSpatial';
import * as tools from '../engine/state';
import { applyPlayerDisease } from '../engine/playerStatuses';
import { presentLatestActorActions, presentedActorActions } from '../web/assets/combatPresentation';
import { isNpcStatusAction } from '../shared/playerStatusView';
export function statusSetup(blind=false) {
  const c=fixture();c.monsters[1002].npcStatusSkills=[{skillId:blind?177:176,sourceName:blind?'NPC_BLINDATTACK':'NPC_POISON',level:blind?3:1,rate:500,castTimeMs:blind?0:800,delayMs:5000,range:9,cancelable:blind,status:blind?'SC_BLIND':'SC_POISON',durationMs:blind?30000:60000}];
  Object.assign(c.monsters[1002],{hp:10000,attack:[20,20],attackDelay:1000,drops:[],baseExp:0,jobExp:0,stats:{str:0,agi:0,vit:0,int:0,dex:100,luk:0}});
  c.classes.novice.hp=Array(99).fill(1000);
  const s=createInitialState(c,0);s.stats={str:0,agi:0,vit:0,int:0,dex:0,luk:0};s.hp=1000;s.status='challenge';s.autoPotion={hpThreshold:0,spThreshold:0};
  beginBattle(s,c,1002,0,'mastering');
  const e=s.battle!.enemies![0],position={x:BATTLE_HERO.x+1/12,y:BATTLE_HERO.y};
  Object.assign(e,{position,approachFrom:{...position},homePosition:{...position},startedAt:0,arrivedAt:0,enemyNextAttackAt:1000,hostile:true});
  s.battle!.playerNextAttackAt=s.battle!.playerNextSkillAt=s.battle!.playerActionReadyAt=999999;
  return {s,c};
}
afterEach(()=>vi.restoreAllMocks());
describe('natural NPC to player disease shared timeline',()=>{
  it('first normal attack, subsequent Poison cast substitutes attack, resolves same physical flow and captured ticks',()=>{
    const {s,c}=statusSetup();vi.spyOn(tools,'random').mockReturnValue(.02);
    const first=advanceState(s,c,1000);expect(first.playerStatuses?.SC_POISON).toBeUndefined();expect(first.events.filter(e=>e.kind==='damage'&&e.target==='player')).toHaveLength(1);
    const cast=advanceState(first,c,2000);expect(cast.battle!.enemies![0].npcCombat?.cast?.endsAt).toBe(2800);expect(cast.hp).toBe(first.hp);
    const hit=advanceState(cast,c,3000);expect(hit.playerStatuses!.SC_POISON).toMatchObject({startsAt:2800,sourceSkillId:176,sourceActorId:hit.battle!.enemies![0].id,nextTickAt:3800});
    expect(hit.events.filter(e=>e.kind==='damage'&&e.target==='player')).toHaveLength(2);
    const ticks=advanceState(hit,c,4000);expect(ticks.events.some(e=>e.at===3800&&e.statusName==='SC_POISON'&&e.actorAction==='none')).toBe(true);
  });
  it('Nightmare instant Blind uses source actor and misses never apply a disease',()=>{
    const {s,c}=statusSetup(true);vi.spyOn(tools,'random').mockReturnValue(.02);
    const end=advanceState(s,c,2000);expect(end.playerStatuses?.SC_BLIND?.startsAt).toBe(2000);
    expect(end.events.find(e=>e.kind==='skill'&&e.skillId==='npc_blindattack')).toMatchObject({sourceActorId:end.battle!.enemies![0].id,actorAction:'attack',targetActorId:s.id});
  });
  it('save continuation equals one advance and disease survives emitter death/battle removal',()=>{
    const {s,c}=statusSetup();vi.spyOn(tools,'random').mockReturnValue(.02);
    const once=advanceState(s,c,5000),part=advanceState(JSON.parse(JSON.stringify(advanceState(s,c,2000))),c,5000);
    expect(part).toEqual(once);
    once.battle=null;once.status='resting';once.restMode='field';once.areaId='prontera';
    const after=advanceState(once,c,6000);expect(after.playerStatuses?.SC_POISON).toBeDefined();expect(after.hp).toBeLessThan(once.hp);
  });
  it('no-battle field rest splits exact poison ending before allowing accumulated regen',()=>{
    const {s,c}=statusSetup();s.battle=null;s.status='resting';s.restMode='field';s.areaId='prontera';s.hp=800;
    vi.spyOn(tools,'random').mockReturnValue(.02);applyPlayerDisease(s,c,'SC_POISON',1,2500,10000,1,0,{});
    const end=advanceState(s,c,8000);expect(end.playerStatuses?.SC_POISON).toBeUndefined();expect(end.hp).toBe(800-18+12);
  });
  it('town full-resource fast-forward must still expire a real Blind status',()=>{
    const {s,c}=statusSetup();s.battle=null;s.status='town';s.hp=1000;s.sp=50;vi.spyOn(tools,'random').mockReturnValue(.02);
    applyPlayerDisease(s,c,'SC_BLIND',1,1200,10000,1,0,{});
    const end=advanceState(s,c,5000);expect(end.playerStatuses?.SC_BLIND).toBeUndefined();expect(end.events.filter(e=>e.kind==='status-end')).toHaveLength(1);
  });
  it('future DPoison lethal timer settles one defeat and clears diseases/Slow Poison without a living emitter',()=>{
    const {s,c}=statusSetup();vi.spyOn(tools,'random').mockReturnValue(.02);
    applyPlayerDisease(s,c,'SC_DPOISON',1,60000,10000,1,0,{});s.hp=5;s.battle!.enemies=[];
    const end=advanceState(s,c,1000);expect(end.hp).toBe(0);expect(end.totals.deaths).toBe(1);expect(end.status).toBe('resting');expect(Object.keys(end.playerStatuses??{})).toHaveLength(0);
    expect(end.events.filter(e=>e.kind==='death')).toHaveLength(1);
  });
  it('saved pause shifts player ticks and separate battle/population NPC cast copies once',()=>{
    const {s,c}=statusSetup();vi.spyOn(tools,'random').mockReturnValue(.02);const start=advanceState(s,c,2000);
    applyPlayerDisease(start,c,'SC_POISON',1,30000,10000,1,2000,{});
    start.status='paused';start.pausedStatus='challenge';start.pausedAt=2000;
    start.fieldPopulation={areaId:'prontera',generation:1,enemies:[structuredClone(start.battle!.enemies![0])],respawns:[]};
    const end=applyCommand(JSON.parse(JSON.stringify(start)),c,{type:'setPotions',hpThreshold:0,spThreshold:0},10000);
    expect(end.playerStatuses?.SC_POISON).toMatchObject({startsAt:10000,nextTickAt:11000,expiresAt:40000});
    expect(end.battle!.enemies![0].npcCombat).toMatchObject({readyAt:{176:15000},cast:{startedAt:10000,endsAt:10800}});
    expect(end.fieldPopulation!.enemies![0].npcCombat).toEqual(end.battle!.enemies![0].npcCombat);
  });
  it('NPC cast keeps the same actor action identity from start to physical hit',()=>{
    const {s,c}=statusSetup();vi.spyOn(tools,'random').mockReturnValue(.02);const end=advanceState(s,c,3000);
    const cast=end.events.find(e=>e.kind==='cast'&&e.skillId==='npc_poison')!,hit=end.events.find(e=>e.kind==='damage'&&e.at===2800&&e.target==='player')!;
    expect(cast).toMatchObject({actorAction:'none',actionMotionMs:0});
    expect(hit).toMatchObject({skillId:'npc_poison',skillLevel:1,sourceActorId:cast.sourceActorId,actionId:cast.actionId,actionStartedAt:cast.at+800,actorAction:'attack',actionMotionMs:500});
  });
  it('future DPoison can settle defeat during field rest, with one death event',()=>{
    const {s,c}=statusSetup();s.battle=null;s.status='resting';s.restMode='field';s.areaId='prontera';vi.spyOn(tools,'random').mockReturnValue(.02);applyPlayerDisease(s,c,'SC_DPOISON',1,60000,10000,1,0,{});s.hp=5;
    const end=advanceState(s,c,1000);expect(end.hp).toBe(0);expect(end.restMode).toBe('recovery');expect(end.totals.deaths).toBe(1);expect(Object.keys(end.playerStatuses??{})).toHaveLength(0);
  });
  it.each([false,true])('incoming damaging player hit respects NPC cancelable %s while preserving start cooldown',cancelable=>{
    const {s,c}=statusSetup();c.monsters[1002].npcStatusSkills![0].cancelable=cancelable;vi.spyOn(tools,'random').mockReturnValue(.02);
    const start=advanceState(s,c,2000);start.battle!.playerNextAttackAt=start.battle!.playerActionReadyAt=2500;
    const end=advanceState(start,c,3000);expect(!!end.playerStatuses?.SC_POISON).toBe(!cancelable);expect(end.battle!.enemies![0].npcCombat?.readyAt[176]).toBe(7000);
  });
  it('Kyrie absorbs HP damage but retains source ATK_DEF disease eligibility',()=>{
    const {s,c}=statusSetup();s.combatEffects={kyrieHp:5000,kyrieHits:100};vi.spyOn(tools,'random').mockReturnValue(.02);
    const end=advanceState(s,c,3000);expect(end.hp).toBe(1000);expect(end.playerStatuses?.SC_POISON).toBeDefined();
  });
  it('a real block prevents NPC additional effects while preserving the physical attack flow',()=>{
    const {s,c}=statusSetup();c.items[2301].effects.blockPct=100;vi.spyOn(tools,'random').mockReturnValue(.02);
    const end=advanceState(s,c,3000);expect(end.hp).toBe(1000);expect(end.playerStatuses?.SC_POISON).toBeUndefined();
  });
  it.each([false,true])('actual NPC events feed one source body action into presentation pipeline, instant=%s',blind=>{
    const {s,c}=statusSetup(blind);vi.spyOn(tools,'random').mockReturnValue(.02);const end=advanceState(s,c,3000);
    const events=end.events.filter(event=>isNpcStatusAction(event,s.id));
    const cues=events.map(event=>({id:event.id,actionId:event.actionId!,actionAt:event.actionStartedAt??event.at,sourceActorId:event.sourceActorId!,actorAction:event.actorAction!,start:event.actionStartedAt??event.at,effectStart:event.at,impact:event.at,actionDuration:event.actionMotionMs??0}));
    presentLatestActorActions(cues,new Map(),3000);
    expect(presentedActorActions(cues,end.battle!.enemies![0].id)).toHaveLength(1);expect(presentedActorActions(cues,s.id)).toHaveLength(0);
    const action=presentedActorActions(cues,end.battle!.enemies![0].id)[0];expect(action.actionAt).toBe(blind?2000:2800);expect(action.actorAction).toBe('attack');expect(action.actionDuration).toBe(500);
  });
  it('actual12h cap retains a pending NPC cast and resumes its remaining800ms once',()=>{
    const {s,c}=statusSetup();s.lastSeenAt=2000-12*3600000;vi.spyOn(tools,'random').mockReturnValue(.02);
    const capped=advanceState(s,c,10000);expect(capped.status).toBe('paused');expect(capped.battle!.enemies![0].npcCombat?.cast?.endsAt).toBe(2800);
    const resumed=applyCommand(JSON.parse(JSON.stringify(capped)),c,{type:'setPotions',hpThreshold:0,spThreshold:0},20000);
    expect(resumed.battle!.enemies![0].npcCombat?.cast).toMatchObject({startedAt:20000,endsAt:20800});expect(resumed.playerStatuses?.SC_POISON).toBeUndefined();
  });
  it('legacy JSON without disease/NPC optional fields never invents status, skills, costs or rewards',()=>{
    const {s,c}=statusSetup();delete c.monsters[1002].npcStatusSkills;vi.spyOn(tools,'random').mockReturnValue(.02);
    const end=advanceState(JSON.parse(JSON.stringify(s)),c,3000);expect(end.playerStatuses).toBeUndefined();expect(end.battle!.enemies![0].npcCombat).toBeUndefined();expect(end.sp).toBe(s.sp);expect(end.learnedSkills).toEqual(s.learnedSkills);expect(end.totals.kills).toBe(0);
  });
  function pendingPoison(distance=1) {
    const {s,c}=statusSetup(),enemy=s.battle!.enemies![0];
    const position={x:BATTLE_HERO.x+distance/12,y:BATTLE_HERO.y};
    Object.assign(enemy,{position,approachFrom:{...position},homePosition:{...position},enemyNextAttackAt:999999,
      npcCombat:{firstAttackDone:true,readyAt:{176:7000},cast:{skillId:176,level:1,targetActorId:s.id,startedAt:2000,endsAt:2800,areaId:s.areaId,actionId:'saved-poison'}}});
    s.lastSimulatedAt=2000;
    return {s,c};
  }
  it('NPC weapon skills skip perfect dodge and its RNG draw, while normal attacks retain it',()=>{
    const roll=vi.spyOn(tools,'random').mockReturnValue(.02);
    const plain=pendingPoison();advanceState(plain.s,plain.c,3000);const expectedCalls=roll.mock.calls.length;roll.mockClear();
    const lucky=pendingPoison();lucky.c.items[2301].effects.perfectDodge=100;
    const end=advanceState(lucky.s,lucky.c,3000);
    expect(end.hp).toBeLessThan(lucky.s.hp);expect(end.playerStatuses?.SC_POISON).toBeDefined();
    expect(roll.mock.calls).toHaveLength(expectedCalls);
    const normal=statusSetup();normal.c.items[2301].effects.perfectDodge=100;
    const first=advanceState(normal.s,normal.c,1000);expect(first.hp).toBe(normal.s.hp);expect(first.events.some(e=>e.at===1000&&e.kind==='dodge')).toBe(true);
  });
  it.each([5,6])('NPC range classification uses actual resolution distance %s cells for Pneuma and Safety Wall',distance=>{
    vi.spyOn(tools,'random').mockReturnValue(.02);
    for(const defense of ['pneumaGround','safetyWallGround'] as const) {
      const {s,c}=pendingPoison(distance);
      s.combatEffects={[defense]:{cells:[{x:5,y:7}],expiresAt:10000,sceneKey:`challenge:${s.battle!.attemptId??'mastering'}`,hits:10},safetyWallHits:defense==='safetyWallGround'?10:undefined};
      const end=advanceState(s,c,3000),blocked=defense==='pneumaGround'?distance>5:distance<=5;
      expect(end.hp===s.hp,defense).toBe(blocked);expect(!!end.playerStatuses?.SC_POISON,defense).toBe(!blocked);
      if(defense==='safetyWallGround')expect(end.combatEffects?.safetyWallHits).toBe(blocked?9:10);
    }
  });
});
