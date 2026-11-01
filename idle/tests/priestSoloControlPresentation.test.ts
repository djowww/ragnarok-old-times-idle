import {describe,it,expect,vi,afterEach} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {getSnapshot} from '../engine';
import Scene from '../web/components/Scene';
import {priestSetup} from './priest-control-fixture';
afterEach(()=>vi.unstubAllGlobals());
describe('Monster control readout',()=>{
 it('shows active Blind and Silence on the correct actor until actual expiration',()=>{
  vi.stubGlobal('window',{location:{hostname:'localhost',protocol:'http:'}});
  const {s,c,e}=priestSetup();e.statuses={SC_BLIND:{level:1,startsAt:0,expiresAt:1000},SC_SILENCE:{level:1,startsAt:0,expiresAt:2000}};
  const render=(at:number)=>renderToStaticMarkup(createElement(Scene,{catalog:c,snapshot:getSnapshot(s,c,at),busy:false,command:async()=>true}));
  expect(render(500)).toContain('Cegueira · Silêncio');expect(render(1000)).not.toContain('Cegueira ·');expect(render(2000)).not.toContain('Silêncio');
 });
});
