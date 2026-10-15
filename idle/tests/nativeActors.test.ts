import {afterEach,describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {NativeActorsBridge} from '../web/assets/nativeActors';
import {corpseFrameAt,startCorpsePresentation,type CorpsePresentation} from '../web/assets/corpsePresentation';
const layer=(index:number)=>({index,type:0,x:0,y:0,mirror:false,scaleX:1,scaleY:1,rotation:0,color:[255,255,255,255]});
const part=(start:number)=>({sprite:{indexedCount:23,frames:Array.from({length:23},(_,i)=>({width:1,height:1,rgba:new Uint8ClampedArray([start+i,0,0,255]),type:0}))},action:{actions:Array.from({length:24},(_,i)=>({delayMs:100,frames:(i===22?[0,1,2]:[3+i%20]).map(index=>({layers:[layer(index)],anchors:[]}))}))}});
const camera:any={map:'fixture',modelView:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],projection:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],focus:[.5,0,.5],viewport:{width:100,height:100}};
function fixture(){
 const messages:any[]=[];const bridge=new NativeActorsBridge({postMessage:(data:any)=>messages.push(data)} as any,'https://fixture','fixture');const envelope={map:'fixture',session:messages[0].session};
 bridge.receive({...envelope,type:'ragidle-map-actors-ready',version:2});
 const paint:any={id:'hero',actor:{kind:'monster',fallback:false,body:part(101),head:part(111),weapon:part(121),weaponTrail:part(131)},action:'attack',world:[.5,0,.5],scale:1,direction:6,elapsed:0,bottom:0,motionMs:300};
 return {bridge,messages,envelope,paint};
}
afterEach(() => vi.restoreAllMocks());
describe('native reconnect diagnostics', () => {
 it('distinguishes a not-yet-supported bridge from ready and failed without changing ownership', () => {
  const messages:any[]=[];
  const bridge=new NativeActorsBridge({postMessage:(data:any)=>messages.push(data)} as any,'https://fixture','fixture');
  const envelope={map:'fixture',session:messages[0].session};
  expect(bridge.getDiagnostics('hero',100)).toMatchObject({supported:false,failed:false,errorReason:null,lastAckAt:null,lastAckAgeMs:null,ackSequence:null,ackActorCount:0,readyFrames:0,pendingFrames:0});
  bridge.receive({...envelope,type:'ragidle-map-actors-ready',version:1});
  expect(bridge.getDiagnostics('hero',100).supported).toBe(false);
  bridge.receive({...envelope,type:'ragidle-map-actors-ready',version:2});
  expect(bridge.getDiagnostics('hero',100)).toMatchObject({supported:true,failed:false,lastAckAt:null,ackSequence:null});
  bridge.receive({...envelope,type:'ragidle-map-actors-error',reason:'Idle sprite upload failed'});
  expect(bridge.getDiagnostics('hero',100)).toMatchObject({supported:false,failed:true,errorReason:'Idle sprite upload failed',ackActorCount:0});
  const before=messages.length;
  bridge.receive({...envelope,type:'ragidle-map-actors-ready',version:2});
  expect(bridge.getDiagnostics('hero',100).failed).toBe(true); expect(messages.length).toBe(before);
 });
 it('reports an empty valid ACK distinctly from no ACK and computes age from the supplied render clock', () => {
  const {bridge,envelope}=fixture(); vi.spyOn(performance,'now').mockReturnValue(100);
  bridge.receive({...envelope,type:'ragidle-map-actors-rendered',sequence:7,actors:[],frames:['f1','f2']});
  expect(bridge.getDiagnostics('hero',145)).toMatchObject({supported:true,failed:false,lastAckAt:100,lastAckAgeMs:45,ackSequence:7,ackActorCount:0,readyFrames:2,pendingFrames:0,acknowledgements:1,drawnPose:null});
  expect(bridge.getDiagnostics('hero',551).lastAckAgeMs).toBe(451);
  expect(bridge.getDiagnostics('hero',50).lastAckAgeMs).toBe(0);
  expect(bridge.getDiagnostics('hero',NaN).lastAckAgeMs).toBeNull();
  bridge.receive({...envelope,session:'wrong-session',type:'ragidle-map-actors-rendered',sequence:9,actors:['hero'],frames:[]});
  bridge.receive({...envelope,type:'ragidle-map-actors-rendered',sequence:6,actors:['hero'],frames:[]});
  bridge.receive({...envelope,type:'ragidle-map-actors-rendered',sequence:9,actors:['hero'],frames:['bad-id']});
  expect(bridge.getDiagnostics('hero',600)).toMatchObject({lastAckAt:100,lastAckAgeMs:500,ackSequence:7,ackActorCount:0,acknowledgements:1});
 });
 it('tracks actual pending and ready texture counts, ACK ownership and expiry without consuming a packet', () => {
  const {bridge,envelope,paint,messages}=fixture(); vi.spyOn(performance,'now').mockReturnValue(100);
  bridge.submit([paint],camera,100,100,100);
  const frames=messages.filter(m=>m.frames).flatMap(m=>m.frames.map((f:any)=>f.id));
  const before=messages.length;
  expect(bridge.getDiagnostics('hero',100)).toMatchObject({supported:true,ackSequence:null,ackActorCount:0,readyFrames:0,pendingFrames:20});
  bridge.receive({...envelope,type:'ragidle-map-actors-rendered',sequence:1,actors:['hero'],frames});
  expect(bridge.getDiagnostics('hero',101)).toMatchObject({lastAckAt:100,lastAckAgeMs:1,ackSequence:1,ackActorCount:1,readyFrames:20,pendingFrames:0,acknowledgements:1});
  expect(bridge.canPaintActionNatively(paint,549)).toBe(true);
  expect(bridge.getDiagnostics('hero',550).lastAckAgeMs).toBe(450);
  expect(bridge.canPaintActionNatively(paint,550)).toBe(false);
  expect(messages.length).toBe(before);
  bridge.receive({...envelope,type:'ragidle-map-actors-error',reason:'Idle sprite draw failed'});
  expect(bridge.getDiagnostics('hero',600)).toMatchObject({failed:true,supported:false,errorReason:'Idle sprite draw failed',lastAckAt:100,lastAckAgeMs:500,ackSequence:1,ackActorCount:1,readyFrames:0,pendingFrames:0});
  expect(bridge.canPaintActionNatively(paint,100)).toBe(false);
 });
 it.each([undefined,123,{password:'must-not-expose'},'', '\n\u0000'])('uses a fixed nonsensitive reason for malformed error reason %s', reason => {
  const {bridge,envelope}=fixture();bridge.receive({...envelope,type:'ragidle-map-actors-error',reason});
  expect(bridge.getDiagnostics().errorReason).toBe('Native actor renderer reported an error.');
 });
 it('limits valid textual reasons and removes control characters before exposing the diagnostic', () => {
  const {bridge,envelope}=fixture();bridge.receive({...envelope,type:'ragidle-map-actors-error',reason:'  GPU\nfailed\u0000 '+ 'x'.repeat(200)});
  const reason=bridge.getDiagnostics().errorReason!;
  expect(reason).toEqual(expect.any(String)); expect(reason.length).toBe(160); expect(reason.startsWith('GPU failed ')).toBe(true); expect(reason).not.toMatch(/[\u0000-\u001f\u007f]/);
 });
});
describe('native first action',()=>{
 it('pins the first decoded corpse when native has no ownership ACK or ready death textures',()=>{
  const {bridge,paint}=fixture(); const now=performance.now();
  expect(bridge.areActionTexturesReady(paint,now)).toBe(true);
  expect(bridge.canPaintActionNatively(paint,now)).toBe(false);
  const clock:CorpsePresentation={}; startCorpsePresentation(clock,now);
  expect(corpseFrameAt(clock,now,300,bridge.canPaintActionNatively(paint,now))).toEqual({elapsed:0,canvasOnly:true});
 });
 it('omits a cold death from native ownership for the complete Canvas death',()=>{
  const {bridge,messages,paint,envelope}=fixture(); const now=performance.now();
  paint.actor={kind:'monster',fallback:false,body:part(101)};
  paint.actor.body.action.actions=Array.from({length:40},(_,i)=>({delayMs:100,frames:(i===38?[0,1,2]:[3+i%20]).map(index=>({layers:[layer(index)],anchors:[]}))}));
  const idle={...paint,action:'idle'}; bridge.submit([idle],camera,100,100,now);
  const idleFrame=messages.at(-1).actors[0].layers[0].frame;
  bridge.receive({...envelope,type:'ragidle-map-actors-rendered',sequence:1,actors:['hero'],frames:[idleFrame]});
  const death={...paint,action:'dead'};
  expect(bridge.areActionTexturesReady(death,now)).toBe(false);
  const clock:CorpsePresentation={}; startCorpsePresentation(clock,now);
  const first=corpseFrameAt(clock,now,300,bridge.areActionTexturesReady(death,now))!;
  expect(first).toEqual({elapsed:0,canvasOnly:true});
  const owned=bridge.submit(first.canvasOnly?[]:[death],camera,100,100,now+50);
  expect(owned.size).toBe(0); expect(messages.at(-1).actors).toEqual([]);
  const next=corpseFrameAt(clock,now+100,300,true)!;
  expect(next.elapsed).toBeCloseTo(100); expect(next.canvasOnly).toBe(true);
 });
 it('waits for all current action textures only while native ownership has a recent ACK',()=>{
  const {bridge,messages,paint,envelope}=fixture();const now=performance.now();
  expect(bridge.areActionTexturesReady(paint,now)).toBe(true);
  bridge.submit([paint],camera,100,100,now);
  bridge.receive({...envelope,type:'ragidle-map-actors-rendered',sequence:1,actors:['hero'],frames:[]});
  expect(bridge.areActionTexturesReady(paint,now)).toBe(false);
  const ids=messages.filter(m=>m.frames).flatMap(m=>m.frames.map((f:any)=>f.id));
  bridge.receive({...envelope,type:'ragidle-map-actors-rendered',sequence:2,actors:['hero'],frames:ids});
  expect(bridge.areActionTexturesReady(paint,now)).toBe(true);
  expect(bridge.areActionTexturesReady({...paint,direction:7},now)).toBe(false);
  expect(bridge.areActionTexturesReady({...paint,direction:7},performance.now()+451)).toBe(true);
  expect(bridge.areActionTexturesReady({...paint,actor:{...paint.actor,fallback:true}},now)).toBe(true);
 });
 it('keeps pose identity across world movement but changes it for the following frame',()=>{
  const {bridge,messages,paint}=fixture();
  const submit=(next:any)=>{bridge.submit([next],camera,100,100,performance.now());return messages.at(-1).actors[0].poseToken;};
  const first=submit(paint);
  expect(submit({...paint,world:[1.5,0,.5]})).toBe(first);
  expect(submit({...paint,elapsed:100})).not.toBe(first);
 });
 it('accepts legacy ACK ownership while leaving drawn pose unknown',()=>{
  const {bridge,paint,envelope}=fixture();
  bridge.submit([paint],camera,100,100,performance.now());
  bridge.receive({...envelope,type:'ragidle-map-actors-rendered',sequence:1,actors:['hero'],frames:[]});
  expect(bridge.getDiagnostics('hero')).toMatchObject({drawnPose:null,poseHeld:null,heldNativeLayers:0});
  expect(bridge.submit([paint],camera,100,100,performance.now()).has('hero')).toBe(true);
 });
 it('prioritizes following action frames of body head weapon and trail',()=>{const {bridge,messages,paint}=fixture();bridge.submit([paint],camera,100,100,performance.now());expect(messages.find(m=>m.frames).frames.slice(0,12).map((f:any)=>f.rgba[0])).toEqual([101,111,121,131,102,112,122,132,103,113,123,133]);});
 it('prefetches a future action texture again after eviction',()=>{const {bridge,messages,paint,envelope}=fixture();bridge.submit([paint],camera,100,100,performance.now());bridge.submit([{...paint,elapsed:100}],camera,100,100,performance.now());const frames=messages.filter(m=>m.frames).flatMap(m=>m.frames);const future=frames.find((f:any)=>f.rgba[0]===102);bridge.receive({...envelope,type:'ragidle-map-actors-rendered',sequence:1,actors:['hero'],frames:frames.map((f:any)=>f.id)});bridge.receive({...envelope,type:'ragidle-map-actors-rendered',sequence:1,actors:['hero'],frames:frames.filter((f:any)=>f!==future).map((f:any)=>f.id),evicted:[future.id]});messages.length=0;bridge.submit([paint],camera,100,100,performance.now());expect(messages.find(m=>m.frames)?.frames.some((f:any)=>f.id===future.id)).toBe(true);});
 it('reports a held drawn pose independently from requested pose and ownership',()=>{const {bridge,messages,paint,envelope}=fixture();bridge.submit([paint],camera,100,100,performance.now());const requested=messages.find(m=>m.actors).actors[0].poseToken;expect(typeof requested).toBe('string');bridge.receive({...envelope,type:'ragidle-map-actors-rendered',sequence:1,actors:['hero'],frames:[],poses:[{id:'hero',requested,drawn:'idle-token',held:true}]});expect((bridge.getDiagnostics as any)('hero')).toMatchObject({requestedPose:requested,drawnPose:'idle-token',poseHeld:true,heldNativeLayers:1,heldPoseAcks:1});expect(bridge.submit([paint],camera,100,100,performance.now()).has('hero')).toBe(true);bridge.receive({...envelope,type:'ragidle-map-actors-rendered',sequence:0,actors:['hero'],frames:[],poses:[{id:'hero',requested,drawn:requested,held:false}]});expect((bridge.getDiagnostics as any)('hero').drawnPose).toBe('idle-token');});
 it('native draw ACK reports retained idle until attack texture arrives',()=>{
 const patch=readFileSync(new URL('../../docker/web-client/mapviewer-idle.patch',import.meta.url),'utf8');const source=patch.split('@@ -0,0 +1,')[1].split('\n').slice(1).filter(l=>l.startsWith('+')).map(l=>l.slice(1)).join('\n').split('export default')[0].replace(/^import .*;$/gm,'');
 const messages:any[]=[];const gl:any={NO_ERROR:0,getError:()=>0,isContextLost:()=>false,getParameter:()=>false,createTexture:()=>({})};for(const name of ['deleteTexture','activeTexture','bindTexture','pixelStorei','texImage2D','texParameteri','enable','depthMask'])gl[name]=()=>{};
 const api=runInNewContext(source+'\n({receive,render})',{Uint8ClampedArray,performance,window:{parent:{postMessage:(data:any)=>messages.push(data)}},Altitude:{},Ground:{getShadowFactor:()=>1},WebGL:{},SpriteRenderer:{bind3DContext:()=>{},unbind:()=>{},runWithDepth:(_a:any,_b:any,_c:any,fn:any)=>fn(),position:{set:()=>{}},offset:{set:()=>{}},size:{set:()=>{}},color:{set:()=>{}},image:{},render:()=>{}}});
 const receive=(data:any)=>api.receive({map:'fixture',session:'00000000-0000-0000-0000-000000000001',...data},'https://fixture','fixture',[0,0],gl);const frame=(id:string)=>({id,width:1,height:1,rgba:new Uint8ClampedArray(4)});const pose=(poseToken:string,id:string)=>({id:'hero',poseToken,world:[.5,0,.5],layers:[{frame:id,x:0,y:0,width:1,height:1,angle:0,color:[1,1,1,1]}]});
 receive({type:'ragidle-map-actors-init'});receive({type:'ragidle-map-actor-frames',frames:[frame('f1')]});receive({type:'ragidle-map-actors',sequence:1,actors:[pose('idle-token','f1')]});api.render(100,gl,[],[],{});receive({type:'ragidle-map-actors',sequence:2,actors:[pose('attack-token','f2')]});api.render(110,gl,[],[],{});expect(messages.at(-1).poses).toEqual([{id:'hero',requested:'attack-token',drawn:'idle-token',held:true}]);receive({type:'ragidle-map-actor-frames',frames:[frame('f2')]});api.render(120,gl,[],[],{});expect(messages.at(-1).poses).toEqual([{id:'hero',requested:'attack-token',drawn:'attack-token',held:false}]);
 });
});
