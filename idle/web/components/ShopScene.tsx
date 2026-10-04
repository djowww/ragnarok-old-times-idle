import { useState } from "react";
import { ActorPreview } from "./Scene";
import OriginalMap, { type MapStatus } from "./OriginalMap";
import { mapCellPoint, projectMapPoint, type MapProjection } from "../assets/mapProjection";
import { GAME_ACTOR_SCALE } from "../assets/renderer";

const TOOL_DEALER = {
  spr: "data/sprite/npc/1_m_innkeeper.spr",
  act: "data/sprite/npc/1_m_innkeeper.act",
};

/** Local GRF scenery and the original Prontera Tool Dealer sprite. */
export default function ShopScene({ onMapStatusChange }: { onMapStatusChange?: (status: MapStatus) => void }) {
  const [projection, setProjection] = useState<MapProjection | null>(null);
  const npc = projection ? projectMapPoint(projection,
    mapCellPoint(projection, 126, 76), projection.viewport.width, projection.viewport.height) : null;
  return (
    <section className="scene shop-scene" aria-label="Interior da loja de poções de Prontera">
      <OriginalMap map="prt_in" onProjection={setProjection} onStatusChange={onMapStatusChange} />
      {npc && <div className="shop-npc" style={{ left: npc.x, top: npc.y,
        transform: `translate(-50%, calc(-100% + ${8 * npc.scale * GAME_ACTOR_SCALE}px))` }}>
        <ActorPreview asset={TOOL_DEALER} name="Vendedor de poções de Prontera" size="world" displayScale={npc.scale} direction={((projection?.direction ?? 0) + 4) % 8} />
        <span className="shop-npc-caption" style={{ position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)" }}>Vendedor de poções</span>
      </div>}
    </section>
  );
}
