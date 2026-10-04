import { ActorPreview } from "./Scene";
import OriginalMap from "./OriginalMap";

const TOOL_DEALER = {
  spr: "data/sprite/npc/1_m_innkeeper.spr",
  act: "data/sprite/npc/1_m_innkeeper.act",
};

/** Local GRF scenery and the original Prontera Tool Dealer sprite. */
export default function ShopScene() {
  return (
    <section className="scene shop-scene" aria-label="Interior da loja de poções de Prontera">
      <OriginalMap map="prt_in" />
      <div className="shop-npc">
        <ActorPreview asset={TOOL_DEALER} name="Vendedor de poções de Prontera" large />
        <span className="shop-npc-caption">Vendedor de poções</span>
      </div>
    </section>
  );
}
