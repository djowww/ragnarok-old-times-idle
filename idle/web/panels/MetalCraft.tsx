import { useMemo, useState } from 'react';
import { ItemIcon, number, type PanelProps } from '../components/common';
import { metalCraftPreview, metalRecipes } from '../../engine/metalCraft';
import { classSkills } from '../../engine/stats';

export default function MetalCraft({ catalog, snapshot, busy, command }: PanelProps) {
  const { state } = snapshot;
  const options = useMemo(() => {
    const skills = classSkills(catalog, state.job).filter(id => {
      const skill = catalog.skills[id], level = state.learnedSkills[id] ?? 0;
      return skill?.manualUse === 'metalCraft' && skill.implementation === 'supported' && level > 0;
    });
    const names = new Set(skills.map(id => catalog.skills[id].sourceName));
    return metalRecipes.filter(recipe => names.has(recipe.skillName));
  }, [catalog, state.job, state.learnedSkills]);
  const [selectedId, setSelectedId] = useState(options[0]?.outputItemId ?? metalRecipes[0]?.outputItemId ?? 998);
  const selected = options.find(recipe => recipe.outputItemId === selectedId) ?? options[0];
  const itemId = selected?.outputItemId ?? selectedId;
  const preview = metalCraftPreview(state, catalog, itemId, snapshot.serverTime);
  const item = catalog.items[itemId];
  const chance = `${(preview.chance / 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  return <div className="blacksmith-service">
    <header className="service-panel-intro">{item && <ItemIcon item={item} />}
      <div><h3>Produção de metais</h3><p>Transforme materiais encontrados na caça solo em metais e pedras elementais.</p></div>
    </header>
    {options.length ? <>
      <label htmlFor="metal-craft-recipe">Produto</label>{' '}
      <select id="metal-craft-recipe" value={itemId} onChange={event => setSelectedId(Number(event.currentTarget.value))}>
        {options.map(recipe => <option key={recipe.outputItemId} value={recipe.outputItemId}>
          {catalog.items[recipe.outputItemId]?.name ?? `Item ${recipe.outputItemId}`}
        </option>)}
      </select>
      <section aria-labelledby="metal-craft-details">
        <div className="service-section-heading"><div><h4 id="metal-craft-details">{item?.name ?? `Item ${itemId}`}</h4>
          <p>Chance: {chance} · nível da habilidade {preview.skillLevel}</p>
        </div></div>
        <div className="blacksmith-refine-list">
          {preview.ingredients.map(ingredient => <article className="blacksmith-ore-card" key={ingredient.itemId}>
            {catalog.items[ingredient.itemId] && <ItemIcon item={catalog.items[ingredient.itemId]} />}
            <div className="blacksmith-ore-copy"><b>{catalog.items[ingredient.itemId]?.name ?? `Item ${ingredient.itemId}`}</b>
              <small>Necessário: {number(ingredient.quantity)} · Na mochila: {number(ingredient.owned)}</small>
              <small>{ingredient.missing ? `Faltam ${number(ingredient.missing)}` : 'Materiais suficientes'}</small>
            </div>
          </article>)}
        </div>
        <p>Peso após a tentativa: {Number.isFinite(preview.resultWeight) ? preview.resultWeight.toLocaleString('pt-BR') : '—'} / {number(preview.maxWeight)}.</p>
        {preview.reason && <p className="service-town-note" role="status">{preview.reason.message}</p>}
        <button type="button" className="primary" disabled={busy || !preview.available}
          onClick={() => { if (!busy && preview.available) void command({ type: 'craftMetal', itemId }); }}>
          Tentar produzir
        </button>
      </section>
    </> : <p className="service-empty-note">Aprenda a habilidade de produção para ver as receitas disponíveis.</p>}
    <p className="service-empty-note">A falha consome os materiais conforme as regras clássicas.</p>
  </div>;
}
