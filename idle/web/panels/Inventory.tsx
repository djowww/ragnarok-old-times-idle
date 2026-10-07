import { useState } from "react";
import type { InventoryEntry, Item } from "../../shared/types";
import {
  Empty,
  ItemIcon,
  itemName,
  itemRarityBonus,
  itemRarityClass,
  itemRarityLabel,
  number,
  slots,
  type PanelProps,
} from "../components/common";
import { isItemIdentified, MAGNIFIER_ITEM_ID } from "../../shared/loot";

export default function Inventory({
  catalog,
  snapshot,
  busy,
  command,
}: PanelProps) {
  const { state } = snapshot;
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [cardUid, setCardUid] = useState("");
  const equipped = new Set(Object.values(state.equipment));
  const visible = state.inventory.filter((e) => {
    const item = catalog.items[e.itemId];
    return (
      item &&
      (filter === "all" ||
        (filter === "favorite" ? e.favorite : item.type === filter)) &&
      itemName(item, e)
        .toLocaleLowerCase("pt-BR")
        .includes(search.toLocaleLowerCase("pt-BR"))
    );
  });
  const entry = state.inventory.find((e) => e.uid === selected) ?? visible[0];
  const item = entry ? catalog.items[entry.itemId] : null;
  const identified = item?.type !== "equipment" || isItemIdentified(entry);
  const magnifiers = state.inventory.reduce(
    (total, e) => total + (e.itemId === MAGNIFIER_ITEM_ID ? e.quantity : 0), 0,
  );
  const protectedItem = entry
    ? equipped.has(entry.uid) ||
      entry.favorite ||
      entry.refine > 0 ||
      entry.cards.length > 0
    : false;
  const cards = item
    ? state.inventory.filter(
        (e) =>
          catalog.items[e.itemId]?.type === "card" &&
          item.slot &&
          catalog.items[e.itemId].cardSlots?.includes(item.slot),
      )
    : [];
  const town = state.status === "town";
  const selectedCard = cards.find((e) => e.uid === cardUid);
  const materialId = item?.slot === "weapon" ? 984 : 985;
  const hasMaterial = state.inventory.some(
    (e) => e.itemId === materialId && e.quantity > 0,
  );
  const equipAllowed =
    item?.type === "equipment" &&
    item.equipSupported !== false &&
    item.slot &&
    identified &&
    state.baseLevel >= item.minLevel &&
    (!item.allowedClasses.length || item.allowedClasses.includes(state.job)) &&
    (!item.weaponType ||
      catalog.classes[state.job].weapons.includes(item.weaponType));
  function select(value: InventoryEntry) {
    setSelected(value.uid);
    setQuantity(1);
    setCardUid("");
    if (window.matchMedia("(max-width: 760px)").matches)
      requestAnimationFrame(() =>
        document
          .querySelector(".item-detail")
          ?.scrollIntoView({ block: "start", behavior: "auto" }),
      );
  }
  return (
    <div className="inventory-layout">
      <div className="inventory-list">
        <div className="toolbar">
          <label className="search-field">
            <span className="sr-only">Buscar na mochila</span>
            <input
              placeholder="Buscar item…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label>
            <span className="sr-only">Categoria</span>
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">Todos os itens</option>
              <option value="equipment">Equipamentos</option>
              <option value="consumable">Consumíveis</option>
              <option value="card">Cartas</option>
              <option value="material">Materiais</option>
              <option value="loot">Loot</option>
              <option value="favorite">Favoritos</option>
            </select>
          </label>
        </div>
        {!town && (
          <div className="notice">
            Visite a cidade para vender ou melhorar seus itens.
            <button
              disabled={busy}
              onClick={() => void command({ type: "stop" })}
            >
              Ir à cidade
            </button>
          </div>
        )}
        <div className="item-grid">
          {visible.map((e) => {
            const i = catalog.items[e.itemId];
            return (
              <button
                className={`item-cell ${i.type === "equipment" ? itemRarityClass(e) : ""} ${entry?.uid === e.uid ? "selected" : ""} ${equipped.has(e.uid) ? "equipped" : ""}`}
                key={e.uid}
                onClick={() => select(e)}
                aria-pressed={entry?.uid === e.uid}
                title={itemName(i, e)}
              >
                <ItemIcon item={i} />
                <span className="item-cell-name">{itemName(i, e)}</span>
                {i.type === "equipment" && (
                  <span className="item-rarity-label">{itemRarityLabel(e)}</span>
                )}
                <span className="item-cell-meta">
                  {equipped.has(e.uid)
                    ? "Equipado"
                    : e.favorite
                      ? "Favorito"
                      : `${number(e.quantity)} un.`}
                </span>
              </button>
            );
          })}
        </div>
        {!visible.length && (
          <Empty>
            {search
              ? "Nenhum item com esse nome."
              : "Sua mochila está vazia nesta categoria. Explore uma área para encontrar itens."}
          </Empty>
        )}
        <div className="inventory-footer">
          <span>
            {state.inventory.length} pilhas ·{" "}
            {number(
              state.inventory.reduce(
                (total, e) =>
                  total + catalog.items[e.itemId].weight * e.quantity,
                0,
              ),
            )}{" "}
            de peso
          </span>
          <button
            disabled={
              busy ||
              !town ||
              !state.inventory.some(
                (e) =>
                  catalog.items[e.itemId].type === "loot" &&
                  !equipped.has(e.uid) &&
                  !e.favorite &&
                  !e.refine &&
                  !e.cards.length,
              )
            }
            onClick={() => void command({ type: "sellLoot" })}
          >
            Vender loot comum
          </button>
        </div>
        <p className="note">
          A venda de loot preserva favoritos, itens equipados, refinados e com
          cartas.
        </p>
      </div>
      <aside className="item-detail">
        {entry && item ? (
          <>
            <div className={`item-detail-title ${item.type === "equipment" ? itemRarityClass(entry) : ""}`}>
              <ItemIcon item={item} />
              <div>
                <h3>{itemName(item, entry)}</h3>
                {item.type === "equipment" && (
                  <span className="item-rarity-label">{itemRarityLabel(entry)}</span>
                )}
                <span className="muted">
                  {item.slot ? slots[item.slot] : typeNames[item.type]} ·{" "}
                  {number(entry.quantity)} un.
                </span>
              </div>
            </div>
            {identified ? (
              <>
                <ItemFacts item={item} catalog={catalog} />
                {item.id === MAGNIFIER_ITEM_ID && (
                  <p className="note">Selecione um equipamento não identificado na mochila e use Identificar. Cada equipamento consome uma Lupa.</p>
                )}
                {item.type === "equipment" && itemRarityBonus(entry) && (
                  <p className="item-rarity-bonus">
                    Bônus de raridade: <b>{itemRarityBonus(entry)}</b> enquanto equipado.
                  </p>
                )}
              </>
            ) : (
              <div className="item-identification">
                <p className="note">Use uma Lupa para revelar o equipamento, sua raridade e seu bônus. Identifique antes de equipar, refinar ou inserir cartas.</p>
                <button
                  className="primary"
                  disabled={busy || magnifiers < 1}
                  onClick={() => void command({ type: "identify", uid: entry.uid })}
                >
                  Identificar · 1 Lupa
                </button>
                <p className="note">Lupas na mochila: {number(magnifiers)}{magnifiers < 1 ? ". Compre uma na loja da cidade." : "."}</p>
              </div>
            )}
            {identified && item.unsupportedEffect && (
              <p className="note" role="note">
                O efeito original deste item ainda não é aplicado no modo idle. Ele pode ser guardado ou vendido.
              </p>
            )}
            {identified && item.type === "equipment" && item.equipSupported === false && (
              <p className="note" role="note">
                A posição ou o tipo deste equipamento ainda não está disponível no modo idle. Você pode guardar ou vender o item identificado.
              </p>
            )}
            {identified && !!entry.cards.length && (
              <p className="socketed">
                Cartas:{" "}
                {entry.cards.map((id) => catalog.items[id]?.name).join(", ")}
              </p>
            )}
            <div className="action-row">
              <button
                disabled={busy}
                aria-pressed={entry.favorite}
                onClick={() =>
                  void command({ type: "favorite", uid: entry.uid })
                }
              >
                {entry.favorite ? "Remover favorito" : "Marcar favorito"}
              </button>
              {item.type === "equipment" && (
                <button
                  className="primary"
                  disabled={busy || equipped.has(entry.uid) || !equipAllowed}
                  onClick={() =>
                    void command({ type: "equip", uid: entry.uid })
                  }
                >
                  {equipped.has(entry.uid) ? "Equipado" : "Equipar"}
                </button>
              )}
            </div>
            {item.type === "equipment" && identified && item.equipSupported !== false && !equipAllowed && (
              <p className="note">
                Requer Base {item.minLevel}
                {item.allowedClasses.length
                  ? ` · ${item.allowedClasses.map((id) => catalog.classes[id]?.name ?? id).join(", ")}`
                  : ""}
                {item.weaponType &&
                !catalog.classes[state.job].weapons.includes(item.weaponType)
                  ? " · arma incompatível com sua classe"
                  : ""}
                .
              </p>
            )}
            {item.type === "equipment" &&
              identified &&
              item.equipSupported !== false &&
              item.slot &&
              item.refinable !== false &&
              item.slot !== "accessory" && (
                <div className="detail-section">
                  <h4>Refinamento · +{entry.refine} / +7</h4>
                  <p>
                    {entry.refine < 4
                      ? "Até +4, a tentativa é segura."
                      : `Próxima tentativa: ${entry.refine === 4 ? 60 : entry.refine === 5 ? 40 : 20}% de sucesso. A falha mantém o nível atual.`}
                  </p>
                  <p className="cost">
                    {number(500 * (entry.refine + 1))} z + 1{" "}
                    {catalog.items[materialId]?.name ??
                      (materialId === 984 ? "Oridecon" : "Elunium")}
                  </p>
                  <button
                    disabled={
                      busy ||
                      !town ||
                      entry.refine >= 7 ||
                      !hasMaterial ||
                      state.zeny < 500 * (entry.refine + 1)
                    }
                    onClick={() =>
                      void command({ type: "refine", uid: entry.uid })
                    }
                  >
                    Refinar para +{Math.min(7, entry.refine + 1)}
                  </button>
                  {!town && (
                    <p className="note">Visite a cidade para refinar.</p>
                  )}
                </div>
              )}
            {item.type === "equipment" && identified && item.equipSupported !== false && item.slot && item.slots > 0 && (
              <div className="detail-section">
                <h4>
                  Cartas · {entry.cards.length} / {item.slots}
                </h4>
                {cards.length ? (
                  <>
                    <label className="field">
                      Carta compatível
                      <select
                        value={cardUid}
                        onChange={(e) => setCardUid(e.target.value)}
                      >
                        <option value="">Escolher carta</option>
                        {cards.map((e) => (
                          <option value={e.uid} key={e.uid}>
                            {catalog.items[e.itemId].name} ({e.quantity})
                          </option>
                        ))}
                      </select>
                    </label>
                    {selectedCard && (
                      <div className="card-preview">
                        <h4>{catalog.items[selectedCard.itemId].name}</h4>
                        <ItemFacts
                          item={catalog.items[selectedCard.itemId]}
                          catalog={catalog}
                        />
                      </div>
                    )}
                    <p className="note">
                      A carta será consumida e ficará neste equipamento.
                    </p>
                    <button
                      disabled={
                        busy ||
                        !town ||
                        !cardUid ||
                        entry.cards.length >= item.slots
                      }
                      onClick={async () => {
                        if (
                          await command({
                            type: "socket",
                            uid: entry.uid,
                            cardUid,
                          })
                        )
                          setCardUid("");
                        if (window.matchMedia("(max-width: 760px)").matches)
                          requestAnimationFrame(() =>
                            document
                              .querySelector(".item-detail")
                              ?.scrollIntoView({
                                block: "start",
                                behavior: "auto",
                              }),
                          );
                      }}
                    >
                      Inserir carta
                    </button>
                  </>
                ) : (
                  <p className="muted">
                    Você ainda não encontrou uma carta para esta posição.
                  </p>
                )}
              </div>
            )}
            <div className="detail-section">
              <h4>Venda · {number(item.sellPrice)} z por unidade</h4>
              {protectedItem ? (
                <p className="note">
                  Item protegido por{" "}
                  {equipped.has(entry.uid)
                    ? "estar equipado"
                    : entry.favorite
                      ? "ser favorito"
                      : entry.cards.length
                        ? "ter cartas"
                        : "ter refinamento"}
                  .
                </p>
              ) : (
                <div className="quantity-action">
                  <label>
                    <span className="sr-only">Quantidade para vender</span>
                    <input
                      type="number"
                      min="1"
                      max={entry.quantity}
                      value={quantity}
                      onChange={(e) =>
                        setQuantity(
                          Math.max(
                            1,
                            Math.min(
                              entry.quantity,
                              Math.floor(Number(e.target.value) || 1),
                            ),
                          ),
                        )
                      }
                    />
                  </label>
                  <button
                    disabled={busy || !town || item.sellPrice <= 0}
                    onClick={() =>
                      void command({ type: "sell", uid: entry.uid, quantity })
                    }
                  >
                    Vender · {number(quantity * item.sellPrice)} z
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <Empty>Escolha um item para ver seus detalhes.</Empty>
        )}
      </aside>
    </div>
  );
}
export const typeNames = {
  loot: "Loot",
  consumable: "Consumível",
  equipment: "Equipamento",
  card: "Carta",
  material: "Material",
};
const effectNames: Record<string, string> = {
  str: "STR",
  agi: "AGI",
  vit: "VIT",
  int: "INT",
  dex: "DEX",
  luk: "LUK",
  atk: "ATQ",
  matk: "ATQM",
  def: "DEF",
  mdef: "DEFM",
  hp: "HP",
  sp: "SP",
  hit: "Precisão",
  flee: "Esquiva",
  crit: "Crítico",
  aspd: "Velocidade",
  damagePct: "Dano",
  neutralResist: "Resistência neutra",
  perfectDodge: "Esquiva perfeita",
};
export function ItemFacts({
  item,
  catalog,
}: {
  item: Item;
  catalog: PanelProps["catalog"];
}) {
  return (
    <div className="item-facts">
      {item.attack > 0 && (
        <span>
          ATQ <b>{item.attack}</b>
        </span>
      )}
      {item.def > 0 && (
        <span>
          DEF <b>{item.def}</b>
        </span>
      )}
      {item.twoHanded && <span>Arma de duas mãos</span>}
      {!!item.healHP && (
        <span>
          Recupera <b>{item.healHP} HP</b>
        </span>
      )}
      {!!item.healSP && (
        <span>
          Recupera <b>{item.healSP} SP</b>
        </span>
      )}
      {item.minLevel > 1 && (
        <span>
          Base mínima <b>{item.minLevel}</b>
        </span>
      )}
      {Object.entries(item.effects).map(([key, value]) => (
        <span key={key}>
          {effectNames[key] ?? key.toUpperCase()}{" "}
          <b>
            {value >= 0 ? "+" : ""}
            {value}
            {[
              "crit",
              "aspd",
              "damagePct",
              "neutralResist",
              "perfectDodge",
            ].includes(key)
              ? "%"
              : ""}
          </b>
        </span>
      ))}
      {item.type === "card" && (
        <p>Para {item.cardSlots?.map((s) => slots[s]).join(", ")}.</p>
      )}
      {item.type === "equipment" && item.allowedClasses.length > 0 && (
        <details className="allowed-classes">
          <summary>Classes permitidas ({item.allowedClasses.length})</summary>
          <p>
            {item.allowedClasses
              .map((c) => catalog.classes[c]?.name ?? c)
              .join(", ")}
            .
          </p>
        </details>
      )}
    </div>
  );
}
