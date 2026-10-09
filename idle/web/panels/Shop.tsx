import { useState } from "react";
import {
  Empty,
  ItemIcon,
  itemName,
  number,
  type PanelProps,
} from "../components/common";
import { ItemFacts, typeNames } from "./Inventory";
import { merchantPrice } from "../../shared/prices";
import { MAGNIFIER_ITEM_ID } from "../../shared/loot";

export default function Shop({ catalog, snapshot, busy, command }: PanelProps) {
  const [filter, setFilter] = useState("consumable");
  const [quantity, setQuantity] = useState(1);
  const [selected, setSelected] = useState<number | null>(null);
  const items = Object.values(catalog.items).filter(
    (item) => item.shop && (filter === "all" ||
      (filter === "identification" ? item.id === MAGNIFIER_ITEM_ID :
        item.type === filter && (filter !== "consumable" || item.id !== MAGNIFIER_ITEM_ID))),
  );
  const item = items.find((i) => i.id === selected) ?? items[0];
  const town = snapshot.state.status === "town";
  const price = (base: number) =>
    merchantPrice(snapshot.state, catalog, base, "buy");
  return (
    <div className="inventory-layout shop-layout">
      <div className="shop-toolbar">
        <label>
          Mercadorias
          <select
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setSelected(null);
              setQuantity(1);
            }}
          >
            <option value="all">Todas</option>
            <option value="consumable">Poções</option>
            <option value="identification">Identificação · Lupa</option>
            <option value="equipment">Equipamentos</option>
            <option value="material">Materiais</option>
          </select>
        </label>
        <span>{items.length} {items.length === 1 ? "item" : "itens"}</span>
      </div>
      {!town && (
        <div className="notice shop-town-notice">
          Volte à cidade para comprar.
          <button
            disabled={busy}
            onClick={() => void command({ type: "stop" })}
          >
            Ir à cidade
          </button>
        </div>
      )}
      <div className="inventory-list shop-catalog">
        <div className="shop-list" aria-label="Mercadorias disponíveis">
          {items.map((i) => (
            <button
              className={`shop-row ${item?.id === i.id ? "selected" : ""}`}
              key={i.id}
              onClick={() => {
                setSelected(i.id);
                setQuantity(1);
              }}
              aria-pressed={item?.id === i.id}
            >
              <ItemIcon item={i} />
              <span>
                <b>{itemName(i)}</b>
                <small>{typeNames[i.type]}</small>
              </span>
              <strong>{number(price(i.buyPrice))} z</strong>
            </button>
          ))}
        </div>
        {!items.length && <Empty>Nenhum item nesta categoria.</Empty>}
      </div>
      <aside
        className="item-detail shop-purchase"
        aria-label="Comprar mercadoria"
      >
        {item && (
          <>
            <div className="item-detail-title">
              <ItemIcon item={item} />
              <h3>{itemName(item)}</h3>
            </div>
            <div className="shop-item-facts" tabIndex={0} role="region" aria-label="Detalhes da mercadoria">
              <ItemFacts item={item} catalog={catalog} />
            </div>
            <label className="field">
              Quantidade
              <input
                type="number"
                min="1"
                max="999"
                value={quantity}
                onChange={(e) =>
                  setQuantity(
                    Math.max(
                      1,
                      Math.min(999, Math.floor(Number(e.target.value) || 1)),
                    ),
                  )
                }
              />
            </label>
            <div className="purchase-total">
              <span>Total</span>
              <b>{number(price(item.buyPrice) * quantity)} z</b>
            </div>
            <button
              className="primary full"
              disabled={
                busy ||
                !town ||
                snapshot.state.zeny < price(item.buyPrice) * quantity
              }
              onClick={() =>
                void command({ type: "buy", itemId: item.id, quantity })
              }
            >
              Comprar {quantity > 1 ? `${quantity} unidades` : ""}
            </button>
            {snapshot.state.zeny < price(item.buyPrice) * quantity && (
              <p className="note">Zeny insuficiente para esta compra.</p>
            )}
            <p className="note shop-balance">
              Saldo: <b>{number(snapshot.state.zeny)} z</b>
            </p>
          </>
        )}
      </aside>
    </div>
  );
}
