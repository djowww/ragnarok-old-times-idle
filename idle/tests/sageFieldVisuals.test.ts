import { describe, expect, it } from 'vitest';
import { sageFieldTexture, propertyGroundPixels, propertyGroundScale, visibleSageField, projectFieldCell, sageFieldQuads } from '../web/assets/sageFieldVisuals';
import { castSetup } from './cast-control-fixture';
import { placeSageField } from '../engine/sageFields';
import type { GameState } from '../shared/types';
import type { MapProjection } from '../web/assets/mapProjection';
const api={ sageFieldTexture, propertyGroundPixels, propertyGroundScale, visibleSageField, projectFieldCell, sageFieldQuads };
describe('original Sage ground art and fixed GAT presentation',()=>{
  it.each([['SA_VOLCANO','ring_red'],['SA_DELUGE','ring_blue'],['SA_VIOLENTGALE','ring_yellow']])('uses the pinned%s texture',(source,name)=>{
    expect(api.sageFieldTexture?.(source)).toBe(`data/texture/effect/${name}.tga`);
  });
  it('implements source alpha/discard without modifying the original texture',()=>{
    const pixels=new Uint8ClampedArray([255,255,255,0,127,255,255,255,128,128,128,1,255,255,255,255]);
    expect([...api.propertyGroundPixels?.(pixels)??[]]).toEqual([255,255,255,0,127,255,255,0,128,128,128,107,255,255,255,107]);
    expect(pixels[11]).toBe(1);
  });
  it('keeps the source pulse between0.5 and1, and disables it for reduced motion',()=>{
    expect(api.propertyGroundScale?.(0,0)).toBe(.5);
    expect(api.propertyGroundScale?.(180*Math.PI*Math.PI,0)).toBeCloseTo(1);
    expect(api.propertyGroundScale?.(9999,5,true)).toBe(1);
  });
  it('hides expired, dead, wrong-owner and wrong-map fields',()=>{
    const {s,c}=castSetup(); placeSageField(s,c,c.skills.sa_volcano,1,0,{x:.48,y:.65});
    s.elementalField!.map='prontera';
    expect(api.visibleSageField?.(s,'prontera',1)).toBe(s.elementalField);
    expect(api.visibleSageField?.(s,'prt_in',1)).toBeUndefined();
    expect(api.visibleSageField?.(s,'prontera',60000)).toBeUndefined();
    s.hp=0; expect(api.visibleSageField?.(s,'prontera',1)).toBeUndefined();
    s.hp=1; s.elementalField!.ownerActorId='other'; expect(api.visibleSageField?.(s,'prontera',1)).toBeUndefined();
  });
  it('projects the same cell world coordinates after the camera focus/scene origin changes',()=>{
    const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
    const camera:MapProjection={map:'prontera',modelView:identity,projection:identity,focus:[10,0,10],viewport:{width:800,height:600},
      ground:{x:0,y:0,size:20,heights:Array(400).fill(0)}};
    const before=api.projectFieldCell?.(camera,{x:5,y:7},1,800,600);
    expect(before).toHaveLength(4);
    camera.focus=[15,3,15]; camera.sceneFocus=[15,3,15];
    expect(api.projectFieldCell?.(camera,{x:5,y:7},1,800,600)).toEqual(before);
    expect(api.projectFieldCell?.(camera,{x:50,y:7},1,800,600)).toBeUndefined();
  });
  it('renders only server-clipped cells and keeps fallback placement fixed as the caster moves',()=>{
    const {s,c}=castSetup(); placeSageField(s,c,c.skills.sa_volcano,1,0,{x:.48,y:.65});
    s.elementalField!.map='prontera'; s.elementalField!.cells.pop();
    const before=api.sageFieldQuads?.(s,'prontera',1,null,800,600,true);
    expect(before).toHaveLength(48);
    s.fieldHero={areaId:s.areaId!,from:{x:2,y:2},position:{x:2,y:2},startedAt:0,arrivedAt:0,routeIndex:0};
    expect(api.sageFieldQuads?.(s,'prontera',1,null,800,600,true)).toEqual(before);
    expect(api.sageFieldQuads?.(s,'prontera',1,null,800,600,true,true)).toEqual([]);
  });
});
