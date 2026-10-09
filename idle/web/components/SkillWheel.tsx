import { useState, type CSSProperties } from "react";
import type { Skill } from "../../shared/types";
import SkillIcon from "./SkillIcon";

export const SKILL_ROTATION_LIMIT = 9;

type WheelPosition = CSSProperties & {
  "--slot-x": string;
  "--slot-y": string;
  "--arrow-angle"?: string;
};

function position(index: number, between = false): WheelPosition {
  const angle = (-90 + (index + (between ? 0.5 : 0)) * 360 / SKILL_ROTATION_LIMIT);
  const radians = angle * Math.PI / 180;
  return {
    "--slot-x": `${50 + Math.cos(radians) * 36}%`,
    "--slot-y": `${50 + Math.sin(radians) * 36}%`,
    "--arrow-angle": `${angle + 90}deg`,
  };
}

export default function SkillWheel({
  skills,
  rotation,
  busy,
  onChange,
}: {
  skills: Record<string, Skill>;
  rotation: string[];
  busy: boolean;
  onChange: (skillIds: string[]) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const selectedId = selected && rotation.includes(selected) ? selected : rotation[0];
  const selectedSkill = selectedId ? skills[selectedId] : undefined;
  const selectedIndex = selectedId ? rotation.indexOf(selectedId) : -1;

  function move(step: number) {
    const target = selectedIndex + step;
    if (busy || selectedIndex < 0 || target < 0 || target >= rotation.length) return;
    const next = [...rotation];
    [next[selectedIndex], next[target]] = [next[target], next[selectedIndex]];
    onChange(next);
  }

  return (
    <div className="rotation-box skill-wheel-box">
      <h4>Prioridade automática <span>{rotation.length} / {SKILL_ROTATION_LIMIT}</span></h4>
      <div className="skill-wheel-layout">
        <div className="skill-wheel">
          <div className="skill-wheel-track" aria-hidden="true" />
          <div className="skill-wheel-center" aria-hidden="true">
            <span>↻</span>
            <b>1 → 9</b>
          </div>
          <ol className="skill-wheel-slots" aria-label="Ordem das habilidades, no sentido horário">
            {Array.from({ length: SKILL_ROTATION_LIMIT }, (_, index) => {
              const id = rotation[index];
              const skill = id ? skills[id] : undefined;
              return (
                <li className="skill-wheel-slot" style={position(index)} key={index}>
                  {skill ? (
                    <button type="button"
                      className={`skill-wheel-icon ${selectedId === id ? "selected" : ""}`}
                      aria-label={`${index + 1}: ${skill.name}. Selecionar para mudar a prioridade.`}
                      aria-pressed={selectedId === id}
                      title={`${index + 1}. ${skill.name}`}
                      onClick={() => setSelected(id)}>
                      <span className="skill-wheel-number" aria-hidden="true">{index + 1}</span>
                      <SkillIcon skill={skill} />
                    </button>
                  ) : (
                    <span className="skill-wheel-icon empty" aria-label={`Posição ${index + 1} vazia`}>
                      <span className="skill-wheel-number" aria-hidden="true">{index + 1}</span>
                      <span aria-hidden="true">·</span>
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
          {Array.from({ length: SKILL_ROTATION_LIMIT }, (_, index) => (
            <span className="skill-wheel-arrow" style={position(index, true)} aria-hidden="true" key={index}>›</span>
          ))}
        </div>
        <div className="skill-wheel-detail">
          {selectedSkill ? (
            <>
              <span className="skill-wheel-selection">Posição {selectedIndex + 1}</span>
              <h5>{selectedSkill.name}</h5>
              <div className="skill-wheel-actions">
                <button type="button" disabled={busy || selectedIndex === 0}
                  aria-label={`Usar ${selectedSkill.name} antes`}
                  onClick={() => move(-1)}><span aria-hidden="true">‹</span> Antes</button>
                <button type="button" disabled={busy || selectedIndex === rotation.length - 1}
                  aria-label={`Usar ${selectedSkill.name} depois`}
                  onClick={() => move(1)}>Depois <span aria-hidden="true">›</span></button>
              </div>
              <button type="button" className="skill-wheel-remove" disabled={busy}
                aria-label={`Remover ${selectedSkill.name} da rotação`}
                onClick={() => onChange(rotation.filter((id) => id !== selectedId))}>Remover da rotação</button>
            </>
          ) : (
            <p className="muted">Aprenda uma habilidade ativa e escolha “Usar na rotação” abaixo.</p>
          )}
          <p className="note">Começa em 1 e segue no sentido horário. Se uma habilidade não estiver pronta, passa à próxima.</p>
        </div>
      </div>
      <p className="note skill-wheel-fallback">Sem recursos ou habilidades prontas, o personagem usa o ataque básico.</p>
    </div>
  );
}
