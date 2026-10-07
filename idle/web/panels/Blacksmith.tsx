import type { PanelProps } from "../components/common";
import { ItemIcon, itemName, itemRarityClass, number } from "../components/common";
import { isItemIdentified } from "../../shared/loot";
import { merchantPrice } from "../../shared/prices";

const ORE_IDS = [984, 985] as const;

export default function Blacksmith({ catalog, snapshot, busy, command }: PanelProps) {
  const { state } = snapshot;
  const town = state.status === "town";
  const oreQuantity = (id: number) => state.inventory
    .filter(entry => entry.itemId === id)
    .reduce((total, entry) => total + entry.quantity, 0);
  const refinable = state.inventory.filter(entry => {
    const item = catalog.items[entry.itemId];
    return item?.type === "equipment" && item.equipSupported !== false && item.slot &&
      item.slot !== "accessory" && item.refinable !== false && entry.refine < 7 && isItemIdentified(entry);
  });

  return <div className="blacksmith-service">
    <header className="service-panel-intro">
      <span className="service-panel-mark" aria-hidden="true">⚒</span>
      <div><h3>Oficina do ferreiro</h3><p>Minérios e refinamento clássico de equipamentos.</p></div>
    </header>
    <section className="blacksmith-ore-shop" aria-labelledby="blacksmith-ores-title">
      <div className="service-section-heading">
        <div><h4 id="blacksmith-ores-title">Minérios</h4><p>Oridecon para armas · Elunium para armaduras</p></div>
        <span>Na mochila: {number(oreQuantity(984))} Oridecon · {number(oreQuantity(985))} Elunium</span>
      </div>
      <div className="blacksmith-ore-grid">
        {ORE_IDS.map(id => {
          const item = catalog.items[id];
          if (!item) return null;
          const price = merchantPrice(state, catalog, item.buyPrice, "buy");
          return <article className="blacksmith-ore-card" key={id}>
            <ItemIcon item={item} />
            <div className="blacksmith-ore-copy"><b>{item.name}</b><small>{id === 984 ? "Refina armas" : "Refina armaduras"}</small></div>
            <span className="blacksmith-ore-price">{number(price)} z</span>
            <div className="blacksmith-buy-actions">
              {[1, 5].map(quantity => <button key={quantity} type="button" disabled={busy || !town || !item.shop || state.zeny < price * quantity}
                onClick={() => void command({ type: "buy", itemId: id, quantity })}>
                Comprar {quantity}
              </button>)}
            </div>
          </article>;
        })}
      </div>
    </section>
    <section className="blacksmith-refine" aria-labelledby="blacksmith-refine-title">
      <div className="service-section-heading">
        <div><h4 id="blacksmith-refine-title">Refinar equipamentos</h4><p>Até +4 é seguro; acima disso há risco de falha.</p></div>
      </div>
      {refinable.length ? <div className="blacksmith-refine-list">
        {refinable.map(entry => {
          const item = catalog.items[entry.itemId];
          const materialId = item.slot === "weapon" ? 984 : 985;
          const material = catalog.items[materialId];
          const target = entry.refine + 1;
          const chance = target <= 4 ? 100 : ({ 5: 60, 6: 40, 7: 20 }[target] ?? 0);
          const price = target * 500;
          const available = oreQuantity(materialId) > 0;
          return <article className={`blacksmith-refine-card ${itemRarityClass(entry)}`} key={entry.uid}>
            <ItemIcon item={item} />
            <div className="blacksmith-refine-copy"><b>{itemName(item, entry)}</b>
              <small>Refino atual +{entry.refine} · Próximo +{target}</small>
            </div>
            <div className="blacksmith-refine-cost"><b>{number(price)} z + 1 {material?.name ?? (materialId === 984 ? "Oridecon" : "Elunium")}</b>
              <small>{chance}% de sucesso</small>
            </div>
            <button type="button" className="primary" disabled={busy || !town || !available || state.zeny < price}
              title={!available ? `É necessário ${material?.name ?? "minério"}.` : undefined}
              onClick={() => void command({ type: "refine", uid: entry.uid })}>
              Refinar para +{target}
            </button>
          </article>;
        })}
      </div> : <p className="service-empty-note">Não há equipamento identificado que possa receber outro refino. Equipamentos não identificados devem ser identificados na Mochila primeiro.</p>}
    </section>
    {!town && <p className="service-town-note" role="status">O ferreiro atende somente em Prontera.</p>}
  </div>;
}
