import { useEffect, useRef, useState } from "react";

export default function AudioToggle() {
  const audio = useRef<HTMLAudioElement | null>(null);
  const alive = useRef(true);
  const timer = useRef<number | undefined>(undefined);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      window.clearTimeout(timer.current);
      if (audio.current) {
        audio.current.pause();
        audio.current.removeAttribute("src");
        audio.current.load();
        audio.current = null;
      }
    };
  }, []);
  const toggle = async () => {
    setError(false);
    if (playing) {
      audio.current?.pause();
      setPlaying(false);
      return;
    }
    if (!audio.current) {
      const element = new Audio("/assets/BGM/01.mp3");
      element.loop = true;
      element.volume = 0.12;
      element.preload = "none";
      element.addEventListener("error", () => {
        if (alive.current) {
          setError(true);
          setPlaying(false);
          setLoading(false);
        }
      });
      audio.current = element;
    }
    const element = audio.current;
    if (element.error) element.load();
    setLoading(true);
    timer.current = window.setTimeout(() => {
      element.pause();
      if (alive.current) {
        setLoading(false);
        setError(true);
      }
    }, 15000);
    try {
      // play() is called directly from the user's gesture. Nothing is played on
      // mount, restored from preferences, or fetched before the first click.
      await element.play();
      if (alive.current) setPlaying(true);
    } catch {
      if (alive.current) {
        setPlaying(false);
        setError(true);
      }
    } finally {
      window.clearTimeout(timer.current);
      if (alive.current) setLoading(false);
    }
  };
  return (
    <div className="audio-controls">
      <button
        className="audio-toggle"
        disabled={loading}
        aria-pressed={playing}
        onClick={() => void toggle()}
        title={playing ? "Desligar música" : "Ligar música"}
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
