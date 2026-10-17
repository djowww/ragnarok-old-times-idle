import {afterEach,describe,expect,it,vi} from 'vitest';
import raw from '../content/catalog.json';import type {Catalog} from '../shared/types';
import {getActorPose,loadActor} from '../web/assets/renderer';
const catalog=raw as unknown as Catalog;
afterEach(()=>vi.unstubAllGlobals());
describe('original monster resource matrix',()=>{
 it.skipIf(!process.env.IDLE_ASSET_ORIGIN)('decodes every catalog monster and composes eight visible idle directions',async()=>{
  const base=process.env.IDLE_ASSET_ORIGIN!.replace(/\/+$/,'');const fetchRemote=globalThis.fetch.bind(globalThis);
  vi.stubGlobal('fetch',(input:string|URL|Request,init?:RequestInit)=>{
   const relative=String(input);if(!relative.startsWith('/assets/'))throw Error('Unexpected non-asset request');return fetchRemote(base+relative,init);
  });
  for(const monster of Object.values(catalog.monsters)){
   const actor=await loadActor(monster.sprite);expect(actor.fallback,monster.name).toBe(false);expect(actor.error,monster.name).toBeUndefined();expect(actor.body,monster.name).toBeDefined();
   for(let direction=0;direction<8;direction++){
    const pose=getActorPose(actor,'idle',0,direction);expect(pose.length,`${monster.name} direction ${direction}`).toBeGreaterThan(0);
    expect(pose.every(layer=>[layer.x,layer.y,layer.scaleX,layer.scaleY,layer.rotation].every(Number.isFinite))).toBe(true);
    expect(pose.some(layer=>layer.image.width>0&&layer.image.height>0&&layer.color[3]>0)).toBe(true);
   }
  }
 },180000);
});
