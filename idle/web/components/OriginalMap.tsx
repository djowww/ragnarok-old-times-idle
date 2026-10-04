import { useEffect, useRef, useState } from "react";

const localMaps = new Set([
  "prontera",
  "prt_in",
  "prt_fild08",
  "prt_sewb1",
  "prt_fild04",
  "prt_fild03",
  "pay_dun00",
  "iz_dun01",
  "gef_fild10",
  "moc_pryd02",
  "gef_dun02",
  "gl_knt01",
]);

export type MapStatus = { map: string; phase: "loading" | "ready" | "error" };

/** The local roBrowserLegacy MapViewer is a scenery layer; idle combat stays in React. */
export default function OriginalMap({
  map,
  onStatusChange,
}: {
  map: string;
  onStatusChange?: (status: MapStatus) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [attempt, setAttempt] = useState(0);
  const allowed = localMaps.has(map);
  const [status, setStatus] = useState<MapStatus>({ map, phase: allowed ? "loading" : "error" });
  const origin = `${window.location.protocol}//${window.location.hostname}:3338`;
  const phase = status.map === map ? status.phase : allowed ? "loading" : "error";

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let size: { width: number; height: number } | null = null;
    let timer: number | undefined;
    const observer = new ResizeObserver(([entry]) => {
      const next = { width: Math.round(entry.contentRect.width), height: Math.round(entry.contentRect.height) };
      if (size && (Math.abs(next.width - size.width) > 32 || Math.abs(next.height - size.height) > 32)) {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          onStatusChange?.({ map, phase: "loading" });
          setStatus({ map, phase: "loading" });
          setAttempt((value) => value + 1);
        }, 350);
      }
      size = next;
    });
    observer.observe(element);
    return () => { observer.disconnect(); window.clearTimeout(timer); };
  }, [map, onStatusChange]);

  useEffect(() => {
    if (!allowed) {
      setStatus({ map, phase: "error" });
      return;
    }
    setStatus({ map, phase: "loading" });
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== origin || event.source !== frame.current?.contentWindow)
        return;
      const data = event.data as { type?: unknown; map?: unknown } | null;
      if (!data || data.map !== map) return;
      if (data.type === "ragidle-map-ready") setStatus({ map, phase: "ready" });
      if (data.type === "ragidle-map-error") setStatus({ map, phase: "error" });
    };
    window.addEventListener("message", onMessage);
    const timeout = window.setTimeout(() => setStatus((old) =>
      old.map === map && old.phase === "loading"
        ? { map, phase: "error" }
        : old,
    ), 60000);
    return () => {
      window.removeEventListener("message", onMessage);
      window.clearTimeout(timeout);
    };
  }, [map, attempt, allowed, origin]);

  useEffect(() => {
    onStatusChange?.({ map, phase });
  }, [map, phase, onStatusChange]);

  const retry = () => {
    onStatusChange?.({ map, phase: "loading" });
    setStatus({ map, phase: "loading" });
    setAttempt((value) => value + 1);
  };
  return (
    <div ref={host} className="original-map" aria-hidden={phase === "ready"}>
      {allowed && (
        <iframe
          key={`${map}:${attempt}`}
          ref={frame}
          src={`${origin}/applications/pwa/map-idle.html?attempt=${attempt}#${map}.rsw`}
          title={`Cenário original de ${map}`}
          tabIndex={-1}
          onError={() => setStatus({ map, phase: "error" })}
        />
      )}
      {phase !== "ready" && (
        <div className={`original-map-status ${phase}`} role="status">
          {phase === "loading" && allowed ? (
            <span>Carregando mapa original…</span>
          ) : (
            <>
              <span>O mapa original {map} não carregou.</span>
              {allowed && <button onClick={retry}>Recarregar mapa</button>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
