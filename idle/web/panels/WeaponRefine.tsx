import { useEffect, useRef, useState } from 'react';
import type { Catalog, GameState, InventoryEntry, Item } from '../../shared/types';
import { isItemIdentified } from '../../shared/loot';
import { weaponRefineChancePercent, weaponRefineMaterial } from '../../shared/weaponRefineRules';
import { ItemIcon, itemName, itemRarityBonus, itemRarityClass, itemRarityLabel, number, type PanelProps } from '../components/common';
import '../styles/weapon-refine.css';

type WindowOptions = {
  state?: GameState; profileId: string; ready: boolean; active: boolean; busy: boolean;
  command: PanelProps['command']; onOpen: () => void; onClose: () => void;
};
/** Network receipts own retries. Only explicit dismissal sends cancellation. */
export function useWeaponRefineWindow(options: WindowOptions) {
  const current = useRef(options); current.current = options;
  const resumed = useRef<string | null>(null), pending = useRef<string | null>(null);
  const mounted = useRef(false);
  const [closingKey, setClosingKey] = useState<string | null>(null);
  const menuId = options.state?.weaponRefineMenu?.id;
  const key = `${options.profileId}:${menuId ?? ''}`;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const value = current.current;
    if (!value.ready || value.state?.id !== value.profileId) { resumed.current = null; return; }
    const id = value.state.weaponRefineMenu?.id;
    if (id && resumed.current !== key) { resumed.current = key; value.onOpen(); }
  }, [options.ready, options.profileId, options.state?.id, menuId, key]);
  const close = () => {
    const value = current.current;
    if (!value.active) return false;
    const menu = value.state?.weaponRefineMenu;
    const requestKey = `${value.profileId}:${menu?.id ?? ''}`;
    if (value.busy || pending.current === requestKey) return true;
    if (!menu || value.state?.id !== value.profileId) { value.onClose(); return true; }
    pending.current = requestKey; setClosingKey(requestKey);
    const profileId = value.profileId, id = menu.id;
    void value.command({type: 'cancelWeaponRefine', menuId: id}).then(ok => {
      const latest = current.current;
      if (ok && mounted.current && latest.profileId === profileId && latest.state?.id === profileId &&
        (!latest.state.weaponRefineMenu || latest.state.weaponRefineMenu.id === id) && latest.active) latest.onClose();
    }).finally(() => {
      if (pending.current === requestKey) {
        pending.current = null;
        if (mounted.current) setClosingKey(null);
      }
    });
    return true;
  };
  return {close, closing: closingKey === key};
}

const percent = (value: number) => value.toLocaleString('pt-BR', {maximumFractionDigits: 1});
const resultTitle = {success: 'Refino concluído', failed: 'A arma foi destruída',
  cancelled: 'Refino cancelado', rejected: 'Não foi possível refinar', empty: 'Nenhuma arma disponível'};
function weaponTraits(catalog: Catalog, entry: InventoryEntry): string {
  const cards = isItemIdentified(entry)
    ? `Cartas: ${entry.cards.length ? entry.cards.map(id => catalog.items[id]?.name ?? `Carta #${id}`).join(', ') : 'nenhuma'}`
    : '';
  return [itemRarityLabel(entry), itemRarityBonus(entry), cards,
    entry.favorite ? 'Favorita' : '', entry.broken ? 'Quebrada' : ''].filter(Boolean).join(' · ');
}
function refineItemLabel(catalog: Catalog, item: Item, entry?: InventoryEntry): string {
  return `${itemName(item, entry)}${entry ? ` · ${weaponTraits(catalog, entry)}` : ''}`;
}
export default function WeaponRefine({catalog, snapshot, busy, command}: PanelProps) {
  const {state} = snapshot, menu = state.weaponRefineMenu;
  const [selectedUid, setSelectedUid] = useState(menu?.offeredWeapons[0]?.uid ?? '');
  const [accepted, setAccepted] = useState(false), [sending, setSending] = useState(false);
  const attempted = useRef<string | null>(null), mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const offered = menu?.offeredWeapons.find(entry => entry.uid === selectedUid) ?? menu?.offeredWeapons[0];
  const entry = state.inventory.find(entry => entry.uid === offered?.uid && entry.itemId === offered.itemId);
  const item = entry ? catalog.items[entry.itemId] : undefined;
  const selectionKey = JSON.stringify([state.id, menu?.id, offered?.uid, entry]);
  useEffect(() => { setAccepted(false); attempted.current = null; setSending(false); }, [selectionKey]);
  const validLevel = Number.isSafeInteger(item?.weaponLevel) && item!.weaponLevel! >= 1 && item!.weaponLevel! <= 4;
  const materialId = validLevel ? weaponRefineMaterial(item!.weaponLevel!) : undefined;
  const material = materialId ? catalog.items[materialId] : undefined;
  const owned = state.inventory.filter(entry => entry.itemId === materialId).reduce((n, entry) => n + entry.quantity, 0);
  let reason: string | undefined;
  if (!menu) reason = 'Abra um novo menu pela habilidade Refino de Arma.';
  else if (!entry || !item || item.type !== 'equipment' || item.slot !== 'weapon' || item.refinable === false || !validLevel)
    reason = 'Esta arma não está mais disponível para refino.';
  else if (!isItemIdentified(entry)) reason = 'Identifique a arma antes de refinar.';
  else if (Object.values(state.equipment).includes(entry.uid)) reason = 'Desequipe a arma antes de refinar.';
  else if (!Number.isSafeInteger(entry.refine) || entry.refine < 0 || entry.refine >= 10) reason = 'Esta arma já está no limite de refino.';
  else if (entry.refine >= menu.learnedLimit) reason = `Sua habilidade permite refinar até +${menu.learnedLimit}.`;
  else if (owned < 1) reason = `Falta 1 ${material?.name ?? 'minério'} na mochila.`;
  const chance = item && validLevel && entry && Number.isSafeInteger(entry.refine) && entry.refine >= 0 && entry.refine < 10
    ? weaponRefineChancePercent(item.weaponLevel!, entry.refine, state.jobLevel) : undefined;
  const locked = busy || sending || attempted.current === selectionKey;
  const result = state.weaponRefineResult;
  return <div className="weapon-refine">
    <p className="weapon-refine-sp">{menu ? 'SP já pago ao abrir. Selecionar ou cancelar não cobra SP.' : 'O menu foi encerrado.'}</p>
    <p className="weapon-refine-warning" role="note">Em caso de falha, a arma será destruída, incluindo cartas e bônus.</p>
    {menu && <div className="weapon-refine-workbench">
      <label className="weapon-refine-select">Arma
        <select value={offered?.uid ?? ''} disabled={locked} onChange={event => {
          setSelectedUid(event.currentTarget.value); setAccepted(false);
        }}>
          {menu.offeredWeapons.map(offered => {
            const own = state.inventory.find(e => e.uid === offered.uid && e.itemId === offered.itemId), definition = catalog.items[offered.itemId];
            const label = definition ? refineItemLabel(catalog, definition, own) : 'Arma indisponível';
            return <option key={offered.uid} value={offered.uid} title={label}>{label}</option>;
          })}
        </select>
      </label>
      {entry && item && <section className={`weapon-refine-detail ${itemRarityClass(entry)}`} aria-label="Arma selecionada">
        <header><ItemIcon item={item}/><div><b>{itemName(item, entry)}</b><small>Arma nível {item.weaponLevel}</small></div></header>
        <p className="weapon-refine-identity">{weaponTraits(catalog, entry)}</p>
        <dl><div><dt>Refinamento</dt><dd>Atual +{entry.refine} → Próximo +{entry.refine + 1}</dd></div>
          <div><dt>Material</dt><dd>{material && <ItemIcon item={material}/>}1 {material?.name ?? '—'}<small>Na mochila: {number(owned)}</small></dd></div>
          <div><dt>Sucesso</dt><dd className="weapon-refine-chance">{chance == null ? '—' : `${percent(chance)}%`}<small>Job atual {state.jobLevel} · Limite +{menu.learnedLimit}</small></dd></div></dl>
        {entry.broken && <p className="weapon-refine-condition">Arma quebrada: refinar não conserta o equipamento.</p>}
      </section>}
      {reason && <p className="weapon-refine-reason" data-refine-reason role="status">{reason}</p>}
      <label className="weapon-refine-confirm"><input type="checkbox" checked={accepted} disabled={locked || !!reason}
        onChange={event => setAccepted(event.currentTarget.checked)}/><span>Entendo que posso perder esta arma, suas cartas e bônus.
          {entry && item && <span className="weapon-refine-confirm-selection">{refineItemLabel(catalog, item, entry)}</span>}
        </span></label>
      <button type="button" className="primary weapon-refine-submit" disabled={locked || !!reason || !accepted}
        onClick={async () => {
          if (busy || sending || reason || !accepted || !menu || !offered || attempted.current === selectionKey) return;
          attempted.current = selectionKey; setSending(true);
          try {
            const ok = await command({type: 'weaponRefine', menuId: menu.id, uid: offered.uid});
            if (!ok && attempted.current === selectionKey) attempted.current = null;
          } finally { if (mounted.current) setSending(false); }
        }}>{sending ? 'Aguardando resultado…' : 'Confirmar refino'}</button>
    </div>}
    <section className={`weapon-refine-result${result ? ` is-${result.outcome}` : ''}`} role="status" aria-live="polite" aria-atomic="true">
      {result ? <><b>{resultTitle[result.outcome]}</b><span>{result.message ?? (result.outcome === 'failed'
        ? 'A arma, suas cartas e bônus foram perdidos.' : result.outcome === 'success'
        ? `Sua arma recebeu o refino +${result.toRefine ?? '1'}.` : result.outcome === 'rejected'
        ? 'A seleção deixou de ser válida. Confira a mochila antes de abrir outro menu.' : result.outcome === 'empty'
        ? 'É necessário ter uma arma refinável, identificada e desequipada na mochila.' : 'O SP de abertura já foi consumido.')}</span></>
        : <span>O resultado será exibido aqui e no diário de aventura.</span>}
    </section>
  </div>;
}
