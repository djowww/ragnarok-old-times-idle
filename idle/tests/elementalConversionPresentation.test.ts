import {describe,it,expect,vi,afterEach} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {getSnapshot} from '../engine';
import Scene from '../web/components/Scene';
import Build from '../web/panels/Build';
import {conversionSetup} from './elemental-conversion-fixture';
afterEach(()=>vi.unstubAllGlobals());
describe('elemental property presentation',()=>{
 it('labels the correct monster property and level only until expiry',()=>{
  vi.stubGlobal('window',{location:{hostname:'localhost',protocol:'http:'}});
  const {s,c,e}=conversionSetup();e.statuses={SC_ARMOR_PROPERTY:{level:1,element:'fire',elementLevel:3,expiresAt:1000}};
  const render=(at:number)=>renderToStaticMarkup(createElement(Scene,{catalog:c,snapshot:getSnapshot(s,c,at),busy:false,command:async()=>true}));
  expect(render(500)).toContain('Fogo Nv. 3');expect(render(1000)).not.toContain('Fogo Nv. 3');
 });
 it('offers manual craft navigation without an automatic-rotation button',()=>{
  vi.stubGlobal('window',{location:{hostname:'localhost',protocol:'http:'}});
  const {s,c}=conversionSetup();s.status='town';s.battle=null;s.learnedSkills.sa_createcon=1;c.skills.sa_createcon.implementation='supported';c.skills.sa_createcon.manualUse='converterCraft';
  const html=renderToStaticMarkup(createElement(Build,{catalog:c,snapshot:getSnapshot(s,c,0),busy:false,command:async()=>true,mode:'skills',onOpenConverters:()=>{}}));
  expect(html).toContain('Produzir conversores');
 });
});
