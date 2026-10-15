import { useState } from "react";
import type { Catalog, GameSnapshot, SenseInspectionResult } from "../../shared/types";
import { validSenseInspection } from "../../engine/senseInspection";
import { useDraggableWindow } from "../hooks/useDraggableWindow";
import "../styles/sense-inspection.css";

const ELEMENT_RATE_NAMES = ["Água", "Terra", "Fogo", "Vento", "Veneno", "Sagrado", "Sombrio", "Fantasma", "Morto-vivo"];
const RACE_NAMES: Record<string, string> = {
  angel: "Anjo", brute: "Bruto", demihuman: "Humanoide", demon: "Demônio", dragon: "Dragão",
  fish: "Peixe", formless: "Amorfo", insect: "Inseto", plant: "Planta", undead: "Morto-vivo",
};
const SIZE_NAMES: Record<string, string> = { small: "Pequeno", medium: "Médio", large: "Grande" };
const ELEMENT_NAMES: Record<string, string> = {
  neutral: "Neutro", water: "Água", earth: "Terra", fire: "Fogo", wind: "Vento",
  poison: "Veneno", holy: "Sagrado", dark: "Sombrio", ghost: "Fantasma", undead: "Morto-vivo",
};

export function senseInspectionDismissalMatches(
  inspection: SenseInspectionResult | undefined,
  dismissed: string | null,
): boolean {
  return !!inspection && dismissed === `${inspection.actorId}:${inspection.observedAt}`;
}

export default function SenseInspection({ catalog, snapshot }: { catalog: Catalog; snapshot: GameSnapshot }) {
  const inspection = validSenseInspection(snapshot.state);
  const monster = inspection ? catalog.monsters[inspection.monsterId] : undefined;
  const [dismissed, setDismissed] = useState<string | null>(null);
  const movable = useDraggableWindow<HTMLElement>("sense-inspection", "inspeção de monstro");
  if (!inspection || !monster || senseInspectionDismissalMatches(inspection, dismissed)) return null;
  const inspectionKey = `${inspection.actorId}:${inspection.observedAt}`;

  return (
    <section ref={movable.ref} style={movable.style} className="ro-window sense-inspection"
      role="dialog" aria-label={`Inspeção: ${monster.name}`}>
      <div {...movable.handleProps} className="ro-drag-handle ro-window-titlebar">
        <h2>Inspeção de monstro</h2>
        <button type="button" className="ro-window-close" aria-label="Fechar inspeção"
          onClick={() => setDismissed(inspectionKey)}>×</button>
      </div>
      <div className="ro-window-content">
        <h3>{monster.name}</h3>
        <small>Leitura em {new Date(inspection.observedAt).toLocaleString("pt-BR")}</small>
        <dl>
          <dt>HP atual</dt><dd>{inspection.currentHp.toLocaleString("pt-BR")}</dd>
          <dt>DEF</dt><dd>{inspection.def.toLocaleString("pt-BR")}</dd>
          <dt>DEFM</dt><dd>{inspection.mdef.toLocaleString("pt-BR")}</dd>
          <dt>Raça</dt><dd>{RACE_NAMES[inspection.race.toLowerCase()] ?? inspection.race}</dd>
          <dt>Tamanho</dt><dd>{SIZE_NAMES[inspection.size.toLowerCase()] ?? inspection.size}</dd>
          <dt>Elemento</dt><dd>{ELEMENT_NAMES[inspection.element.toLowerCase()] ?? inspection.element} Nv. {inspection.elementLevel}</dd>
          <dt>Nível</dt><dd>{inspection.level}</dd>
          <dt>Classe</dt><dd>{inspection.classId}</dd>
        </dl>
        <h4>Compatibilidade elemental</h4>
        <ul aria-label="Taxas de elemento da instância inspecionada">
          {inspection.elementRates.map((rate, index) => (
            <li key={ELEMENT_RATE_NAMES[index]}>{ELEMENT_RATE_NAMES[index]}: {rate}%</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
