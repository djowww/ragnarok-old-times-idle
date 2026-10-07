import { useState, type CSSProperties } from "react";
import { isItemIdentified } from "../../shared/loot";
import type { Catalog, GameSnapshot } from "../../shared/types";
import { number } from "./common";
import { ActorPreview } from "./Scene";
import { CLASSIC_LOADING_ART } from "./ClassicLoading";
import { Link, navigate } from "../portal/router";
import { useAuth } from "../portal/AuthProvider";

export default function CharacterSelect({ catalog, snapshot, onEnter, error, retrying, onRetry }: {
  catalog: Catalog;
  snapshot: GameSnapshot;
  onEnter: () => void;
  error: string | null;
  retrying: boolean;
  onRetry: () => void;
}) {
  const [selected, setSelected] = useState(false);
  const auth = useAuth();
  const { state } = snapshot;
  const job = catalog.classes[state.job];
  const area = catalog.areas.find((entry) => entry.id === state.areaId);
  const weaponEntry = state.inventory.find((entry) => entry.uid === state.equipment.weapon);
  const weapon = weaponEntry && isItemIdentified(weaponEntry)
    ? catalog.items[weaponEntry.itemId]?.weaponType
    : undefined;
  const location = state.status === "town" ? "Prontera" : area?.name ?? "Rune-Midgard";
  const huntStatus = state.status === "hunting"
    ? `Caçando AFK em ${location}. Sua jornada continuou durante a ausência.`
    : state.status === "paused" && state.pausedStatus === "hunting"
      ? `Caçada pausada em ${location} após o limite offline. Progresso preservado.`
      : state.status === "resting"
        ? `Descansando em ${location}.`
        : state.status === "challenge"
          ? "Preparado para seu próximo desafio."
          : `Última parada em ${location}.`;
  const offlineKills = snapshot.offlineSummary?.kills ?? 0;

  return <section className="classic-character-select-screen" aria-labelledby="character-select-title"
    style={{ "--classic-loading-art": `url("${CLASSIC_LOADING_ART}")` } as CSSProperties}>
    <div className="classic-character-window">
      <header className="classic-character-titlebar">
        <span className="classic-character-crest" aria-hidden="true">R</span>
        <div>
          <small>Ragnarok · Old Times</small>
          <h1 id="character-select-title">Seleção de personagem</h1>
        </div>
        <span className="classic-character-slots">Conta: {auth.account?.username}</span>
      </header>

      <div className="classic-character-content">
        <section className="classic-character-roster" aria-label="Personagem da conta">
          <h2 className="classic-character-section-title">Personagem salvo</h2>
          <button type="button" className="classic-character-card" aria-pressed={selected}
            onClick={() => setSelected(true)}>
            <ActorPreview asset={job.sprite[state.gender]} size="natural"
              name={`${state.name}, ${job.name}`} appearance={state.appearance} />
            <span className="classic-character-card-copy">
              <b>{state.name}</b>
              <small>{job.name}</small>
              <em>{selected ? "Selecionado" : "Clique para selecionar"}</em>
            </span>
          </button>
        </section>

        <section className="classic-character-preview" aria-label="Detalhes do personagem">
          <div className="classic-character-portrait">
            <ActorPreview asset={job.sprite[state.gender]} large displayScale={1.55}
              name={`${state.name}, ${job.name}, Base ${state.baseLevel}, Job ${state.jobLevel}`}
              appearance={state.appearance}
              weapon={weapon ? { type: weapon, gender: state.gender, job: state.job } : undefined} />
          </div>
          <div className="classic-character-preview-copy">
            <h2>{state.name}</h2>
            <p className="classic-character-class">{job.name}{state.reborn ? " · Transclasse" : ""}</p>
            <dl className="classic-character-levels">
              <div><dt>Base</dt><dd>{number(state.baseLevel)}</dd></div>
              <div><dt>Job</dt><dd>{number(state.jobLevel)}</dd></div>
            </dl>
            <p className="classic-character-hunt">
              {huntStatus}
              {offlineKills > 0 && <> · {number(offlineKills)} monstros derrotados enquanto você estava fora.</>}
            </p>
          </div>
        </section>
      </div>

      <footer className="classic-character-footer">
        <Link href="/painel">Painel da conta</Link>
        <button type="button" onClick={() => { void auth.logout().catch(() => {}); navigate('/'); }}>Sair da conta</button>
        <p>{error ? <span role="alert">{error}</span> : "O progresso da caça continua salvo no seu personagem."}</p>
        {error && <button type="button" className="classic-character-retry"
          disabled={retrying} onClick={onRetry}>Tentar novamente</button>}
        <button type="button" className="classic-character-enter" disabled={!selected} onClick={onEnter}>
          Entrar no mundo
        </button>
      </footer>
    </div>
  </section>;
}
