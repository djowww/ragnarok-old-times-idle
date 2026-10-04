import { useState } from "react";
import {
  Empty,
  ItemIcon,
  itemName,
  number,
  type PanelProps,
} from "../components/common";
import { ItemFacts, typeNames } from "./Inventory";

export default function Shop({ catalog, snapshot, busy, command }: PanelProps) {
  const [filter, setFilter] = useState("consumable");
  const [quantity, setQuantity] = useState(1);
  const [selected, setSelected] = useState<number | null>(null);
  const items = Object.values(catalog.items).filter(
    (item) => item.shop && (filter === "all" || item.type === filter),
  );
  const item = items.find((i) => i.id === selected) ?? items[0];
  const town = snapshot.state.status === "town";
  return (
    <div className="inventory-layout shop-layout">
      <div className="inventory-list">
        <div className="toolbar">
          <p className="muted">Suprimentos para sua próxima caçada.</p>
          <label>
            <span className="sr-only">Categoria da loja</span>
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">Todas as mercadorias</option>
              <option value="consumable">Poções</option>
              <option value="equipment">Equipamentos</option>
              <option value="material">Materiais</option>
            </select>
          </label>
        </div>
        {!town && (
          <div className="notice">
            Volte à cidade para comprar.{" "}
            <button
              disabled={busy}
              onClick={() => void command({ type: "stop" })}
            >
              Ir à cidade
            </button>
          </div>
        )}
        <div className="shop-list">
          {items.map((i) => (
            <button
              className={`shop-row ${item?.id === i.id ? "selected" : ""}`}
              key={i.id}
              onClick={() => {
                setSelected(i.id);
                setQuantity(1);
                if (window.matchMedia("(max-width: 760px)").matches)
                  requestAnimationFrame(() =>
                    document
                      .querySelector(".item-detail")
                      ?.scrollIntoView({ block: "start", behavior: "auto" }),
                  );
              }}
              aria-pressed={item?.id === i.id}
            >
              <ItemIcon item={i} />
              <span>
                <b>{itemName(i)}</b>
                <small>{typeNames[i.type]}</small>
              </span>
              <strong>{number(i.buyPrice)} z</strong>
            </button>
          ))}
        </div>
        {!items.length && <Empty>Nenhum item nesta categoria.</Empty>}
      </div>
      <aside className="item-detail">
        {item && (
          <>
            <div className="item-detail-title">
              <ItemIcon item={item} />
              <h3>{itemName(item)}</h3>
            </div>
            <ItemFacts item={item} catalog={catalog} />
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
              <b>{number(item.buyPrice * quantity)} z</b>
            </div>
            <button
              className="primary full"
              disabled={
                busy || !town || snapshot.state.zeny < item.buyPrice * quantity
              }
              onClick={() =>
                void command({ type: "buy", itemId: item.id, quantity })
              }
            >
              Comprar {quantity > 1 ? `${quantity} unidades` : ""}
            </button>
            {snapshot.state.zeny < item.buyPrice * quantity && (
              <p className="note">Zeny insuficiente para esta compra.</p>
            )}
            <p className="note">Saldo: {number(snapshot.state.zeny)} z.</p>
          </>
        )}
      </aside>
    </div>
  );
}
