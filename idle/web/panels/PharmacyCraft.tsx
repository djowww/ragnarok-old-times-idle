import { useState } from 'react';
import { pharmacyCraftPreview, pharmacyRecipes } from '../../engine/pharmacyCraft';
import { ItemIcon, itemName, number, type PanelProps } from '../components/common';
import '../styles/pharmacy-craft.css';
const RECIPES = pharmacyRecipes();
const PENDING: Record<number,string> = {
  545:"O efeito de cura desta poção compacta ainda está indisponível.",546:"O efeito de cura desta poção compacta ainda está indisponível.",547:"O efeito de cura desta poção compacta ainda está indisponível.",
  7137:'Invocar plantas ainda está indisponível.', 7138:'Invocar esferas marinhas ainda está indisponível.',
  7139:'Revestimento químico ainda está indisponível.', 7142:'O sistema de homúnculos ainda está indisponível.',
  605:'O efeito de Vigor deste consumível ainda está indisponível.',606:'O efeito de Provocar deste consumível ainda está indisponível.',
  12118:'O efeito de resistência deste consumível ainda está indisponível.',12119:'O efeito de resistência deste consumível ainda está indisponível.',
  12120:'O efeito de resistência deste consumível ainda está indisponível.',12121:'O efeito de resistência deste consumível ainda está indisponível.',
};
const format = (n:number) => Number.isFinite(n) ? n.toLocaleString('pt-BR',{maximumFractionDigits:2}) : '—';
const chance = (n:number) => format(Math.min(100,Math.max(0,n/100)));
export default function PharmacyCraft({catalog,snapshot,busy,command}:PanelProps) {
  const [itemId,setItemId]=useState(501),[quantity,setQuantity]=useState(1);
  const {state}=snapshot, p=pharmacyCraftPreview(state,catalog,itemId,quantity,snapshot.serverTime);
  const item=catalog.items[itemId], valid=Number.isSafeInteger(quantity)&&quantity>=1&&quantity<=1000;
  const result=[...state.events].reverse().find(e=>e.kind==='craft'&&e.skillId===p.skillId);
  const name=(id:number)=>catalog.items[id]?itemName(catalog.items[id]):`Item ${id}`;
  const icon=(id:number)=>catalog.items[id]?<ItemIcon item={catalog.items[id]}/>:null;
  return <div className="pharmacy-craft">
    <header className="pharmacy-intro">{icon(7134)}<div><h3>Produção e veneno</h3><p>Receitas do Alquimista e Veneno Mortal</p></div></header>
    <div className="pharmacy-workbench">
      <section className="pharmacy-recipes" aria-label="Receitas de Preparar Poção">
        <label className="pharmacy-recipe-select">Receita<select value={itemId} disabled={busy} onChange={e=>{setItemId(Number(e.currentTarget.value));setQuantity(1);}}>
          {[...new Set(RECIPES.map(r=>r.category))].map(category=><optgroup key={category} label={category}>
            {RECIPES.filter(r=>r.category===category).map(r=><option key={r.outputItemId} value={r.outputItemId}>{name(r.outputItemId)}</option>)}
          </optgroup>)}
        </select></label>
        <div className="pharmacy-recipe-list">{RECIPES.map(r=><button type="button" className="pharmacy-recipe" key={r.outputItemId} disabled={busy||!catalog.items[r.outputItemId]} aria-pressed={r.outputItemId===itemId} onClick={()=>{setItemId(r.outputItemId);setQuantity(1);}}>
          {icon(r.outputItemId)}<span>{name(r.outputItemId)}<small>{r.category}</small></span>
        </button>)}</div>
      </section>
      <section className="pharmacy-detail" aria-label="Materiais e fabricação">
        <header className="pharmacy-product">{item&&<ItemIcon item={item}/>}<div><h4>{name(itemId)}</h4><p>Chance por tentativa: <b>{chance(p.chanceMin)}{chance(p.chanceMin)===chance(p.chanceMax)?'':`–${chance(p.chanceMax)}`}%</b></p></div></header>
        <div className="pharmacy-materials">
          {p.guide&&<article className={`pharmacy-material pharmacy-guide${p.guide.owned<1?' is-missing':''}`}>{icon(p.guide.itemId)}<div><b>{name(p.guide.itemId)}</b><small>Necessário na mochila · não consumido</small><small>{p.guide.owned?'Manual disponível':'Falta o manual'}</small></div></article>}
          <h5>Materiais para {valid?number(quantity):'—'} tentativas</h5>
          {p.ingredients.map(i=><article className={`pharmacy-material${i.missing?' is-missing':''}`} key={i.itemId}>{icon(i.itemId)}<div><b>{name(i.itemId)}</b><small>Necessário: {valid?number(i.quantity):'—'} · Na mochila: {number(i.owned)}</small>{i.missing>0&&<small>Faltam {number(i.missing)}</small>}</div></article>)}
          {PENDING[itemId]&&<p className="pharmacy-product-note">É possível fabricar este produto. {PENDING[itemId]}</p>}
        </div>
        <div className="pharmacy-controls">
          <label className="pharmacy-quantity" htmlFor="pharmacy-quantity">Tentativas <small>1 a 1000</small><input id="pharmacy-quantity" type="number" min={1} max={1000} step={1} disabled={busy} value={Number.isNaN(quantity)?'':quantity} onChange={e=>setQuantity(e.currentTarget.valueAsNumber)}/></label>
          <p className="pharmacy-cost">{format(p.spPerAttempt)} SP por tentativa · Total: <b>{valid?format(p.spTotal):'—'} SP</b> · Disponível: {format(state.sp)}</p>
          <p className="pharmacy-weight">Peso se todas derem certo: {valid?format(p.resultWeight):'—'} / {format(p.maxWeight)}</p>
          <p className="pharmacy-warning">Cada tentativa consome os materiais, mesmo quando falha.{p.guide&&" O manual permanece na mochila."}{itemId===678&&" A produção individual segue a guarda do Hercules: o sorteio interno é consumido, mas a unidade é garantida."}</p>
          {p.reason&&<p className="pharmacy-reason" role="status">{p.reason.message}</p>}
          <button type="button" className="primary" disabled={busy||!p.available} onClick={()=>{if(!busy&&p.available)void command({type:'craftPharmacy',itemId,quantity});}}>{busy?'Aguarde…':`Fazer ${valid?number(quantity):'—'} ${quantity===1?'tentativa':'tentativas'}`}</button>
        </div>
      </section>
    </div>
    <section className="pharmacy-result" role="status" aria-live="polite" aria-atomic="true">{result?.itemId&&icon(result.itemId)}<div><b>Última fabricação</b><span>{result?result.text:'O resultado aparecerá aqui e no diário.'}</span></div></section>
  </div>;
}
