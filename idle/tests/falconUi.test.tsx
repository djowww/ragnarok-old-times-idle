// @vitest-environment jsdom
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {describe,expect,it} from 'vitest';
import data from '../content/catalog.json';
import type {Catalog} from '../shared/types';
import {createInitialState,getSnapshot} from '../engine';
import {skillReadiness} from '../web/App';
import Build from '../web/panels/Build';
const c=data as unknown as Catalog;
async function render(state:ReturnType<typeof createInitialState>,catalog=c){
 const commands:unknown[]=[],host=document.createElement('div'),root=createRoot(host);
 await act(async()=>root.render(createElement(Build,{catalog,snapshot:getSnapshot(state,catalog,0),busy:false,mode:'skills',command:async command=>{commands.push(command);return true;}})));
 const row=[...host.querySelectorAll('.skill-row')].find(row=>row.querySelector('h4')?.textContent?.includes(c.skills.ht_falcon.name))!;
 return{host,root,row,commands};
}
function setup(){const s=createInitialState(c,0);s.job='hunter';s.learnedSkills={ht_falcon:1,ac_concentration:1};s.zeny=10000;return s;}
describe('Falcon rental and readiness UI',()=>{
 it('shows the fixed native fee and dispatches the rental command',async()=>{
  const view=await render(setup());try{
   expect(view.row.textContent).toContain('Falcão ausente');const button=[...view.row.querySelectorAll('button')].find(b=>b.textContent?.includes('Alugar falcão'))!;expect(button).toBeDefined();expect(button.disabled).toBe(false);expect(button.textContent).toContain('2.500');
   await act(async()=>button.click());expect(view.commands).toContainEqual({type:'rentFalcon'});expect(view.row.textContent).not.toContain('Usar na rotação');
  }finally{await act(async()=>view.root.unmount());}
 });
 it('offers free dismissal in the field after equipment',async()=>{
  const s=setup();s.status='resting';s.falconEquipped=true;const view=await render(s);try{
   expect(view.row.textContent).toContain('Falcão equipado');const button=[...view.row.querySelectorAll('button')].find(b=>b.textContent?.includes('Dispensar falcão'))!;expect(button.disabled).toBe(false);await act(async()=>button.click());expect(view.commands).toContainEqual({type:'dismissFalcon'});
  }finally{await act(async()=>view.root.unmount());}
 });
 it.each(['city','money','learned'])('disables rental when lacking %s',async(why)=>{
  const s=setup();if(why==='city')s.status='resting';if(why==='money')s.zeny=2499;if(why==='learned')s.learnedSkills.ht_falcon=0;const view=await render(s);try{const b=[...view.row.querySelectorAll('button')].find(b=>b.textContent?.includes('Alugar falcão'))!;expect(b.disabled).toBe(true);}finally{await act(async()=>view.root.unmount());}
 });
 it('explains why a learned Blitz cannot start without the Falcon',()=>{
  const s=setup();s.learnedSkills.blitz_beat=5;const snap=getSnapshot(s,c,0);expect(JSON.stringify(skillReadiness(c.skills.blitz_beat,s,snap.stats,c,0))).toContain('falcão não equipado');
 });
});

describe('Detect manual and AFK controls',()=>{
 it('offers a self-centered manual action and the real rotation button',async()=>{
  const catalog=structuredClone(c),skill=catalog.skills.ht_detecting;skill.implementation='supported';skill.manualUse='activate';delete skill.unsupportedReason;
  const s=setup();s.falconEquipped=true;s.learnedSkills.ht_detecting=4;const view=await render(s,catalog);try{
   const row=[...view.host.querySelectorAll('.skill-row')].find(row=>row.querySelector('h4')?.textContent?.includes(skill.name))!;
   const manual=[...row.querySelectorAll('button')].find(b=>b.textContent==='Detectar ao redor');expect(manual).toBeDefined();expect(manual!.disabled).toBe(false);
   await act(async()=>manual!.click());expect(view.commands).toContainEqual({type:'useSkill',skillId:skill.id});
   const rotate=[...row.querySelectorAll('button')].find(b=>b.textContent==='Usar na rotação');expect(rotate).toBeDefined();await act(async()=>rotate!.click());expect(view.commands).toContainEqual({type:'setRotation',skillIds:[...s.rotation,skill.id]});
  }finally{await act(async()=>view.root.unmount());}
 });
 it('explains the useful AFK concealment condition',()=>{
  const catalog=structuredClone(c),skill=catalog.skills.ht_detecting;skill.implementation='supported';skill.manualUse='activate';delete skill.unsupportedReason;
  const s=setup();s.falconEquipped=true;s.learnedSkills.ht_detecting=4;const snap=getSnapshot(s,catalog,0);expect(skillReadiness(skill,s,snap.stats,catalog,0).label).toContain('aguardando inimigo oculto na área');
 });
});
