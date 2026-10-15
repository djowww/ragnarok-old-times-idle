import type { ReactNode } from "react";
import type { Catalog } from '../../shared/types';
import { ItemIcon } from '../components/common';

export type CityService = "shop" | "blacksmith" | "stylist" | "converters" | "pharmacy";

function ServiceIcon({ children }: { children: ReactNode }) {
  return <span className="city-service-icon" aria-hidden="true">{children}</span>;
}

export default function CityServices({ onOpen, catalog }: { onOpen: (service: CityService, trigger: HTMLElement) => void; catalog?: Catalog }) {
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
      <button type="button" className="city-service-card" onClick={event => onOpen("converters", event.currentTarget)}>
        <ServiceIcon>{catalog?.items[12114] && <ItemIcon item={catalog.items[12114]} />}</ServiceIcon>
        <span className="city-service-copy"><b>Conversores elementais</b><small>Receitas do Sábio</small></span>
        <span className="city-service-arrow" aria-hidden="true">›</span>
      </button>
      <button type="button" className="city-service-card" onClick={event => onOpen("pharmacy", event.currentTarget)}>
        <ServiceIcon>{catalog?.items[7134] && <ItemIcon item={catalog.items[7134]} />}</ServiceIcon>
        <span className="city-service-copy"><b>Preparar poções</b><small>Receitas do Alquimista</small></span>
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
