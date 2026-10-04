import { useEffect, useRef } from "react";
import { duration, ItemIcon, number, type PanelProps } from "./common";

interface OfflineProps extends PanelProps {
  error: string | null;
  retryable: boolean;
  sending: boolean;
  retry: () => Promise<boolean | void>;
}
export default function Offline({
  catalog,
  snapshot,
  busy,
  command,
  error,
  retryable,
  sending,
  retry,
}: OfflineProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const summary = snapshot.offlineSummary;
  useEffect(() => {
    const element = dialog.current;
    if (!element || !summary) return;
    element.showModal();
    return () => element.close();
  }, [!!summary]);
  if (!summary) return null;
  return (
    <dialog
      ref={dialog}
      className="offline-dialog"
      aria-labelledby="offline-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) void command({ type: "dismissOffline" });
      }}
    >
      <div className="panel-heading">
        <h2 id="offline-title">Bem-vindo de volta, {snapshot.state.name}</h2>
        <span>{duration(summary.elapsedMs)}</span>
      </div>
      <div className="offline-body">
        <p>Sua aventura continuou enquanto você estava fora.</p>
        <dl className="offline-totals">
          <div>
            <dt>Criaturas derrotadas</dt>
            <dd>{number(summary.kills)}</dd>
          </div>
          <div>
            <dt>EXP base</dt>
            <dd>+{number(summary.baseExp)}</dd>
          </div>
          <div>
            <dt>EXP classe</dt>
            <dd>+{number(summary.jobExp)}</dd>
          </div>
          <div>
            <dt>Zeny</dt>
            <dd>+{number(summary.zeny)} z</dd>
          </div>
          <div>
            <dt>Níveis base / classe</dt>
            <dd>
              +{summary.baseLevels} / +{summary.jobLevels}
            </dd>
          </div>
          <div>
            <dt>Poções usadas</dt>
            <dd>{number(summary.potions)}</dd>
          </div>
          <div>
            <dt>Derrotas</dt>
            <dd>{number(summary.deaths)}</dd>
          </div>
        </dl>
        {Object.entries(summary.items).length > 0 && (
          <>
            <h3>Itens encontrados</h3>
            <div className="offline-items">
              {Object.entries(summary.items).map(([id, count]) => {
                const item = catalog.items[Number(id)];
                return item ? (
                  <div key={id}>
                    <ItemIcon item={item} />
                    <span>{item.name}</span>
                    <b>×{number(count)}</b>
                  </div>
                ) : null;
              })}
            </div>
          </>
        )}
        <p className="note">
          Os ganhos já estão na sua mochila. O progresso offline é limitado a 12
          horas.
          {snapshot.state.status === "paused"
            ? " Sua caçada foi pausada; você pode retomá-la ao fechar este resumo."
            : ""}
        </p>
        {error && (
          <div className="offline-error" role="alert">
            <p>{error}</p>
            {retryable && (
              <p className="note">
                Recupere o resultado desta mesma ação para continuar.
              </p>
            )}
            <button
              className="primary full"
              disabled={sending}
              onClick={() => void retry()}
            >
              Tentar novamente
            </button>
          </div>
        )}
        <button
          autoFocus
          className="primary full"
          disabled={busy}
          onClick={() => void command({ type: "dismissOffline" })}
        >
          Continuar aventura
        </button>
      </div>
    </dialog>
  );
}
