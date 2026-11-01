import { useState } from 'react';
import { ItemIcon, number, type PanelProps } from '../components/common';
import { converterCraftPreview } from '../../engine/converterCraft';

const RECIPES = [12114, 12115, 12116, 12117] as const;
const NAMES: Record<number, string> = { 12114: 'Conversor de Fogo', 12115: 'Conversor de Água', 12116: 'Conversor de Terra', 12117: 'Conversor de Vento' };

export default function ConverterCraft({ catalog, snapshot, busy, command }: PanelProps) {
  const [itemId, setItemId] = useState<number>(12114);
  const [quantity, setQuantity] = useState(1);
  const { state } = snapshot;
  const preview = converterCraftPreview(state, catalog, itemId, quantity, snapshot.serverTime);
  const item = catalog.items[itemId];
  return <div className="blacksmith-service">
    <header className="service-panel-intro">
      {item && <ItemIcon item={item} />}
      <div><h3>Criar conversores elementais</h3><p>Prepare reagentes para mudar o elemento defensivo de monstros.</p></div>
    </header>
    <section aria-labelledby="converter-recipes-title">
      <div className="service-section-heading"><div><h4 id="converter-recipes-title">Escolha a receita</h4><p>Uma ativação produz o lote inteiro com sucesso garantido.</p></div></div>
      <div className="blacksmith-ore-grid">
        {RECIPES.map(id => <button type="button" key={id} className="blacksmith-ore-card" aria-pressed={itemId === id} onClick={() => setItemId(id)}>
          {catalog.items[id] && <ItemIcon item={catalog.items[id]} />}
          <span className="blacksmith-ore-copy"><b>{NAMES[id]}</b></span>
        </button>)}
      </div>
    </section>
    <section aria-labelledby="converter-lot-title">
      <div className="service-section-heading"><div><h4 id="converter-lot-title">{NAMES[itemId]}</h4>
        <p>{number(preview.spCost)} SP por ativação · SP disponível: {number(state.sp)}</p></div></div>
      <label htmlFor="converter-quantity">Quantidade do lote (1 a 1000)</label>{' '}
      <input id="converter-quantity" type="number" min={1} max={1000} step={1} value={Number.isNaN(quantity) ? '' : quantity}
        onChange={event => setQuantity(event.currentTarget.valueAsNumber)} style={{ width: 80 }} />
      <div className="blacksmith-refine-list">
        {preview.ingredients.map(ingredient => <article className="blacksmith-ore-card" key={ingredient.itemId}>
          {catalog.items[ingredient.itemId] && <ItemIcon item={catalog.items[ingredient.itemId]} />}
          <div className="blacksmith-ore-copy"><b>{catalog.items[ingredient.itemId]?.name ?? `Item ${ingredient.itemId}`}</b>
            <small>Necessário: {number(ingredient.quantity)} · Na mochila: {number(ingredient.owned)}</small>
            <small>{ingredient.missing > 0 ? `Faltam ${number(ingredient.missing)}` : 'Materiais suficientes'}</small>
          </div>
        </article>)}
      </div>
      <p>Resultado: {Number.isSafeInteger(quantity) && quantity > 0 ? number(quantity) : '—'} × {NAMES[itemId]}.</p>
      <p>Peso após produzir: {Number.isFinite(preview.resultWeight) ? preview.resultWeight.toLocaleString('pt-BR') : '—'} / {number(preview.maxWeight)}.</p>
      {preview.reason && <p className="service-town-note" role="status">{preview.reason.message}</p>}
      {preview.learned && <button type="button" className="primary" disabled={busy || !preview.available}
        onClick={() => { if (!busy && preview.available) void command({ type: 'craftConverter', itemId, quantity }); }}>
        Produzir {Number.isSafeInteger(quantity) ? number(quantity) : 'lote'}
      </button>}
    </section>
    <p className="service-empty-note">Os conversores são reagentes de Mudança Elemental. O encantamento de arma por uso direto ainda está indisponível.</p>
  </div>;
}
