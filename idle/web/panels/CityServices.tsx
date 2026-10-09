import type { ReactNode } from "react";

export type CityService = "shop" | "blacksmith" | "stylist";

function ServiceIcon({ children }: { children: ReactNode }) {
  return <span className="city-service-icon" aria-hidden="true">{children}</span>;
}

export default function CityServices({ onOpen }: { onOpen: (service: CityService, trigger: HTMLElement) => void }) {
  return <section className="city-services" aria-labelledby="city-services-title">
    <header className="city-services-intro">
      <span className="city-services-crest" aria-hidden="true">♜</span>
      <div>
        <h3 id="city-services-title">Serviços de Prontera</h3>
        <p>Cuide do seu equipamento e prepare-se para a próxima jornada.</p>
      </div>
    </header>
    <div className="city-service-grid">
      <button type="button" className="city-service-card" onClick={event => onOpen("shop", event.currentTarget)}>
        <ServiceIcon><span aria-hidden="true">⚗</span></ServiceIcon>
        <span className="city-service-copy"><b>Loja de poções</b><small>Suprimentos e lupas</small></span>
        <span className="city-service-arrow" aria-hidden="true">›</span>
      </button>
      <button type="button" className="city-service-card" onClick={event => onOpen("blacksmith", event.currentTarget)}>
        <ServiceIcon><span aria-hidden="true">⚒</span></ServiceIcon>
        <span className="city-service-copy"><b>Ferreiro</b><small>Oridecon, Elunium e refino</small></span>
        <span className="city-service-arrow" aria-hidden="true">›</span>
      </button>
      <button type="button" className="city-service-card" onClick={event => onOpen("stylist", event.currentTarget)}>
        <ServiceIcon><span aria-hidden="true">✂</span></ServiceIcon>
        <span className="city-service-copy"><b>Estilista</b><small>Cabelo e cor da roupa</small></span>
        <span className="city-service-arrow" aria-hidden="true">›</span>
      </button>
      <div className="city-service-card city-service-unavailable" aria-label="Quadro de quests, em breve">
        <ServiceIcon><span aria-hidden="true">▤</span></ServiceIcon>
        <span className="city-service-copy"><b>Quadro de quests</b><small>Em breve em Prontera</small></span>
        <span className="city-service-soon">Em breve</span>
      </div>
    </div>
    <p className="city-services-footnote">Os serviços da cidade ficam disponíveis enquanto você estiver em Prontera.</p>
  </section>;
}
