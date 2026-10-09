import type { CSSProperties } from "react";
import { assetUrl } from "../assets/items";

export const CLASSIC_LOADING_ART = assetUrl("data/texture/유저인터페이스/worldmap.jpg");

/** Original pre-renewal GRF artwork; progress is supplied by actual load stages. */
export default function ClassicLoading({ progress, error, onRetry }: {
  progress: number; error?: string; onRetry: () => void;
}) {
  const percent = Math.max(0, Math.min(100, Math.floor(progress)));
  return <div className="classic-loading-screen" role="status" aria-live="polite" aria-busy={!error}
    style={{ "--classic-loading-art": `url("${CLASSIC_LOADING_ART}")` } as CSSProperties}>
    <img className="classic-loading-art" src={CLASSIC_LOADING_ART} alt="" fetchPriority="high" />
    {error ? <div className="classic-loading-error" role="alert">
      <p>{error}</p><button onClick={onRetry}>Tentar novamente</button>
    </div> : <div className="classic-loading-progress" role="progressbar" aria-label="Carregando Rune-Midgard"
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
      <span style={{ width: `${percent}%` }} /><b>{percent}%</b>
    </div>}
  </div>;
}
