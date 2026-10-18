import {useState} from 'react';
import {ItemIcon,number,type PanelProps} from '../components/common';
import {arrowRecipe} from '../../engine/arrowCraft';
import {classSkills} from '../../engine/stats';
export default function ArrowCraft({catalog,snapshot,busy,command}:PanelProps){
 const {state}=snapshot,menu=state.arrowCraftMenu;
 const [selected,setSelected]=useState('');
 const skill=classSkills(catalog,state.job).map(id=>catalog.skills[id]).find(k=>k.sourceName==='AC_MAKINGARROW');
 const offers=(menu?.offered??[]).flatMap(o=>{const entry=state.inventory.find(e=>e.uid===o.uid);return entry?[entry]:[];});
 const entry=offers.find(e=>e.uid===selected)??offers[0],item=entry&&catalog.items[entry.itemId],recipe=entry&&arrowRecipe(entry.itemId);
 return <div className="blacksmith-service">
  <header className="service-panel-intro"><div><h3>Criar Flechas</h3><p>Transforme um material identificado em flechas. A escolha consome uma unidade.</p></div></header>
  {!menu?<><p>Abrir a lista consome SP da habilidade, mesmo se você cancelar ou não tiver materiais.</p>
   <button type="button" className="primary" disabled={busy||!skill||!(state.learnedSkills[skill.id]>0)} onClick={()=>{if(skill)void command({type:'useSkill',skillId:skill.id});}}>Abrir lista de materiais</button></>:<>
   <p role="status">O SP da ativação já foi consumido.</p>
   <label htmlFor="arrow-material">Material para transformar</label>
   <select id="arrow-material" value={entry?.uid??''} disabled={busy} onChange={e=>setSelected(e.currentTarget.value)}>
    {offers.map(e=><option key={e.uid} value={e.uid}>{catalog.items[e.itemId]?.name??e.itemId} · {number(e.quantity)} na mochila{e.refine?` · +${e.refine}`:''}</option>)}
   </select>
   {item&&<div className="blacksmith-ore-card"><ItemIcon item={item}/><div><b>Consumir 1 × {item.name}</b>
    {item.type==='equipment'&&<p role="alert">Este equipamento será consumido, incluindo refino, cartas e bônus. Confira sua escolha.</p>}</div></div>}
   <h4>Você receberá</h4><div className="blacksmith-refine-list">{recipe?.outputs.map(o=><article className="blacksmith-ore-card" key={o.itemId}>
    <ItemIcon item={catalog.items[o.itemId]}/><b>{number(o.quantity)} × {catalog.items[o.itemId]?.name}</b></article>)}</div>
   <div className="row"><button type="button" className="primary" disabled={busy||!entry} onClick={()=>{if(entry)void command({type:'craftArrows',menuId:menu.id,uid:entry.uid});}}>Consumir material e criar flechas</button>
    <button type="button" disabled={busy} onClick={()=>void command({type:'cancelArrowCraft',menuId:menu.id})}>Cancelar</button></div>
  </>}
 </div>;
}
