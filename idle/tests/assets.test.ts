import { describe, expect, it } from 'vitest';
import { decodeSPR } from '../web/assets/sprite';
import { decodeACT } from '../web/assets/action';
import { decodeBMP } from '../web/assets/items';
// Independent binary fixtures written from the SPR/ACT/BMP format layouts.
function binary(size: number, setup: (v: DataView, b: Uint8Array) => void) { const b = new Uint8Array(size); setup(new DataView(b.buffer), b); return b.buffer; }
describe('sprite assets', () => {
    it('makes indexed palette zero transparent while preserving visible palette colors', () => {
        const spr = binary(1036, (v, b) => { b.set([83, 80, 1, 1]); v.setUint16(4, 1, true); v.setUint16(6, 2, true); v.setUint16(8, 1, true); b.set([0, 1], 10); b.set([250, 10, 20, 255], 1036 - 1024 + 4); });
        const frame = decodeSPR(spr).frames[0];
        expect(frame.width).toBe(2);
        expect([...frame.rgba]).toEqual([0, 0, 0, 0, 250, 10, 20, 255]);
    });
    it('reads ACT offsets, mirror, scale, rotation and anchors', () => {
        const act = binary(176, (v, b) => { b.set([65, 67, 4, 2]); v.setUint16(4, 1, true); v.setUint32(16, 1, true); v.setUint32(52, 1, true); v.setInt32(56, -12, true); v.setInt32(60, 9, true); v.setInt32(64, 0, true); v.setInt32(68, 1, true); b.set([128, 255, 255, 200], 72); v.setFloat32(76, 2, true); v.setFloat32(80, 3, true); v.setInt32(84, 90, true); v.setInt32(88, 0, true); v.setInt32(92, -1, true); v.setInt32(96, 1, true); v.setInt32(104, 7, true); v.setInt32(108, -4, true); v.setInt32(112, 0, true); v.setInt32(116, 0, true); v.setFloat32(120, 4, true); });
        // Trim to the actual end: one frame + one anchor + zero sounds + one delay.
        const decoded = decodeACT(act.slice(0, 124));
        expect(decoded.actions[0].frames[0].layers[0]).toMatchObject({ x: -12, y: 9, mirror: true, scaleX: 2, scaleY: 3, rotation: 90 });
        expect(decoded.actions[0].frames[0].anchors[0]).toMatchObject({ x: 7, y: -4 });
        expect(decoded.actions[0].delayMs).toBe(100);
    });
    it('turns BMP magenta transparent and honors bottom-up padded rows', () => {
        const bmp = binary(62, (v, b) => { b.set([66, 77]); v.setUint32(2, 62, true); v.setUint32(10, 54, true); v.setUint32(14, 40, true); v.setInt32(18, 2, true); v.setInt32(22, 1, true); v.setUint16(26, 1, true); v.setUint16(28, 24, true); b.set([255, 0, 255, 30, 20, 10, 0, 0], 54); });
        expect([...decodeBMP(bmp).rgba]).toEqual([255, 0, 255, 0, 10, 20, 30, 255]);
    });
    it('rejects truncated binary resources as recoverable errors', () => {
        expect(() => decodeSPR(new Uint8Array([83, 80, 1, 1]).buffer)).toThrow(/truncated/i);
        expect(() => decodeACT(new Uint8Array([65, 67, 4, 2]).buffer)).toThrow(/truncated/i);
        expect(() => decodeBMP(new Uint8Array([66, 77]).buffer)).toThrow(/truncated/i);
    });
});
// Removing ACT anchors or applying RGBA layer indexes to palette frames breaks head alignment.
describe('actor composition', () => {
    it('aligns head/body anchors and resolves RGBA layer indices', async () => {
        const { getActorPose } = await import('../web/assets/renderer');
        const image = { width: 2, height: 1, rgba: new Uint8ClampedArray(8), type: 0 as const };
        const layer = { x: 3, y: 4, index: 0, mirror: false, color: [255, 255, 255, 255], scaleX: 1, scaleY: 1, rotation: 0, type: 0, width: 0, height: 0 };
        const body: any = { sprite: { version: 2.1, indexedCount: 1, frames: [image, { ...image, type: 1 }] }, action: { version: 2.4, sounds: [], actions: [{ delayMs: 100, frames: [{ layers: [{ ...layer, type: 1 }], anchors: [{ x: 0, y: -20 }], sound: -1 }] }] } };
        const head = { sprite: body.sprite, action: { ...body.action, actions: [{ delayMs: 100, frames: [{ layers: [layer], anchors: [{ x: 1, y: 2 }], sound: -1 }] }] } };
        const pose = getActorPose({ kind: 'character', fallback: false, body, head }, 'idle', 0);
        expect(pose[0].image.type).toBe(1);
        expect(pose[1]).toMatchObject({ x: 2, y: -18 });
    });
    it('uses elapsed milliseconds and gracefully falls back from unavailable attack actions', async () => {
        const { getActorPose } = await import('../web/assets/renderer');
        const images = [0, 1].map(n => ({ width: 1, height: 1, type: 0, rgba: new Uint8ClampedArray([n, 0, 0, 255]) }));
        const layers = images.map((_, index) => ({ x: 0, y: 0, index, mirror: false, color: [255, 255, 255, 255], scaleX: 1, scaleY: 1, rotation: 0, type: 0, width: 0, height: 0 }));
        const actor: any = { fallback: false, body: { sprite: { indexedCount: 2, frames: images }, action: { actions: [{ delayMs: 100, frames: layers.map(layer => ({ layers: [layer], anchors: [] })) }] } } };
        expect(getActorPose(actor, 'attack', 100)[0].image.rgba[0]).toBe(1);
        expect(getActorPose(actor, 'dead', 200)[0].image.rgba[0]).toBe(0);
    });
});
// Opt-in local integration: client binaries are fetched, never written to the repository.
describe.skipIf(!process.env.IDLE_ASSET_ORIGIN)('installed local client resources', () => {
    it('decodes Poring, skeleton alias, novice body/head and Red Potion', async () => {
        const { default: catalog } = await import('../content/catalog.json');
        const paths = [catalog.monsters['1002'].sprite.spr, catalog.monsters['1002'].sprite.act, catalog.monsters['1028'].sprite.spr, catalog.monsters['1028'].sprite.act, catalog.classes.novice.sprite.male.spr, catalog.classes.novice.sprite.male.act, catalog.classes.novice.sprite.male.headSpr, catalog.classes.novice.sprite.male.headAct, catalog.items['501'].resource];
        for (const path of paths) {
            const response = await fetch(process.env.IDLE_ASSET_ORIGIN + '/' + path.split('/').map(encodeURIComponent).join('/'));
            expect(response.status, path).toBe(200);
            const buffer = await response.arrayBuffer();
            if (path.endsWith('.spr'))
                expect(decodeSPR(buffer).frames.length, path).toBeGreaterThan(0);
            else if (path.endsWith('.act'))
                expect(decodeACT(buffer).actions.length, path).toBeGreaterThan(0);
            else
                expect(decodeBMP(buffer).width, path).toBeGreaterThan(0);
        }
    });
});

describe('additional sprite representations',()=>{
    it('decodes SPR zero runs without treating run length as a palette color',()=>{
        const spr=binary(1042,(v,b)=>{b.set([83,80,1,2]);v.setUint16(4,1,true);v.setUint16(8,4,true);v.setUint16(10,1,true);v.setUint16(12,4,true);b.set([1,0,2,1],14);b.set([9,8,7,0],22);});
        expect([...decodeSPR(spr).frames[0].rgba]).toEqual([9,8,7,255,0,0,0,0,0,0,0,0,9,8,7,255]);
    });
    it('decodes bottom-up ABGR true-color SPR into top-down RGBA',()=>{
        const spr=binary(20,(v,b)=>{b.set([83,80,0,2]);v.setUint16(6,1,true);v.setUint16(8,1,true);v.setUint16(10,2,true);b.set([128,30,20,10,255,60,50,40],12);});
        expect([...decodeSPR(spr).frames[0].rgba]).toEqual([40,50,60,255,10,20,30,128]);
    });
});

describe('actor action families', () => {
    it('selects character combat actions separately from monster combat actions', async () => {
        const { getActorPose } = await import('../web/assets/renderer');
        const image = { width: 1, height: 1, type: 0 as const, rgba: new Uint8ClampedArray([255, 0, 0, 255]) };
        const layer = {x:0,y:0,index:0,mirror:false,color:[255,255,255,255] as [number,number,number,number],scaleX:1,scaleY:1,rotation:0,type:0,width:0,height:0};
        const body = {sprite:{version:2.1,indexedCount:1,frames:[image]},action:{version:2.5,sounds:[],actions:Array.from({length:72},(_,index)=>({delayMs:100,frames:[{layers:[{...layer,x:index}],anchors:[],sound:-1}]}))}};
        const character:any = {kind:'character',fallback:false,body,head:body};
        const monster:any = {kind:'monster',fallback:false,body};
        expect(['idle','attack','hurt','dead'].map(action=>getActorPose(character,action as any,0)[0].x)).toEqual([0,40,48,64]);
        expect(['idle','attack','hurt','dead'].map(action=>getActorPose(monster,action as any,0)[0].x)).toEqual([0,16,24,32]);
        expect(getActorPose(character,'attack',0)[1].x).toBe(40);
        // Numeric callers still select an explicit ACT action rather than a family mapping.
        expect(getActorPose(character,16,0)[0].x).toBe(16);
    });
});

describe('actor classification during loading failure',()=>{
    it('keeps the player discriminator when body-only or head-bearing assets fail',async()=>{
        const {loadActor,getActorPose}=await import('../web/assets/renderer');
        const bodyOnly=await loadActor({spr:'data/sprite/인간족/몸통/남/missing.spr',act:'missing.act'});
        const headed=await loadActor({spr:'missing-body.spr',act:'missing-body.act',headSpr:'missing-head.spr',headAct:'missing-head.act'});
        const monster=await loadActor({spr:'data/sprite/몬스터/missing.spr',act:'missing-monster.act'});
        expect(bodyOnly).toMatchObject({kind:'character',fallback:true});
        expect(headed).toMatchObject({kind:'character',fallback:true});
        expect(monster).toMatchObject({kind:'monster',fallback:true});
        expect(getActorPose(bodyOnly,'attack',0)).toEqual([]);
    });
});
