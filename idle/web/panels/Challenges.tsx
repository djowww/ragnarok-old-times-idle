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
}: PanelProps & { filter?: ChallengeFilter }) {
  const { state, serverTime } = snapshot;
  const challenges = catalog.challenges.filter((challenge) => {
    if (filter === "all") return true;
    const isMvp = (catalog.monsters[challenge.monsterId]?.mvpDrops?.length ?? 0) > 0;
    return filter === "mvp" ? isMvp : !isMvp;
  });
  return (
    <div className="challenges-panel">
      <div className="section-title">
        <h3>{filter === "mvp" ? "Caçada a MVP" : filter === "miniboss" ? "Mini-chefes" : "Prove sua preparação"}</h3>
        <span>{challenges.length} encontros · {state.challengeAttempts} tentativas</span>
      </div>
      <p className="muted">
        Um adversário poderoso, dez minutos e a sua build. A primeira vitória
        traz uma recompensa especial; novas vitórias continuam oferecendo EXP e
        drops.
      </p>
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
      <div className="challenge-list">
        {challenges.map((challenge) => {
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
                  Desafio · Base {challenge.minLevel}+
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
