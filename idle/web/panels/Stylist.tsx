import { useState } from "react";
import type { Appearance } from "../../shared/types";
import { DEFAULT_APPEARANCE } from "../../shared/types";
import { ActorPreview } from "../components/Scene";
import { isItemIdentified } from "../../shared/loot";
import type { PanelProps } from "../components/common";

const hairstyles = Array.from({ length: 28 }, (_, value) => value);
const hairColors = Array.from({ length: 9 }, (_, value) => value);
const clothesColors = Array.from({ length: 5 }, (_, value) => value);

export default function Stylist({ catalog, snapshot, busy, command }: PanelProps) {
  const { state } = snapshot;
  const [draft, setDraft] = useState<Appearance>(() => ({ ...(state.appearance ?? DEFAULT_APPEARANCE) }));
  const currentClass = catalog.classes[state.job];
  const weaponEntry = state.inventory.find(entry => entry.uid === state.equipment.weapon);
  const weaponType = weaponEntry && isItemIdentified(weaponEntry) ? catalog.items[weaponEntry.itemId]?.weaponType : undefined;
  const current = state.appearance ?? DEFAULT_APPEARANCE;
  const changed = draft.hairStyle !== current.hairStyle || draft.hairColor !== current.hairColor || draft.clothesColor !== current.clothesColor;
  const field = <K extends keyof Appearance>(key: K, value: Appearance[K]) => setDraft(previous => ({ ...previous, [key]: value }));

  return <div className="stylist-service">
    <header className="service-panel-intro">
      <span className="service-panel-mark" aria-hidden="true">✂</span>
      <div><h3>Estilista de Prontera</h3><p>Escolha um penteado e ajuste as cores da sua roupa.</p></div>
    </header>
    <div className="stylist-layout">
      <div className="stylist-preview-card">
        <ActorPreview asset={currentClass.sprite[state.gender]} size="natural" displayScale={1.7}
          name={`${state.name}, prévia da aparência`} appearance={draft}
          weapon={weaponType ? { type: weaponType, gender: state.gender, job: state.job } : undefined} />
        <span>{state.name} · {currentClass.name}</span>
      </div>
      <div className="stylist-controls">
        <label className="stylist-field">Penteado
          <select value={draft.hairStyle} onChange={event => field("hairStyle", Number(event.target.value))}>
            {hairstyles.map(style => <option key={style} value={style}>Estilo {style + 1}{style === 0 ? " · clássico" : ""}</option>)}
          </select>
        </label>
        <label className="stylist-field">Cor do cabelo
          <select value={draft.hairColor} onChange={event => field("hairColor", Number(event.target.value))}>
            {hairColors.map(color => <option key={color} value={color}>{color === 0 ? "Original" : `Cor ${color}`}</option>)}
          </select>
        </label>
        <label className="stylist-field">Cor da roupa
          <select value={draft.clothesColor} onChange={event => field("clothesColor", Number(event.target.value))}>
            {clothesColors.map(color => <option key={color} value={color}>{color === 0 ? "Original" : `Cor ${color}`}</option>)}
          </select>
        </label>
        <p className="stylist-note">Prévia com sprites e paletas do cliente local. A personalização é gratuita.</p>
        <div className="stylist-actions">
          <button type="button" disabled={!changed || busy} onClick={() => setDraft({ ...current })}>Descartar</button>
          <button type="button" className="primary" disabled={!changed || busy}
            onClick={() => void command({ type: "changeAppearance", ...draft })}>
            {busy ? "Salvando…" : "Salvar aparência"}
          </button>
        </div>
      </div>
    </div>
  </div>;
}
