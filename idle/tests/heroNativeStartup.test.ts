import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { NativeActorsBridge } from '../web/assets/nativeActors';
import * as actorPresentation from '../web/assets/enemyActionPresentation';
import { ActionTextureStartup, presentedActorActionAt, presentLatestActorActions, reconcileActorPlayback, soloPostureAt, targetHealthAt } from '../web/assets/combatPresentation';
import { getActorPose, getActorPlaybackDuration, getCombatActorAction } from '../web/assets/renderer';
import { shiftCorpsePresentation } from '../web/assets/corpsePresentation';

const scene = readFileSync(new URL('../web/components/Scene.tsx', import.meta.url), 'utf8');
const between = (start: string, end: string) => scene.slice(scene.indexOf(start), scene.indexOf(end, scene.indexOf(start)));
// Execute the actual Scene consumer seams, rather than a test implementation of its startup feature.
function seam(source: string, result = '') {
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function('scope', `with (scope) { ${js} ${result} }`);
}
const oldDebut = scene.includes('      if (!isArriving && actorsRef.current.hero')
  ? between('      if (!isArriving && actorsRef.current.hero', '      const groupEnemies') : '';
const prepareHero = seam(oldDebut + between('      const soloPosture = soloPostureAt(', '      const camera =') +
  between('      const heroCue = groupHeroCue;', '      // Prepare incoming offense'),
  'return { cue: heroCue, frame: typeof heroFrame === "undefined" ? undefined : heroFrame, posture: soloPosture };');
const heroPaint = seam(between('      if (heroActor)\n        paint(', '      const opponentDead ='));
const cleanup = seam(between('    combatCues.current = combatCues.current.filter(', '    lootCues.current ='));
const associates = seam(between('  const shiftPresentationAssociates =', '  useEffect(() => {'), 'return shiftPresentationAssociates;');
const camera: any = { map: 'fixture', modelView: [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],
  projection: [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1], focus: [.5,0,.5], viewport: { width: 100, height: 100 } };
const hit = (id = 1, actionAt = 1000, actorAction: 'attack' | 'skill' | 'none' = 'attack') => ({
  id, actionId: `hero-${id}`, actionAt, sourceActorId: 'hero', targetActorId: 'mob', actorAction,
  start: actionAt, effectStart: actionAt, impact: actionAt + 300, actionDuration: actorAction === 'attack' ? 450 : 300,
  duration: 650, motionMs: 300, hit: true, amount: 100, targetHpBefore: 100, presented: true,
  presentationDirection: undefined as number | undefined,
  skill: undefined as { sourceName: string } | undefined,
});

function fixture(action: 'attack' | 'skill' = 'attack', brandish = false) {
  let now = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const patch = readFileSync(new URL('../../docker/web-client/mapviewer-idle.patch', import.meta.url), 'utf8');
  const source = patch.split('@@ -0,0 +1,')[1].split('\n').slice(1).filter(l => l.startsWith('+'))
    .map(l => l.slice(1)).join('\n').split('export default')[0].replace(/^import .*;$/gm, '');
  const messages: any[] = [], acks: any[] = [], withheld: any[] = [];
  const gl: any = { NO_ERROR: 0, getError: () => 0, isContextLost: () => false, getParameter: () => false, createTexture: () => ({}) };
  for (const name of ['deleteTexture','activeTexture','bindTexture','pixelStorei','texImage2D','texParameteri','enable','depthMask']) gl[name] = () => {};
  const api = runInNewContext(source + '\n({receive,render})', { Uint8ClampedArray, performance,
    window: { parent: { postMessage: (data: any) => acks.push(data) } }, Altitude: {}, Ground: { getShadowFactor: () => 1 }, WebGL: {},
    SpriteRenderer: { bind3DContext: () => {}, unbind: () => {}, runWithDepth: (_a:any,_b:any,_c:any,fn:any) => fn(),
      position: { set: () => {} }, offset: { set: () => {} }, size: { set: () => {} }, color: { set: () => {} }, image: {}, render: () => {} } });
  const bridge = new NativeActorsBridge({ postMessage: (data: any) => messages.push(data) } as any, 'https://fixture', 'fixture');
  const part = () => ({ sprite: { indexedCount: 10, frames: Array.from({length:10}, (_,i) => ({width:1,height:1,type:0,rgba:new Uint8ClampedArray([i+10,0,0,255])})) },
    action: { actions: Array.from({length:104}, (_,i) => ({delayMs:100,
      frames: (i >= 80 && i < 96 ? [1,2,3,4,5,6,7,8,9] : i >= 96 ? [1,2,3] : [0]).map(index => ({anchors:[],layers:[{
        index,type:0,x:index,y:0,mirror:false,scaleX:1,scaleY:1,rotation:0,color:[255,255,255,255],
      }]})) })) } });
  const actor: any = { kind:'character',fallback:false,identity:{job:'knight',gender:'male'},body:part(),head:part(),weapon:part(),weaponTrail:part(),
    weaponVisual:{job:'knight',gender:'male',type:brandish?'spear':'sword',mounted:brandish} };
  const idle: any = {id:'hero',actor,action:'idle',world:[.5,0,.5],scale:1,direction:6,elapsed:0,bottom:0,motionMs:300};
  const session = messages[0].session;
  const send = (release = false) => {
    for (const message of messages.splice(0)) {
      if (message.type === 'ragidle-map-actor-frames') {
        withheld.push(...message.frames.filter((f:any) => f.rgba[0] !== 10));
        api.receive({...message,frames:release?message.frames:message.frames.filter((f:any)=>f.rgba[0]===10)},'https://fixture','fixture',[0,0],gl);
      } else api.receive(message,'https://fixture','fixture',[0,0],gl);
    }
    if (release && withheld.length) api.receive({type:'ragidle-map-actor-frames',map:'fixture',session,frames:withheld.splice(0)},'https://fixture','fixture',[0,0],gl);
    api.render(now,gl,[],[],{});
    for (const ack of acks.splice(0)) bridge.receive(ack);
  };
  send(); bridge.submit([idle],camera,100,100,now); send();
  const cue = hit(1,1000,action);
  if (brandish) { cue.skill={sourceName:'KN_BRANDISHSPEAR'}; cue.actionDuration=450; }
  const combatCues = {current:[cue]}, actionWatermarks = {current:new Map()}, textureStartup = {current:new ActionTextureStartup()};
  const Generic = (actorPresentation as unknown as {ActorActionPresentation?: typeof actorPresentation.EnemyActionPresentation}).ActorActionPresentation;
  const heroPresentation = {current:new (Generic ?? actorPresentation.EnemyActionPresentation)(textureStartup.current)};
  const enemyPresentation = {current:new actorPresentation.EnemyActionPresentation(textureStartup.current)};
  const effects = {current:[{id:1,start:1300},{id:99,start:1320}]};
  const groupHistory = {current:new Map([['mob',{presentationCueId:1,deadAt:1300,until:3300}],['dot-mob',{presentationCueId:99,deadAt:1320,until:3320}]])};
  const defeatedOpponent = {current:{presentationCueId:1,deadAt:1300,until:3300}};
  const lootCues = {current:[{presentationCueId:1,start:1300,until:6300},{presentationCueId:99,start:1320,until:6320}]};
  const shiftPresentationAssociates = associates({effects,groupHistory,defeatedOpponent,lootCues,shiftCorpsePresentation});
  const tick = (at:number,release=false, clean=false) => {
    now=at;
    // Native iframe continues rendering/ACKing every50ms even through a parent RAF gap.
    send(release);
    if(clean)cleanup({combatCues,now,textureStartup,heroPresentation,enemyPresentation});
    const current:any={id:'hero',hp:100,status:'hunting',buffs:{},learnedSkills:{},job:'novice'};
    const catalog:any={skills:{},classes:{},source:{files:[]}};
    const scope:any={combatCues,actionWatermarks,textureStartup,heroPresentation,enemyPresentation,shiftPresentationAssociates,
      current,catalog,serverNow:now,soloPostureAt,isArriving:false,actorsRef:{current:{hero:actor}},heroActor:actor,
      heroDirection:6,camera,heroPlacement:{world:idle.world},motion:{matches:false},nativeActors:{current:bridge},time:now,
      actorActionCue:(c:any[],m:any,id:string,t:number)=>presentedActorActionAt(c,id,t),
      getActorPose,getActorPlaybackDuration,getCombatActorAction,reconcileActorPlayback};
    const result=prepareHero(scope);
    const paints:any[]=[];
    heroPaint({...scope,soloPosture:result.posture,heroCue:result.cue,heroFrame:result.frame,heroAction:result.cue?getCombatActorAction(result.cue.actorAction,result.cue.skill?.sourceName):'idle',
      casting:undefined,serverNow:now,counterPosture:undefined,heroHurt:undefined,heroWalking:false,
      heroX:50,heroGround:50,heroScale:1,heroFeetWorld:idle.world,paint:(...args:any[])=>paints.push(args)});
    const paint=paints[0];
    const owned=bridge.submit(paint[11]?[]:[{...idle,action:paint[2],elapsed:paint[7],motionMs:paint[8]}],camera,100,100,now);
    send(release);
    return {result,paint,owned};
  };
  const ack = (at:number) => { now=at; send(); };
  return {tick,ack,cue,combatCues,actionWatermarks,bridge,effects,groupHistory,defeatedOpponent,lootCues,heroPresentation};
}

afterEach(()=>vi.restoreAllMocks());
describe('hero startup through actual Scene seams and native retained-pose protocol',()=>{
  it('exports the proven actor gate for Scene and preserves the enemy contract',()=>{
    expect((actorPresentation as any).ActorActionPresentation).toBe(actorPresentation.EnemyActionPresentation);
    expect(scene).toContain('heroPresentation.current.frame(');
  });
  it.each(['attack','skill'] as const)('pins cold %s to frame-zero Canvas after450ms with fresh idle ACKs',action=>{
    const f=fixture(action);
    for(let at=1000;at<1450;at+=50){f.tick(at);expect(f.bridge.getDiagnostics('hero').poseHeld).toBe(true);}
    const first=f.tick(1450);
    expect(first.paint[11]).toBe(true);expect(first.paint[7]).toBe(0);expect(first.owned.has('hero')).toBe(false);
    expect(f.bridge.getDiagnostics('hero')).toMatchObject({poseHeld:null,drawnPose:null});
    const later=f.tick(1500,true);
    expect(later.paint[11]).toBe(true);expect(later.paint[7]).toBe(50);expect(later.owned.has('hero')).toBe(false);
    expect(f.cue.actionAt).toBe(1000);expect(f.cue.motionMs).toBe(300);expect(f.cue.amount).toBe(100);
    expect(f.cue.impact).toBe(1750);
    expect(targetHealthAt(0,100,[f.cue],'mob',1749)).toBe(100);expect(targetHealthAt(0,100,[f.cue],'mob',1750)).toBe(0);
    expect(f.groupHistory.current.get('mob')).toMatchObject({deadAt:1750,until:3750});
    expect(f.defeatedOpponent.current.deadAt).toBe(1750);expect(f.effects.current[0].start).toBe(1750);expect(f.lootCues.current[0]).toMatchObject({start:1750,until:6750});
    expect(f.groupHistory.current.get('dot-mob')).toMatchObject({deadAt:1320,until:3320});expect(f.effects.current[1].start).toBe(1320);expect(f.lootCues.current[1].start).toBe(1320);
  });
  it('retains a debuted but never painted hero through snapshot cleanup and RAF1900',()=>{
    const f=fixture();f.tick(1000);
    for(let at=1050;at<=1900;at+=50)f.ack(at);
    const first=f.tick(1900,false,true);
    expect(f.combatCues.current).toHaveLength(1);expect(first.paint[2]).toBe('attack');
    expect(first.paint[11]).toBe(true);expect(first.paint[7]).toBe(0);expect(first.owned.has('hero')).toBe(false);
    expect(f.cue.start).toBe(1900);expect(f.cue.impact).toBe(2200);expect(f.cue.actionAt).toBe(1000);
    expect(f.tick(1950,true).paint[7]).toBe(50);
  });
  it('shifts queued hero/AoE siblings once while preserving DOT and other actor clocks',()=>{
    const f=fixture(),sibling={...f.cue,id:2,targetActorId:'second'},next=hit(3,1100),dot={...hit(99,1020,'none')},other={...hit(5),sourceActorId:'enemy'};
    f.combatCues.current.push(sibling,next,dot,other);presentLatestActorActions(f.combatCues.current,f.actionWatermarks.current,1000);
    f.tick(1000);for(let at=1050;at<=1900;at+=50)f.ack(at);
    f.tick(1900,false,true);
    expect(f.cue.start).toBe(1900);expect(sibling.start).toBe(1900);expect(next.start).toBe(2350);
    expect(next.impact).toBe(2650);expect(dot.impact).toBe(1320);expect(other.start).toBe(1000);
    expect(f.actionWatermarks.current.get('hero')).toMatchObject({start:2350,end:2800});
    f.tick(1950,true);expect(next.start).toBe(2350);expect(sibling.start).toBe(1900);
  });
  it('uses equipped mounted Brandish attack rather than generic skill in the shared gate',()=>{
    const f=fixture('skill',true);for(let at=1000;at<=1450;at+=50)f.tick(at);
    expect(f.tick(1500,true).paint).toMatchObject({2:'attack',7:50,11:true});
    expect(f.cue.actionDuration).toBe(450);expect(f.cue.presentationDirection).toBe(6);
  });
  it('releases native warmup at frame zero when textures arrive within budget',()=>{
    const f=fixture();f.tick(1000);f.tick(1100);
    const ready=f.tick(1150,true);
    expect(ready.paint[7]).toBe(0);expect(ready.paint[11]).toBe(false);expect(ready.owned.has('hero')).toBe(true);
    expect(f.bridge.getDiagnostics('hero').poseHeld).toBe(false);expect(f.cue.impact).toBe(1450);
    expect(f.tick(1200,true).paint[7]).toBe(50);
  });
  it('expires a pending startup instead of reviving stale history',()=>{
    const f=fixture();f.tick(1000);for(let at=1050;at<=3050;at+=50)f.ack(at);
    const stale=f.tick(3050,false,true);
    expect(f.combatCues.current).toHaveLength(0);expect(stale.paint[2]).toBe('idle');expect(stale.result.frame).toBeUndefined();
  });
});
