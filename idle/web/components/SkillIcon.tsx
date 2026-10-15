import { useEffect, useState } from "react";
import type { Skill } from "../../shared/types";
import { FALLBACK_ICON, getBitmapUrl } from "../assets/items";

/** Loads the original 24×24 client icon without distributing the GRF in the app. */
export default function SkillIcon({ skill }: { skill: Skill }) {
  const [image, setImage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let retryTimer: number | undefined;
    let attempts = 0;
    const resource = skill.iconResource;
    setImage(null);
    const load = () => {
      if (!active || !resource) return;
      const attempt = attempts++;
      void getBitmapUrl(resource).then((url) => {
        if (!active) return;
        if (url !== FALLBACK_ICON) {
          setImage(url);
        } else if (attempt < 2) {
          retryTimer = window.setTimeout(load, (attempt + 1) * 1000);
        }
      });
    };
    load();
    return () => {
      active = false;
      window.clearTimeout(retryTimer);
    };
  }, [skill.iconResource]);

  return (
    <span className="skill-icon" aria-hidden="true">
      {image
        ? <img src={image} alt="" draggable={false} />
        : <span className="skill-icon-fallback">{skill.name.slice(0, 2)}</span>}
    </span>
  );
}
