import { useMemo, useState } from 'react';
import { ItemIcon, number, type PanelProps } from '../components/common';
import { weaponCraftPreview, weaponRecipe, weaponRecipes } from '../../engine/weaponCraft';
import { classSkills } from '../../engine/stats';

const LABELS: Record<string, string> = {
  BS_DAGGER: 'Adaga', BS_SWORD: 'Espada de uma mão', BS_TWOHANDSWORD: 'Espada de duas mãos',
  BS_AXE: 'Machado', BS_MACE: 'Maça', BS_KNUCKLE: 'Soqueira', BS_SPEAR: 'Lança',
};

export default function WeaponCraft({ catalog, snapshot, busy, command }: PanelProps) {
  const { state } = snapshot;
  const learned = useMemo(() => new Set(classSkills(catalog, state.job).filter(id => {
    const skill = catalog.skills[id], level = state.learnedSkills[id] ?? 0;
    return skill?.manualUse === 'weaponCraft' && skill.implementation === 'supported' && Number.isSafeInteger(level) && level > 0;
  }).map(id => catalog.skills[id].sourceName)), [catalog, state.job, state.learnedSkills]);
  const options = weaponRecipes.filter(recipe => learned.has(recipe.skillName) && (state.learnedSkills[classSkills(catalog, state.job).find(id => catalog.skills[id]?.sourceName === recipe.skillName) ?? ''] ?? 0) >= recipe.skillLevel);
  const [selectedItemId, setSelectedItemId] = useState(options[0]?.outputItemId ?? weaponRecipes[0]?.outputItemId ?? 1101);
  const selected = options.find(recipe => recipe.outputItemId === selectedItemId) ?? options[0];
  const itemId = selected?.outputItemId ?? selectedItemId;
  const recipe = weaponRecipe(itemId);
  const preview = weaponCraftPreview(state, catalog, itemId, snapshot.serverTime);
  const item = catalog.items[itemId];
  const chance = `${(preview.chance / 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  return <div className="blacksmith-service">
    <header className="service-panel-intro">
      {item && <ItemIcon item={item} />}
      <div><h3>Forja de armas</h3><p>Receitas clássicas de ferreiro para preparar armas para a caça solo.</p></div>
    </header>
    {options.length ? <>
      <section aria-labelledby="weapon-craft-recipe-title">
        <div className="service-section-heading"><div><h4 id="weapon-craft-recipe-title">Escolha a receita</h4><p>Uma tentativa consome todos os materiais; uma falha não devolve os itens.</p></div></div>
        <label htmlFor="weapon-craft-recipe">Arma</label>{' '}
        <select id="weapon-craft-recipe" value={itemId} onChange={event => setSelectedItemId(Number(event.currentTarget.value))}>
          {options.map(option => <option key={option.outputItemId} value={option.outputItemId}>
            {catalog.items[option.outputItemId]?.name ?? `Item ${option.outputItemId}`} · {LABELS[option.skillName]} · nível {option.skillLevel}
          </option>)}
        </select>
      </section>
      {recipe && <section aria-labelledby="weapon-craft-material-title">
        <div className="service-section-heading"><div><h4 id="weapon-craft-material-title">{item?.name ?? `Item ${itemId}`}</h4>
          <p>Chance: {chance} · nível da arma {recipe.weaponLevel} · habilidade nível {recipe.skillLevel}</p>
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
          onClick={() => { if (!busy && preview.available) void command({ type: 'craftWeapon', itemId }); }}>
          Tentar forjar
        </button>
      </section>}
    </> : <p className="service-empty-note">Aprenda uma das sete habilidades de forja e tenha os materiais da receita.</p>}
    <p className="service-empty-note">Esta versão cria a arma identificada sem estrelas, elemento ou assinatura do ferreiro.</p>
  </div>;
}
