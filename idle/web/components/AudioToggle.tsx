import { useCallback, useEffect, useRef, useState } from "react";
import { bgmForMap } from "./mapBgm";

export default function AudioToggle({ map }: { map: string }) {
  const track = bgmForMap(map);
  const audio = useRef<HTMLAudioElement | null>(null);
  const wanted = useRef(false);
  const attempt = useRef(0);
  const timer = useRef<number | undefined>(undefined);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const cancel = useCallback(() => {
    attempt.current += 1;
    window.clearTimeout(timer.current);
  }, []);
  const start = useCallback(async (element: HTMLAudioElement) => {
    window.clearTimeout(timer.current);
    const id = ++attempt.current;
    setError(false);
    setLoading(true);
    const fail = () => {
      if (id !== attempt.current) return;
      cancel();
      element.pause();
      wanted.current = false;
      setPlaying(false);
      setLoading(false);
      setError(true);
    };
    timer.current = window.setTimeout(fail, 15000);
    try {
      await element.play();
      if (id !== attempt.current) return;
      window.clearTimeout(timer.current);
      setPlaying(true);
      setLoading(false);
    } catch {
      fail();
    }
  }, [cancel]);
  useEffect(() => {
    const element = new Audio();
    element.loop = true;
    element.volume = 0.12;
    element.preload = "none";
    const onError = () => {
      cancel();
      element.pause();
      wanted.current = false;
      setError(true);
      setPlaying(false);
      setLoading(false);
    };
    element.addEventListener("error", onError);
    audio.current = element;
    return () => {
      cancel();
      element.removeEventListener("error", onError);
      element.pause();
      element.removeAttribute("src");
      element.load();
      audio.current = null;
    };
  }, [cancel]);
  // Maps sharing the same filename keep their track playing uninterrupted.
  useEffect(() => {
    const element = audio.current;
    if (!element) return;
    cancel();
    element.pause();
    setPlaying(false);
    setLoading(false);
    setError(false);
    if (!track) {
      element.removeAttribute("src");
      element.load();
      wanted.current = false;
      setError(true);
      return;
    }
    element.src = `/assets/BGM/${track}`;
    if (wanted.current) void start(element);
  }, [track, cancel, start]);
  const toggle = () => {
    const element = audio.current;
    if (!element || !track) return;
    if (wanted.current) {
      wanted.current = false;
      cancel();
      element.pause();
      setPlaying(false);
      setLoading(false);
      return;
    }
    wanted.current = true;
    if (element.error) element.load();
    // Initial playback is requested directly from the user's gesture.
    void start(element);
  };
  return (
    <div className="audio-controls" data-bgm-map={map} data-bgm-track={track}
      data-bgm-src={audio.current?.currentSrc || undefined}>
      <button
        className="audio-toggle"
        disabled={!track}
        aria-pressed={playing || loading}
        onClick={toggle}
        title={playing || loading ? "Desligar música" : "Ligar música"}
      >
        {loading ? "Carregando…" : playing ? "Música ligada" : "Música"}
      </button>
      {error && (
        <span className="audio-error" role="status">
          A música está indisponível. Toque em Música para tentar novamente.
        </span>
      )}
    </div>
  );
}
