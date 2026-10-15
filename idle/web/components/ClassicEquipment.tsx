import { useEffect, useState, type CSSProperties } from "react";
import type { Slot } from "../../shared/types";
import { isItemIdentified } from "../../shared/loot";
import { FALLBACK_ICON, getBitmapUrl } from "../assets/items";
import { ActorPreview } from "./Scene";
import { ItemIcon, itemName, itemRarityBonus, itemRarityClass, itemRarityLabel, type PanelProps } from "./common";
import "../styles/classic-equipment.css";

// Original pre-renewal EquipmentV0 arrangement: five rows around the portrait.
const equipmentSlots: ReadonlyArray<{ key: string; label: string; slot?: Slot; side: "left" | "right"; row: number }> = [
  { key: "head-top", label: "Cabeça superior", slot: "head", side: "left", row: 1 },
  { key: "head-mid", label: "Cabeça meio", side: "right", row: 1 },
  { key: "head-bottom", label: "Cabeça inferior", side: "left", row: 2 },
  { key: "armor", label: "Armadura", slot: "armor", side: "right", row: 2 },
  { key: "weapon", label: "Arma", slot: "weapon", side: "left", row: 3 },
  { key: "shield", label: "Escudo", slot: "shield", side: "right", row: 3 },
  { key: "garment", label: "Capa", slot: "garment", side: "left", row: 4 },
  { key: "shoes", label: "Calçado", slot: "shoes", side: "right", row: 4 },
  { key: "accessory-one", label: "Acessório", slot: "accessory", side: "left", row: 5 },
  { key: "accessory-two", label: "Segundo acessório", side: "right", row: 5 },
];

export default function ClassicEquipment({ catalog, snapshot, busy, command, onInventory }: PanelProps & { onInventory: () => void }) {
  const { state } = snapshot;
  const currentClass = catalog.classes[state.job];
  const weaponEntry = state.inventory.find(entry => entry.uid === state.equipment.weapon);
  const weaponType = weaponEntry && isItemIdentified(weaponEntry) ? catalog.items[weaponEntry.itemId]?.weaponType : undefined;
  const [background, setBackground] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void getBitmapUrl("data/texture/유저인터페이스/basic_interface/equipwin_bg.bmp").then(value => {
      if (live && value !== FALLBACK_ICON) setBackground(value);
    });
    return () => { live = false; };
  }, []);
  const style: CSSProperties | undefined = background ? { backgroundImage: `url("${background}")` } : undefined;
  return (
    <div className="classic-equipment-window">
      <div className="classic-equipment-layout" style={style} aria-label="Equipamentos do personagem">
        <div className="classic-equipment-portrait">
          <ActorPreview asset={currentClass.sprite[state.gender]} size="natural"
            name={`${state.name}, ${currentClass.name}, ${state.gender === "female" ? "feminino" : "masculino"}`}
            appearance={state.appearance}
            weapon={weaponType ? { type: weaponType, gender: state.gender, job: state.job } : undefined} />
        </div>
        {equipmentSlots.map(({ key, label, slot, side, row }) => {
          const entry = slot ? state.inventory.find(item => item.uid === state.equipment[slot]) : undefined;
          const item = entry ? catalog.items[entry.itemId] : undefined;
          const name = item ? itemName(item, entry) : "Vazio";
          const detail = [label, name, entry ? itemRarityLabel(entry) : "", itemRarityBonus(entry)].filter(Boolean).join(" · ");
          return (
            <div key={key} className={`equipment-slot classic-equipment-slot ${side} ${entry ? itemRarityClass(entry) : "is-empty"}`}
              style={{ gridRow: row, gridColumn: side === "left" ? 1 : 3 }} title={detail}>
              {entry && item && slot ? <>
                <button type="button" className="classic-equipment-item" disabled={busy}
                  aria-label={`Desequipar ${label}: ${name}`} title={`${detail} · Clique para desequipar`}
                  onClick={() => void command({ type: "unequip", slot })}>
                  {isItemIdentified(entry) ? <ItemIcon item={item} /> : <span className="classic-equipment-unknown" aria-hidden="true">?</span>}
                </button>
                <span className="equipment-item-name">{name}</span>
              </> : <span className={background ? "visually-hidden" : "classic-equipment-empty-label"}>{label}<span className="visually-hidden"> · Vazio</span></span>}
            </div>
          );
        })}
      </div>
      <div className="classic-equipment-footer">
        <span title={`${state.name} · ${currentClass.name}`}>{currentClass.name}</span>
        <button type="button" onClick={onInventory}>Abrir mochila</button>
      </div>
    </div>
  );
}
