import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { DerivedStats, Stat } from "../../shared/types";
import { MAX_BASE_STAT, statPointCost } from "../../engine/stats";
import { FALLBACK_ICON, getBitmapUrl } from "../assets/items";
import type { PanelProps } from "./common";

// WinStats V0, roBrowserLegacy d88a3cd: the local bitmap supplies its labels.
const attributes: ReadonlyArray<{ stat: Stat; name: string; label: string; hint: string }> = [
  { stat: "str", name: "Força", label: "For", hint: "Aumenta ATK corpo a corpo e o limite de peso; com arco, contribui como atributo secundário." },
  { stat: "agi", name: "Agilidade", label: "Agi", hint: "Aumenta FLEE e ASPD: esquiva comum e velocidade de ataque." },
  { stat: "vit", name: "Vitalidade", label: "Vit", hint: "Aumenta HP máximo, defesa por VIT e recuperação de HP." },
  { stat: "int", name: "Inteligência", label: "Int", hint: "Aumenta MATK, SP máximo, defesa mágica e recuperação de SP." },
  { stat: "dex", name: "Destreza", label: "Des", hint: "Aumenta HIT e ASPD, reduz a conjuração e é o atributo principal do arco." },
  { stat: "luk", name: "Sorte", label: "Sor", hint: "Aumenta CRIT, esquiva perfeita e uma parte do ATK." },
];

const interfaceFiles = {
  panel: "statwin0_bg.bmp",
  titlebar: "titlebar_mid.bmp",
  base: "sys_base_off.bmp",
  mini: "sys_mini_off.bmp",
  miniHover: "sys_mini_on.bmp",
  close: "sys_close_off.bmp",
  closeHover: "sys_close_on.bmp",
  arrow: "arw_right.bmp",
  arrowPressed: "arw_right_on.bmp",
} as const;
type InterfaceAsset = keyof typeof interfaceFiles;

function statusValues(stats: DerivedStats, base: Record<Stat, number>) {
  const a = stats.attributes ?? base;
  const aspd = stats.aspd ?? 200 - stats.attackIntervalMs / 20;
  const perfectDodge = stats.perfectDodge ?? (a.luk + 10) / 10 + (stats.effects.perfectDodge ?? 0);
  const fraction = (value: number) => value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  const addendum = (value: number) => value < 0 ? `- ${-value}` : `+ ${value}`;
  return [
    { label: "ATK", shortLabel: "Atq", value: `${stats.attack - (stats.weaponRefineAttack ?? 0)} ${addendum(stats.weaponRefineAttack ?? 0)}`, hint: "Ataque de atributos e arma + ataque de refino." },
    { label: "MATK", shortLabel: "AtqM", value: stats.magicAttack.join(" ~ "), hint: "Ataque mágico mínimo ~ máximo." },
    { label: "HIT", shortLabel: "Precisão", value: String(stats.hit), hint: "Precisão. O acerto também depende da FLEE do alvo." },
    { label: "CRIT", shortLabel: "Crítico", value: String(Math.floor(stats.crit)), hint: `Crítico: ${fraction(stats.crit)}% antes da resistência por LUK do alvo.` },
    { label: "DEF", shortLabel: "Def", value: `${stats.def} ${addendum(stats.softDef ?? a.vit)}`, hint: "Defesa de equipamento + defesa por VIT. A redução por VIT varia em cada golpe." },
    // pc.h:813: the classic status window excludes VIT/2 from its right-side MDEF.
    { label: "MDEF", shortLabel: "DefM", value: `${stats.hardMdef ?? stats.effects.mdef ?? 0} ${addendum(a.int)}`, hint: `Defesa mágica de equipamento + INT. Em combate, a redução fixa inclui VIT/2: ${stats.softMdef ?? a.int + Math.floor(a.vit / 2)}.` },
    { label: "FLEE", shortLabel: "Esqv", value: `${stats.flee} ${addendum(Math.floor(perfectDodge))}`, hint: `Esquiva comum + esquiva perfeita. Esquiva perfeita real: ${fraction(perfectDodge)}%.` },
    { label: "ASPD", shortLabel: "VelAtq", value: String(Math.floor(aspd)), hint: `Velocidade de ataque: ${fraction(aspd)} ASPD; intervalo de ${fraction(stats.attackIntervalMs / 1000)} s. Limite clássico: 190.` },
  ];
}

export default function ClassicStatus({ snapshot, busy, command }: PanelProps) {
  const { state, stats } = snapshot;
  const panel = useRef<HTMLElement>(null);
  const [assets, setAssets] = useState<Partial<Record<InterfaceAsset, string>>>({});
  const [titlebar, setTitlebar] = useState<HTMLElement | null>(null);
  const [reduced, setReduced] = useState(false);

  useLayoutEffect(() => {
    setTitlebar(panel.current?.closest(".ro-window-stats")?.querySelector<HTMLElement>(".ro-window-titlebar") ?? null);
  }, []);

  useEffect(() => {
    let live = true;
    void Promise.all(Object.entries(interfaceFiles).map(async ([key, file]) => {
      const value = await getBitmapUrl(`data/texture/유저인터페이스/basic_interface/${file}`);
      return [key, value === FALLBACK_ICON ? undefined : value] as const;
    })).then(entries => {
      if (live) setAssets(Object.fromEntries(entries));
    });
    return () => { live = false; };
  }, []);

  const assetRules = Object.entries(assets).filter(([, value]) => value)
    .map(([key, value]) => `--classic-status-${key}: url("${value}");`).join("\n");

  return <>
    {/* Decoded PNGs preserve the client's magenta transparency in the existing shell. */}
    <style>{`.ro-window-stats, .classic-status { ${assetRules}${assets.close ? "--classic-status-close-text: 0px;" : ""} }`}</style>
    {titlebar && createPortal(
      <button type="button" className="classic-status-mini"
        aria-label={reduced ? "Expandir atributos" : "Recolher atributos"}
        aria-expanded={!reduced} title={reduced ? "Expandir atributos" : "Recolher atributos"}
        onClick={() => setReduced(value => !value)}>
        <span aria-hidden="true">{assets.mini ? "" : "−"}</span>
      </button>, titlebar,
    )}
    <section ref={panel} className={`classic-status${assets.panel ? " has-art" : ""}`}
      hidden={reduced} aria-label="Atributos e valores de combate">
      {attributes.map((attribute, index) => {
        const value = state.stats[attribute.stat];
        const bonus = (stats.attributes?.[attribute.stat] ?? value) - value;
        const cost = statPointCost(value);
        const maximum = value >= MAX_BASE_STAT;
        const unavailable = maximum || cost <= 0 || state.statPoints < cost;
        const hint = `${attribute.name}: ${attribute.hint}`;
        return <div className="classic-status-row" key={attribute.stat}
          style={{ top: 6 + index * 16 }} title={hint}>
          <span className="classic-status-label">{attribute.label}</span>
          <output className="classic-status-base" aria-label={`${attribute.name}: base ${value}, bônus ${bonus}`}>{value}</output>
          <span className="classic-status-bonus" aria-hidden="true">{bonus < 0 ? `- ${-bonus}` : bonus > 0 ? `+${bonus}` : ""}</span>
          <button type="button" className="classic-status-up" hidden={unavailable}
            aria-label={`Aumentar ${attribute.name} em 1, custo ${cost} pontos`}
            title={`${hint} Aumentar em 1 custa ${cost} pontos.`}
            disabled={busy || unavailable}
            onClick={() => void command({ type: "allocate", stat: attribute.stat, amount: 1 })}>
            <span aria-hidden="true">{assets.arrow ? "" : "▸"}</span>
          </button>
          <span className="classic-status-cost" aria-label={maximum ? `${attribute.name}: limite de ${MAX_BASE_STAT}` : `Custo: ${cost} pontos`}>{cost}</span>
        </div>;
      })}
      <dl className="classic-status-combat">
        {statusValues(stats, state.stats).map((entry, index) => <div key={entry.label}
          className={index < 4 ? "classic-status-column1" : "classic-status-column2"}
          style={{ top: 6 + (index % 4) * 16 }} title={`${entry.label}: ${entry.hint}`}>
          <dt className="classic-status-label">{entry.shortLabel}</dt>
          <dd aria-label={`${entry.label}: ${entry.value}`}>{entry.value}</dd>
        </div>)}
        <div className="classic-status-points" title="Pontos de atributo disponíveis">
          <dt className="classic-status-label">Pontos de Atrib</dt>
          <dd aria-label="Pontos de atributo disponíveis" aria-live="polite">{state.statPoints}</dd>
        </div>
        <div className="classic-status-clan" aria-label="Clã: sem clã">
          <dt className="classic-status-label">Clã</dt><dd />
        </div>
      </dl>
    </section>
  </>;
}
