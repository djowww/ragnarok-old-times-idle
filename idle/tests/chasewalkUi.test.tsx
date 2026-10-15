// @vitest-environment jsdom
import { act,createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe,expect,it } from 'vitest';
import raw from '../content/catalog.json';
import type { Catalog } from '../shared/types';
import { createInitialState,getSnapshot } from '../engine';
import Build from '../web/panels/Build';
describe('manual ChaseWalk controls',()=>{
  it('uses the manual cast endpoint and does not suggest AFK rotation',async()=>{
    const c=structuredClone(raw) as unknown as Catalog;
    Object.assign(c.skills.st_chasewalk,{name:'Furtividade',implementation:'supported',manualUse:'toggle'});
    const s=createInitialState(c,0); s.job='stalker';s.learnedSkills={st_chasewalk:5};s.sp=200;s.rotation=[];
    const commands:unknown[]=[],host=document.createElement('div'),root=createRoot(host);
    try {
      await act(async()=>root.render(createElement(Build,{catalog:c,snapshot:getSnapshot(s,c,0),busy:false,mode:'skills',command:async value=>{commands.push(value);return true;}})));
      const row=[...host.querySelectorAll('.skill-row')].find(row=>row.querySelector('h4')!.textContent!.includes('Furtividade'))!;
      expect(row.querySelector('.skill-icon')).not.toBeNull();expect(row.textContent).not.toContain('Usar na rotação');
      const button=[...row.querySelectorAll('button')].find(button=>button.textContent==='Ativar')!;
      expect(button.disabled).toBe(false);await act(async()=>button.click());
      expect(commands).toEqual([{type:'useSkill',skillId:'st_chasewalk'}]);
    }finally{await act(async()=>root.unmount());}
  });
});
