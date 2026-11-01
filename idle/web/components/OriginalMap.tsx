import { useEffect, useRef, useState } from "react";
import { readMapProjection, type MapProjection, type WorldPoint } from "../assets/mapProjection";
import { NativeActorsBridge } from "../assets/nativeActors";
import { getClassicClientPaths } from "../public-client-routing";
export type { MapProjection } from "../assets/mapProjection";

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

export type MapStatus = { map: string; phase: "loading" | "ready" | "error"; progress?: number };

/** The local roBrowserLegacy MapViewer is a scenery layer; idle combat stays in React. */
export default function OriginalMap({
  map,
  onStatusChange,
  onProjection,
  followTarget,
  nativeActors,
}: {
  map: string;
  onStatusChange?: (status: MapStatus) => void;
  onProjection?: (projection: MapProjection | null) => void;
  followTarget?: { current: WorldPoint | null };
  nativeActors?: { current: NativeActorsBridge | null };
}) {
  const host = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const actorBridge = useRef<NativeActorsBridge | null>(null);
  const projectionCallback = useRef(onProjection);
  projectionCallback.current = onProjection;
  const [attempt, setAttempt] = useState(0);
  const allowed = localMaps.has(map);
  const [status, setStatus] = useState<MapStatus>({ map, phase: allowed ? "loading" : "error" });
  const { origin, mapViewer } = getClassicClientPaths(window.location);
  const phase = status.map === map ? status.phase : allowed ? "loading" : "error";
  const resetActors = (connect = false) => {
    actorBridge.current?.dispose();
    actorBridge.current = connect && allowed && nativeActors && frame.current?.contentWindow
      ? new NativeActorsBridge(frame.current.contentWindow, origin, map) : null;
    if (nativeActors) nativeActors.current = actorBridge.current;
  };

  useEffect(() => {
    if (!followTarget || phase !== "ready") return;
    const timer = window.setInterval(() => {
      frame.current?.contentWindow?.postMessage({ type: "ragidle-map-follow", map,
        world: followTarget.current }, origin);
    }, 100);
    return () => window.clearInterval(timer);
  }, [map, origin, phase, followTarget]);

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
    resetActors();
    projectionCallback.current?.(null);
    if (!allowed) {
      setStatus({ map, phase: "error" });
      return;
    }
    setStatus({ map, phase: "loading" });
    // Terrain is static for this iframe. The native bridge sends it once so
    // follow-camera matrix updates stay small enough for animation frames.
    let ground: MapProjection["ground"];
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== origin || event.source !== frame.current?.contentWindow)
        return;
      const data = event.data as Record<string, unknown> | null;
      if (!data || data.map !== map) return;
      actorBridge.current?.receive(data);
      if (data.type === "ragidle-map-progress" && typeof data.progress === "number" && Number.isFinite(data.progress))
        setStatus(old => old.phase === "ready" || old.phase === "error" ? old : {
          map, phase: "loading", progress: Math.max(old.progress ?? 0, Math.max(0, Math.min(99, data.progress as number))),
        });
      if (data.type === "ragidle-map-ready") setStatus({ map, phase: "ready", progress: 100 });
      if (data.type === "ragidle-map-error") {
        resetActors();
        setStatus({ map, phase: "error" });
        projectionCallback.current?.(null);
      }
      if (data.type === "ragidle-map-camera") {
        const camera = readMapProjection(data);
        if (camera) {
          ground = camera.ground ?? ground;
          projectionCallback.current?.({ ...camera, ...(ground ? { ground } : {}) });
        }
      }
    };
    window.addEventListener("message", onMessage);
    const timeout = window.setTimeout(() => setStatus((old) =>
      old.map === map && old.phase === "loading"
        ? { map, phase: "error" }
        : old,
    ), 60000);
    return () => {
      resetActors();
      window.removeEventListener("message", onMessage);
      window.clearTimeout(timeout);
    };
  }, [map, attempt, allowed, origin, nativeActors]);

  useEffect(() => {
    onStatusChange?.({ map, phase, progress: status.map === map ? status.progress ?? 0 : 0 });
  }, [map, phase, status.progress, status.map, onStatusChange]);

  const retry = () => {
    resetActors();
    projectionCallback.current?.(null);
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
          src={`${mapViewer}?attempt=${attempt}#${map}.rsw`}
          title={`Cenário original de ${map}`}
          tabIndex={-1}
          onLoad={() => resetActors(true)}
          onError={() => { resetActors(); setStatus({ map, phase: "error" }); }}
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
