import { useState } from "react";
import { ActorPreview } from "../components/Scene";
import { Empty, number, type PanelProps } from "../components/common";

export default function Classes({
  catalog,
  snapshot,
  busy,
  command,
}: PanelProps) {
  const { state, availableClasses } = snapshot;
  const [confirmRebirth, setConfirmRebirth] = useState(false);
  const current = catalog.classes[state.job];
  const choices = Object.values(catalog.classes).filter(
    (c) =>
      c.id !== state.job &&
      c.trans === state.reborn &&
      (c.gender === undefined || c.gender === state.gender) &&
      (current.tier === 0
        ? c.tier === 1 &&
          (!state.family || c.family === state.family || c.id === state.family)
        : current.tier === 1
          ? c.tier === 2 &&
            c.family === current.family &&
            (!state.reborn || c.rebirthOf === state.branch)
          : false),
  );
  const rebirthReady =
    current.tier === 2 &&
    !state.reborn &&
    state.baseLevel >= 99 &&
    state.jobLevel >= 50 &&
    state.zeny >= 50000 &&
    state.status === "town";
  return (
    <div className="classes-panel">
      <div className="class-current">
        <ActorPreview
          asset={current.sprite[state.gender]}
          name={current.name}
          large
        />
        <div>
          <span className="eyebrow">Seu caminho</span>
          <h3>{current.name}</h3>
          <p>
            Base {state.baseLevel} / 99 · Classe {state.jobLevel} /{" "}
            {current.jobCap}
          </p>
          <p className="muted">
            {current.tier === 0
              ? "A primeira escolha acontece na cidade, a partir de Job 10."
              : current.tier === 1
                ? "Escolha seu próximo ramo na cidade, a partir de Job 40."
                : state.reborn
                  ? "Sua classe transcendental pode alcançar Job 70."
                  : "Continue até Base 99 e Job 50 para renascer."}
          </p>
        </div>
      </div>
      {state.status !== "town" && (
        <div className="notice">
          Mudanças de classe acontecem na cidade.{" "}
          <button
            disabled={busy}
            onClick={() => void command({ type: "stop" })}
          >
            Ir à cidade
          </button>
        </div>
      )}
      {!!choices.length && (
        <div className="class-choices">
          {choices.map((job) => (
            <article className="class-choice" key={job.id}>
              <ActorPreview asset={job.sprite[state.gender]} name={job.name} />
              <h3>{job.name}</h3>
              <p className="muted">
                Job {job.minJobLevel}+ · Limite {job.jobCap}
              </p>
              <p className="class-skills">
                {job.skills.map((id) => catalog.skills[id]?.name).join(" · ")}
              </p>
              <button
                className="primary"
                disabled={busy || !availableClasses.includes(job.id)}
                onClick={() =>
                  void command({ type: "changeClass", classId: job.id })
                }
              >
                Tornar-se {job.name}
              </button>
            </article>
          ))}
        </div>
      )}
      {!choices.length && current.tier < 2 && (
        <Empty>
          Continue sua evolução para abrir o próximo caminho de classe.
        </Empty>
      )}
      <section className="rebirth-section">
        <h3>Renascimento</h3>
        <p>Base 99 · Job 50 · {number(50000)} z · na cidade</p>
        <p className="muted">
          Retorne como Alto Aprendiz e evolua para sua classe transcendental.
          Seus itens, missões e bestiário são preservados. Níveis, atributos e
          habilidades recomeçam.
        </p>
        {state.reborn ? (
          <p className="reborn-note">
            Você já renasceu. Seu ramo continua preservado.
          </p>
        ) : confirmRebirth ? (
          <div className="notice rebirth-confirm">
            <span>
              Renascer agora por 50.000 z? Os equipamentos voltam à mochila.
            </span>
            <button disabled={busy} onClick={() => setConfirmRebirth(false)}>
              Cancelar
            </button>
            <button
              className="primary"
              disabled={busy || !rebirthReady}
              onClick={async () => {
                if (await command({ type: "rebirth" }))
                  setConfirmRebirth(false);
              }}
            >
              Confirmar renascimento
            </button>
          </div>
        ) : (
          <button
            disabled={busy || !rebirthReady}
            onClick={() => setConfirmRebirth(true)}
          >
            Renascer · 50.000 z
          </button>
        )}
      </section>
    </div>
  );
}
