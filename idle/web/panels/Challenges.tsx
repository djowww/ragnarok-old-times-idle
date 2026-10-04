import { useState } from "react";
import { ActorPreview } from "../components/Scene";
import {
  duration,
  number,
  RewardLine,
  type PanelProps,
} from "../components/common";

export type ChallengeFilter = "all" | "mvp" | "miniboss";

export default function Challenges({
  catalog,
  snapshot,
  busy,
  command,
  filter = "all",
  onFilterChange,
}: PanelProps & { filter?: ChallengeFilter; onFilterChange?: (filter: ChallengeFilter) => void }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const { state, serverTime } = snapshot;
  const query = search.trim().toLocaleLowerCase("pt-BR");
  const challenges = catalog.challenges.filter((challenge) => {
    if (filter !== "all" && challenge.category !== filter) return false;
    const monster = catalog.monsters[challenge.monsterId];
    return !query || `${challenge.name} ${monster.name} ${monster.aegisName}`.toLocaleLowerCase("pt-BR").includes(query);
  });
  const pageSize = 12;
  const pageCount = Math.max(1, Math.ceil(challenges.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleChallenges = challenges.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  return (
    <div className="challenges-panel">
      <div className="section-title">
        <h3>{filter === "mvp" ? "Caçada a MVP" : filter === "miniboss" ? "Mini-chefes" : "Prove sua preparação"}</h3>
        <span>{challenges.length} encontros · {state.challengeAttempts} tentativas</span>
      </div>
      <p className="muted">
        Chefes de Rune-Midgard com atributos e tabelas de drop do Hercules. A primeira vitória
        dá uma recompensa extra; novas vitórias mantêm os drops e a experiência.
      </p>
      <div className="challenge-controls">
        <div className="challenge-filters" role="group" aria-label="Filtrar encontros">
          {(["all", "mvp", "miniboss"] as const).map((value) => (
            <button key={value} type="button" aria-pressed={filter === value}
              className={filter === value ? "selected" : ""}
              onClick={() => { setPage(0); onFilterChange?.(value); }}>
              {value === "all" ? "Todos" : value === "mvp" ? "MVPs" : "Mini-chefes"}
            </button>
          ))}
        </div>
        <label className="challenge-search">
          <span className="sr-only">Buscar chefe</span>
          <input type="search" value={search} placeholder="Buscar chefe…"
            onChange={(event) => { setSearch(event.target.value); setPage(0); }} />
        </label>
      </div>
      {state.status !== "town" && state.status !== "challenge" && (
        <div className="notice">
          Prepare-se na cidade antes de iniciar um desafio.
          <button
            disabled={busy}
            onClick={() => void command({ type: "stop" })}
          >
            Ir à cidade
          </button>
        </div>
      )}
      {challenges.length === 0 ? (
        <div className="empty-state" role="status">
          {query ? "Nenhum chefe corresponde à busca." : "Nenhum desafio desta categoria está disponível por enquanto."}
        </div>
      ) : (
        <>
        <div className="challenge-list">
          {visibleChallenges.map((challenge) => {
            const monster = catalog.monsters[challenge.monsterId];
            const remaining =
              (state.challengeCooldowns[challenge.id] ?? 0) - serverTime;
            const wins = state.challengeWins[challenge.id] ?? 0;
            const current = state.battle?.challengeId === challenge.id;
            const locked = state.baseLevel < challenge.minLevel;
            return (
              <article
                className={`challenge-card ${current ? "current" : ""}`}
                key={challenge.id}
              >
                <ActorPreview asset={monster.sprite} name={monster.name} large />
                <div>
                  <span className="eyebrow">
                    {challenge.category === "mvp" ? "MVP" : "Mini-chefe"} · Base {challenge.minLevel}+
                  </span>
                  <h3>{challenge.name}</h3>
                  <p>
                    {number(monster.hp)} HP · Nv. {monster.level} ·{" "}
                    {duration(challenge.timeoutMs)} para vencer
                  </p>
                  <h4>
                    {wins
                      ? `Primeira vitória concluída · ${wins} vitórias`
                      : "Recompensa da primeira vitória"}
                  </h4>
                  <RewardLine catalog={catalog} reward={challenge.firstReward} />
                  <p className="note">
                    Intervalo após vitória: {duration(challenge.cooldownMs)}.
                  </p>
                </div>
                <button
                  className="primary"
                  disabled={
                    busy ||
                    locked ||
                    remaining > 0 ||
                    state.status !== "town" ||
                    state.hp <= 0
                  }
                  onClick={() =>
                    void command({ type: "challenge", challengeId: challenge.id })
                  }
                >
                  {current
                    ? "Em combate"
                    : locked
                      ? `Requer Base ${challenge.minLevel}`
                      : remaining > 0
                        ? `Disponível em ${duration(remaining)}`
                        : `Enfrentar ${challenge.name}`}
                </button>
              </article>
            );
          })}
        </div>
        {pageCount > 1 && <div className="challenge-pagination" aria-label="Páginas de encontros">
          <button type="button" disabled={currentPage === 0}
            onClick={() => setPage((current) => Math.max(0, current - 1))}>Anterior</button>
          <span>Página {currentPage + 1} de {pageCount}</span>
          <button type="button" disabled={currentPage + 1 >= pageCount}
            onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}>Próxima</button>
        </div>}
        </>
      )}
      {state.status === "challenge" && (
        <div className="notice">
          A tentativa está em andamento. Desistir encerra o desafio sem a
          recompensa de vitória.
          <button
            disabled={busy}
            onClick={() => void command({ type: "stop" })}
          >
            Desistir e ir à cidade
          </button>
        </div>
      )}
    </div>
  );
}
