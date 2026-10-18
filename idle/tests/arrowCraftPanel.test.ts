import {expect,it} from 'vitest';
import {createElement} from 'react';import {renderToStaticMarkup} from 'react-dom/server';
import ArrowCraft from '../web/panels/ArrowCraft';
import {createInitialState,getSnapshot} from '../engine/index';
import {openArrowCraft} from '../engine/arrowCraft';
import raw from '../content/catalog.json';import type {Catalog} from '../shared/types';
function setup(itemId=713){const c=raw as unknown as Catalog,s=createInitialState(c,1000);s.job='archer';s.hp=50;s.sp=100;s.learnedSkills.ac_makingarrow=1;s.equipment={};s.inventory=[{uid:'material',itemId,quantity:1,refine:0,cards:[],favorite:false,identified:true}];
 return {s,c,render:(busy=false)=>renderToStaticMarkup(createElement(ArrowCraft,{catalog:c,snapshot:getSnapshot(s,c,1000),busy,command:async()=>true}))};}
it('explains the paid opening and shows exact output before confirmation',()=>{
 const {s,c,render}=setup();expect(render()).toContain('Abrir lista de materiais');openArrowCraft(s,c,1000);
 const html=render();expect(html).toContain('Consumir 1');expect(html).toContain('Iron Arrow');expect(html).toContain('2');expect(html).toContain('Cancelar');expect(html).toContain('SP da ativação já foi consumido');
});
it('warns explicitly that equipment, cards and bonuses are consumed',()=>{
 const {s,c,render}=setup(2257);openArrowCraft(s,c,1000);expect(render()).toContain('incluindo refino, cartas e bônus');expect(render(true)).toContain('disabled=""');
});
