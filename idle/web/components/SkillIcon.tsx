import { useEffect, useState } from "react";
import type { Skill } from "../../shared/types";
import { FALLBACK_ICON, getBitmapUrl } from "../assets/items";

/** Loads the original 24×24 client icon without distributing the GRF in the app. */
export default function SkillIcon({ skill }: { skill: Skill }) {
  const [image, setImage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setImage(null);
    if (skill.iconResource) {
      void getBitmapUrl(skill.iconResource).then((url) => {
        if (active && url !== FALLBACK_ICON) setImage(url);
      });
    }
    return () => { active = false; };
  }, [skill.iconResource]);

  return (
    <span className="skill-icon" aria-hidden="true">
      {image
        ? <img src={image} alt="" draggable={false} />
        : <span className="skill-icon-fallback">{skill.name.slice(0, 2)}</span>}
    </span>
  );
}
