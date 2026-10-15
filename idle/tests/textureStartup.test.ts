import { describe, expect, it } from 'vitest';
import { ActionTextureStartup, presentLatestActorActions, targetHealthAt } from '../web/assets/combatPresentation';

const cue = (id=1,actionId='first',start=1000,actor='hero') => ({id,actionId,actionAt:start,sourceActorId:actor,
  targetActorId:'enemy',actorAction:'attack' as const,start,effectStart:start,impact:start+219.5,
  actionDuration:439,presented:true,hit:true,targetHpBefore:50,amount:50});

describe('texture startup presentation',()=>{
  it('starts at frame zero when readiness arrives after a long render gap within the wait budget',()=>{
    const hit=cue(),gate=new ActionTextureStartup();
    gate.hold([hit],new Map(),hit,1010,false);
    gate.hold([hit],new Map(),hit,1240,true);
    expect(hit.start).toBe(1240);expect(gate.waitedFor(hit)).toBe(240);
    expect(hit.impact).toBe(1459.5);
  });
  it('holds frame zero and lethal health until textures arrive, then plays the full motion',()=>{
    const hit=cue(),marks=new Map(),gate=new ActionTextureStartup();
    for(const time of [1010,1060,1110,1160,1210]) gate.hold([hit],marks,hit,time,false);
    expect(hit.start).toBe(1210);
    expect(targetHealthAt(0,50,[hit],'enemy',1210)).toBe(50);
    gate.hold([hit],marks,hit,1240,true);
    expect(hit.start).toBe(1240);expect(hit.actionDuration).toBe(439);
    expect(targetHealthAt(0,50,[hit],'enemy',1459)).toBe(50);
    expect(targetHealthAt(0,50,[hit],'enemy',1459.5)).toBe(0);
    expect(gate.hold([hit],marks,hit,1290,false).size).toBe(0);
  });
  it('shifts each AoE sibling and queued action once and updates the latest watermark',()=>{
    const hit=cue(),sibling={...hit,id:2,targetActorId:'other'},next=cue(3,'next',1100),enemy=cue(4,'incoming',1000,'mob');
    const batch=[hit,sibling,next,enemy],marks=new Map();
    presentLatestActorActions(batch,marks,1000);
    const gate=new ActionTextureStartup(),moved=gate.hold(batch,marks,hit,1060,false);
    expect(hit.start).toBe(1060);expect(sibling.start).toBe(1060);expect(next.start).toBe(1499);
    expect(enemy.start).toBe(1000);expect(moved.get(1)).toBe(60);expect(moved.get(2)).toBe(60);
    expect(marks.get('hero')).toMatchObject({start:1499,end:1938});
    const late=cue(5,'late',1200);presentLatestActorActions([late],marks,1200,batch);
    expect(late.start).toBe(1938);
  });
  it('does not shift independent immediate damage and links terminal timing by cue identity',()=>{
    const hit=cue(),dot={...cue(2,'dot',1020),actorAction:'none' as const};
    const moved=new ActionTextureStartup().hold([hit,dot],new Map(),hit,1060,false);
    expect(moved.has(dot.id)).toBe(false);expect(dot.impact).toBe(1239.5);
    // The Scene moves a death/loot only when its exact terminal cue is in this map.
    expect(moved.get(hit.id)).toBe(60);expect(moved.get(dot.id)??0).toBe(0);
  });
  it('bounds texture waiting to 450 ms without slowing source action duration',()=>{
    const hit=cue(),gate=new ActionTextureStartup();
    for(let time=1050;time<=1600;time+=50)gate.hold([hit],new Map(),hit,time,false);
    expect(hit.start).toBe(1450);expect(hit.actionDuration).toBe(439);
    expect(gate.hold([hit],new Map(),hit,1650,false).size).toBe(0);
  });
  it('does not wait for a ready/fallback action or replay compressed history',()=>{
    const ready=cue(),old={...cue(2,'old'),presented:false};const gate=new ActionTextureStartup();
    expect(gate.hold([ready],new Map(),ready,1020,true).size).toBe(0);
    expect(gate.hold([ready],new Map(),ready,1080,false).size).toBe(0);
    expect(gate.hold([old],new Map(),old,1080,false).size).toBe(0);
    expect(ready.start).toBe(1000);expect(old.start).toBe(1000);
  });
});
