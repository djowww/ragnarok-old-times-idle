import {describe,it,expect} from 'vitest';
import {createInitialState,advanceState,applyCommand} from '../engine/index';
import {beginBattle} from '../engine/encounters';
import {healFull} from '../engine/stats';
import {addItem} from '../engine/state';
import data from '../content/catalog.json';
import type {Catalog,GameState,BattleEnemy} from '../shared/types';
function setup(){
 const c=structuredClone(data) as unknown as Catalog;suppressDrops(c);
 const s=createInitialState(c,0);s.job='hunter';c.classes.hunter.jobBonuses={};s.baseLevel=70;s.jobLevel=40;s.stats={str:1,agi:1,vit:30,int:71,dex:97,luk:333};s.equipment={};
 s.equipment.weapon=addItem(s,c,1701,1).uid;s.learnedSkills={ht_falcon:1,ht_steelcrow:9,blitz_beat:5};s.rotation=[];s.falconEquipped=true;s.autoPotion={hpThreshold:0,spThreshold:0};s.combatEffects={regenBlockedUntil:999999};healFull(s,c);s.sp=0;
 s.status='challenge';beginBattle(s,c,1002,0,'mastering');s.battle!.playerNextAttackAt=0;s.battle!.playerNextSkillAt=999999;s.battle!.playerActionReadyAt=0;
 const e=s.battle!.enemies![0];Object.assign(e,{id:'original',hp:100000,maxHp:100000,startedAt:0,arrivedAt:0,enemyNextAttackAt:999999,position:{x:.48,y:.65},approachFrom:{x:.48,y:.65}});return{s,c};
}
function suppressDrops(c:Catalog){for(const m of Object.values(c.monsters)){m.drops=[];m.mvpDrops=[];m.npcStatusSkills=[];}}
function launched(){const{s,c}=setup();const next=advanceState(s,c,250);next.battle!.playerNextAttackAt=999999;return{s:next,c,impact:(next as any).falconStrikes?.[0]};}
function field(s:GameState){
 s.status='hunting';s.areaId='prontera_south';delete s.battle!.challengeId;delete s.battle!.attemptId;delete s.battle!.deadlineAt;const e=s.battle!.enemies![0];e.fieldSlot=0;s.fieldPopulation={areaId:s.areaId,enemies:[e],respawns:[],nextActorId:1} as any;
 s.fieldHero={areaId:s.areaId,phase:'waiting',from:{x:.48,y:.65},position:{x:.48,y:.65},startedAt:0,arrivedAt:0} as any;return e;
}
describe('native Auto Blitz pending impact',()=>{
 it('launches from a surviving positive bow hit with zero SP, no cast and no added actor clock',()=>{
  const{s,c}=setup(),before=structuredClone(s);before.falconEquipped=false;const control=advanceState(before,c,250),next=advanceState(s,c,250),queue=(next as any).falconStrikes;
  expect(queue).toHaveLength(1);expect(queue[0]).toMatchObject({skillId:'blitz_beat',level:5,automatic:true,sourceActorId:s.id});expect(queue[0].impactAt).toBeGreaterThan(250);
  expect(next.sp).toBe(0);expect(next.battle?.cast).toBeUndefined();expect(next.battle!.playerNextAttackAt).toBe(control.battle!.playerNextAttackAt);expect(next.battle!.playerActionReadyAt).toBe(control.battle!.playerActionReadyAt);expect(next.playerCanActAt).toBe(control.playerCanActAt);expect(next.skillReadyAt).toEqual(control.skillReadyAt);
  expect(next.events.filter(e=>e.skillId==='blitz_beat'&&e.kind==='damage')).toHaveLength(0);
 });
 it.each(['falcon','bow','learned','lethal'])('does not launch or draw for an ineligible %s',reason=>{
  const{s,c}=setup();if(reason==='falcon')s.falconEquipped=false;if(reason==='bow')s.equipment={};if(reason==='learned')delete s.learnedSkills.blitz_beat;if(reason==='lethal')s.battle!.enemies![0].hp=1;
  const without=structuredClone(s);without.falconEquipped=false;const expected=advanceState(without,c,250),next=advanceState(s,c,250);expect((next as any).falconStrikes??[]).toHaveLength(0);expect(next.rngState).toBe(expected.rngState);
 });
 it('applies captured damage once after JSON/reconnect and never retargets another ID',()=>{
  const{s,c,impact}=launched();expect(impact).toBeDefined();const before=s.battle!.enemies![0].hp,amount=impact.targets[0].damage,rng=s.rngState;
  const next=advanceState(JSON.parse(JSON.stringify(s)),c,impact.impactAt+250);expect(next.battle!.enemies![0].hp).toBe(before-amount);expect(next.rngState).toBe(rng);expect((next as any).falconStrikes??[]).toHaveLength(0);
  const later=advanceState(next,c,impact.impactAt+500);expect(later.battle!.enemies![0].hp).toBe(next.battle!.enemies![0].hp);const events=next.events.filter(e=>e.kind==='damage'&&e.skillId==='blitz_beat');expect(events).toHaveLength(1);expect(events[0]).toMatchObject({at:impact.impactAt,actorAction:'none',actionMotionMs:0,hitCount:5});
 });
 it('keeps captured DEX/INT, element and damage after equipment or buffs change in flight',()=>{
  const{s,c,impact}=launched();expect(impact).toBeDefined();const before=s.battle!.enemies![0].hp,amount=impact.targets[0].damage;s.stats.int=30;s.stats.dex=90;s.equipment={};s.falconEquipped=false;s.battle!.enemies![0].statuses={SC_FREEZE:{expiresAt:99999,level:1},SC_LEXAETERNA:{expiresAt:99999,level:1}};
  const next=advanceState(s,c,impact.impactAt+250);expect(next.battle!.enemies![0].hp).toBe(before-amount);expect(next.battle!.enemies![0].statuses!.SC_LEXAETERNA).toBeDefined();
 });
 it('skips a dead or replaced slot ID without awarding another kill',()=>{
  const{s,c,impact}=launched();expect(impact).toBeDefined();const e=s.battle!.enemies![0];e.id='replacement';const before=e.hp;const next=advanceState(s,c,impact.impactAt+250);expect(next.battle!.enemies![0].hp).toBe(before);expect(next.totals.kills).toBe(0);
 });
 it('cancels when the player changes scene, but a nearby same-map relocation still permits impact',()=>{
  const{s,c,impact}=launched();expect(impact).toBeDefined();s.status='town';s.battle=null;const next=advanceState(s,c,impact.impactAt+250);expect(next.events.some(e=>e.skillId==='blitz_beat'&&e.kind==='damage')).toBe(false);expect((next as any).falconStrikes??[]).toHaveLength(0);
 });
 it('can finish, kill and drop while sitting in the same field without constructing a battle',()=>{
  const{s,c}=setup();const e=field(s);const next=advanceState(s,c,250),impact=(next as any).falconStrikes?.[0];expect(impact).toBeDefined();next.battle!.playerNextAttackAt=999999;
  const actual=next.battle!.enemies!.find(x=>x.id===e.id)!;actual.hp=1;next.fieldPopulation!.enemies=[actual];c.monsters[actual.monsterId].drops=[{itemId:909,chance:10000}];const rest=applyCommand(next,c,{type:'rest'},251);expect(rest.battle).toBeNull();
  const done=advanceState(JSON.parse(JSON.stringify(rest)),c,impact.impactAt+250);expect(done.battle).toBeNull();expect(done.totals.kills).toBe(1);expect(done.fieldPopulation!.enemies.some(x=>x.id===actual.id)).toBe(false);expect(done.fieldPopulation!.respawns.filter(x=>x.slot===0)).toHaveLength(1);expect(done.events.some(e=>e.kind==='loot'&&e.itemId===909)).toBe(true);
 });
});

describe('Auto Blitz native boundaries and splash ownership',()=>{
 it('splits the parcel among all four alive IDs before multiplying five source hits',()=>{
  const{s,c}=setup(),e=s.battle!.enemies![0];s.battle!.enemies=[e,...[1,2,3].map((n)=>({...structuredClone(e),id:`splash-${n}`,position:{x:.48+(n===1?1:n===2?-1:0)/12,y:.65+(n===3?1:0)/12},approachFrom:{x:.48+(n===1?1:n===2?-1:0)/12,y:.65+(n===3?1:0)/12}}))];
  const next=advanceState(s,c,250),impact=next.falconStrikes![0];expect(impact.targets).toHaveLength(4);expect(impact.targets.map(t=>t.damage)).toEqual([275,275,275,275]);
 });
 it('ignores the active Blitz cooldown and uses no SP, items or skill clock',()=>{
  const{s,c}=setup();s.skillReadyAt.blitz_beat=999999;const before=structuredClone(s.inventory),next=advanceState(s,c,250);expect(next.falconStrikes).toHaveLength(1);expect(next.inventory).toEqual(before);expect(next.sp).toBe(0);expect(next.skillReadyAt.blitz_beat).toBe(999999);
 });
 it('does not draw on elemental zero or on a real missed basic hit',()=>{
  for(const why of ['immune','miss']){
   const{s,c}=setup();if(why==='immune'){c.monsters[1002].element='Ghost';c.monsters[1002].elementLevel=4;}else{s.stats.luk=0;c.monsters[1002].stats.agi=5000;}
   const without=structuredClone(s);without.falconEquipped=false;const control=advanceState(without,c,250),next=advanceState(s,c,250);expect(next.falconStrikes??[]).toHaveLength(0);expect(next.rngState).toBe(control.rngState);
   expect(next.events.some(e=>why==='miss'?e.kind==='miss':e.kind==='damage'&&e.amount===0)).toBe(true);
  }
 });
 it('does not trigger from Double Strafe, another active bow skill',()=>{
  const{s,c}=setup();addItem(s,c,1750,1);const skill=Object.values(c.skills).find(k=>k.sourceName==='AC_DOUBLE')!;s.sp=100;s.learnedSkills[skill.id]=10;s.rotation=[skill.id];s.battle!.playerNextAttackAt=999999;s.battle!.playerNextSkillAt=0;
  const next=advanceState(s,c,250);expect(next.events.some(e=>e.kind==='damage'&&e.skillId===skill.id)).toBe(true);expect(next.falconStrikes??[]).toHaveLength(0);
 });
 it('shifts pending impact deadlines exactly once when resuming the offline cap',()=>{
  const{s,c,impact}=launched();expect(impact).toBeDefined();expect(s.status).toBe('challenge');s.pausedStatus='challenge';s.status='paused';s.pausedAt=250;const next=applyCommand(s,c,{type:'dismissFalcon'},10250);expect(next.falconStrikes![0].impactAt).toBe(impact.impactAt+10000);expect(next.falconStrikes![0].launchedAt).toBe(impact.launchedAt+10000);
 });
});

it('persists splash Lex consumption on independent field copies before the flight lands',()=>{
 const{s,c}=setup();field(s);const extra=structuredClone(s.battle!.enemies![0]);
 extra.id='lex-secondary';extra.fieldSlot=1;extra.position={x:.49,y:.65};extra.approachFrom={...extra.position};
 extra.statuses={SC_LEXAETERNA:{expiresAt:99999,level:1}};
 s.battle!.enemies!.push(extra);s.fieldPopulation!.enemies.push(extra);
 const next=advanceState(JSON.parse(JSON.stringify(s)),c,250);
 expect(next.falconStrikes![0].targets.map(t=>t.enemyId)).toContain(extra.id);
 expect(next.battle!.enemies!.find(e=>e.id===extra.id)!.statuses!.SC_LEXAETERNA).toBeUndefined();
 expect(next.fieldPopulation!.enemies.find(e=>e.id===extra.id)!.statuses!.SC_LEXAETERNA).toBeUndefined();
 const rest=applyCommand(next,c,{type:'rest'},251);
 expect(rest.fieldPopulation!.enemies.find(e=>e.id===extra.id)!.statuses!.SC_LEXAETERNA).toBeUndefined();
});


describe('Hunter Beast Strafing combo', () => {
  it('chains after Double Strafe against a brute and pays its SP and arrow costs', () => {
    const { s, c } = setup();
    const double = Object.values(c.skills).find(skill => skill.sourceName === 'AC_DOUBLE')!;
    const beast = Object.values(c.skills).find(skill => skill.sourceName === 'HT_POWER')!;
    const target = s.battle!.enemies![0];
    c.monsters[target.monsterId].race = 'Brute';
    target.hp = target.maxHp = 100000;
    s.sp = 100;
    addItem(s, c, 1750, 3);
    s.learnedSkills[double.id] = 10;
    s.learnedSkills[beast.id] = 1;
    s.rotation = [beast.id, double.id];
    s.battle!.playerNextAttackAt = 999999;
    s.battle!.playerNextSkillAt = 0;
    s.battle!.playerActionReadyAt = 0;

    const first = advanceState(s, c, 250);
    expect(first.events.some(event => event.kind === 'damage' && event.skillId === double.id)).toBe(true);
    first.skillReadyAt[double.id] = 999999;
    const next = advanceState(first, c, 1000);
    const beastHit = next.events.find(event => event.kind === 'damage' && event.skillId === beast.id);

    expect(beastHit).toMatchObject({ hitCount: 2 });
    expect(next.sp).toBe(76);
    expect(next.inventory.filter(entry => entry.itemId === 1750).reduce((sum, entry) => sum + entry.quantity, 0)).toBe(1);
  });
});

describe('Hunter Beast Strafing eligibility', () => {
  it.each([
    ['without its combo', 'Brute', false],
    ['against another race', 'Plant', true],
  ])('does not use Beast Strafing %s', (_reason, race, comboActive) => {
    const { s, c } = setup();
    const beast = Object.values(c.skills).find(skill => skill.sourceName === 'HT_POWER')!;
    const target = s.battle!.enemies![0];
    c.monsters[target.monsterId].race = race;
    s.sp = 100;
    addItem(s, c, 1750, 3);
    s.learnedSkills[beast.id] = 1;
    s.rotation = [beast.id];
    s.battle!.playerNextAttackAt = 999999;
    s.battle!.playerNextSkillAt = 0;
    s.battle!.playerActionReadyAt = 0;
    if (comboActive) s.combatEffects!.combo = { sourceName: 'AC_DOUBLE', expiresAt: 2000 };

    const next = advanceState(s, c, 250);

    expect(next.events.some(event => event.kind === 'damage' && event.skillId === beast.id)).toBe(false);
    expect(next.sp).toBe(100);
    expect(next.inventory.filter(entry => entry.itemId === 1750).reduce((sum, entry) => sum + entry.quantity, 0)).toBe(3);
  });

});


describe('field AFK target handoff after a kill', () => {
  it('keeps the lethal action on its original actor and sends the next attack to the replacement without stalling', () => {
    const { s, c } = setup();
    const first = field(s);
    const firstId = 'field-first';

    first.id = firstId;
    first.hp = 1;
    first.maxHp = 1;
    first.fieldSlot = 0;
    first.engaged = true;
    first.startedAt = 0;
    first.arrivedAt = 0;
    first.enemyNextAttackAt = 999999;
    first.position = { x: 0.48, y: 0.65 };
    first.approachFrom = { ...first.position };

    const second = structuredClone(first);
    second.id = 'field-second';
    second.fieldSlot = 1;
    second.hp = 100000;
    second.maxHp = 100000;
    second.engaged = false;
    second.position = { x: 0.49, y: 0.65 };
    second.approachFrom = { ...second.position };

    s.falconEquipped = false;
    delete s.learnedSkills.ht_falcon;
    delete s.learnedSkills.blitz_beat;
    s.rotation = [];
    s.battle!.enemies = [first, second];
    s.battle!.targetId = firstId;
    s.battle!.hp = first.hp;
    s.battle!.maxHp = first.maxHp;
    s.battle!.playerNextAttackAt = 0;
    s.battle!.playerNextSkillAt = 999999;
    s.battle!.playerActionReadyAt = 0;
    s.fieldPopulation!.generation = 1;
    s.fieldPopulation!.enemies = [first, second];

    const afterKill = advanceState(s, c, 250);
    expect(afterKill.totals.kills).toBe(1);
    expect(afterKill.events.find(event => event.kind === 'kill')).toMatchObject({
      enemyId: firstId,
      monsterId: first.monsterId,
    });

    const firstAttack = afterKill.events.find(
      event => event.kind === 'damage' && event.enemyId === firstId,
    );
    expect(firstAttack).toMatchObject({
      enemyId: firstId,
      targetActorId: firstId,
      actorAction: 'attack',
    });
    expect(afterKill.battle?.targetId).toBe(second.id);
    expect(afterKill.fieldPopulation?.enemies.some(enemy => enemy.id === firstId)).toBe(false);
    expect(afterKill.battle?.enemies?.find(enemy => enemy.id === second.id)?.hp).toBe(second.maxHp);
    expect(afterKill.battle?.playerNextAttackAt).toBeGreaterThan(250);

    const nextAttackAt = afterKill.battle!.playerNextAttackAt;
    const nextCombatTick = Math.ceil(nextAttackAt / 250) * 250;
    const afterNextAttack = advanceState(afterKill, c, nextCombatTick);
    const secondAttack = afterNextAttack.events.find(
      event => event.kind === 'damage' && event.enemyId === second.id,
    );

    expect(secondAttack).toMatchObject({
      at: nextAttackAt,
      enemyId: second.id,
      targetActorId: second.id,
      actorAction: 'attack',
      actionStartedAt: nextAttackAt,
    });
    expect(secondAttack?.actionId).not.toBe(firstAttack?.actionId);
    expect(afterNextAttack.events.filter(event => event.kind === 'damage' && event.enemyId === second.id)).toHaveLength(1);
    expect(afterNextAttack.battle?.enemies?.find(enemy => enemy.id === second.id)?.hp).toBeLessThan(second.maxHp);
  });
});
