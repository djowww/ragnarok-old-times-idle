import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { PanelProps } from '../components/common';
import type { AccountView } from '../../shared/portal-types';
import '../admin.css';

type AdminSession = { enabled: boolean; authenticated: boolean };
type AdminAction =
  | { type: 'baseLevels'; amount: number }
  | { type: 'jobLevels'; amount: number }
  | { type: 'class'; classId: string }
  | { type: 'zeny'; amount: number }
  | { type: 'item'; itemId: number; quantity: number };

const PENDING_ADMIN_REQUESTS_KEY = 'ragidle-admin-pending-action-ids-v1';

function pendingAdminRequestKey(identity: Pick<AccountView, 'accountId' | 'profileId'>) {
  return `${PENDING_ADMIN_REQUESTS_KEY}:${encodeURIComponent(identity.accountId)}:${encodeURIComponent(identity.profileId)}`;
}

function restorePendingAdminRequestIds(identity: Pick<AccountView, 'accountId' | 'profileId'>): Map<string, string> {
  const pending = new Map<string, string>();
  try {
    const saved: unknown = JSON.parse(sessionStorage.getItem(pendingAdminRequestKey(identity)) ?? '{}');
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
      for (const [action, requestId] of Object.entries(saved))
        if (typeof requestId === 'string' && /^[A-Za-z0-9_-]{12,64}$/.test(requestId)) pending.set(action, requestId);
    }
  } catch { /* Storage can be unavailable in private browser contexts. */ }
  return pending;
}

function persistPendingAdminRequestIds(identity: Pick<AccountView, 'accountId' | 'profileId'>, pending: Map<string, string>) {
  try { sessionStorage.setItem(pendingAdminRequestKey(identity), JSON.stringify(Object.fromEntries(pending))); }
  catch { /* The in-memory IDs still protect retries until this panel unmounts. */ }
}

type AdminScope = { key: string; controller: AbortController };
function identityHeaders(identity: AccountView, json = false) {
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    'X-Idle-Expected-Identity': JSON.stringify([identity.accountId, identity.profileId]),
  };
}

async function readSession(identity: AccountView, signal: AbortSignal): Promise<AdminSession> {
  const response = await fetch('/api/admin/session', { cache: 'no-store', signal, headers: identityHeaders(identity) });
  const result = await response.json() as AdminSession & { error?: { code?: string; message?: string } };
  if (!response.ok) throw Object.assign(new Error(result.error?.message ?? 'Não foi possível consultar o painel administrativo.'), { code: result.error?.code });
  return result;
}

export default function Admin({ catalog, snapshot, identity, onAuthRequired, onChanged }: PanelProps & { identity: AccountView; onAuthRequired: () => void; onChanged: () => void }) {
  const identityKey = JSON.stringify([identity.accountId, identity.profileId]);
  const identityKeyRef = useRef(identityKey); identityKeyRef.current = identityKey;
  const authRequired = useRef(onAuthRequired); authRequired.current = onAuthRequired;
  const scopeRef = useRef<AdminScope | null>(null);
  const [sessionState, setSessionState] = useState<{ key: string; value: AdminSession } | null>(null);
  const session = sessionState?.key === identityKey ? sessionState.value : null;
  const [token, setToken] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [itemSearch, setItemSearch] = useState('');
  const [itemId, setItemId] = useState(501);
  const [itemQuantity, setItemQuantity] = useState(1);
  const [baseLevels, setBaseLevels] = useState(1);
  const [jobLevels, setJobLevels] = useState(1);
  const [zeny, setZeny] = useState(1000);
  const [classId, setClassId] = useState(snapshot.state.job);
  const actionRequestIds = useRef(restorePendingAdminRequestIds(identity));

  useEffect(() => {
    const scope: AdminScope = { key: identityKey, controller: new AbortController() };
    scopeRef.current = scope;
    actionRequestIds.current = restorePendingAdminRequestIds(identity);
    setSessionState(null); setNotice(''); setToken(''); setActionBusy(false); setLoginBusy(false);
    const current = () => scopeRef.current === scope && identityKeyRef.current === scope.key && !scope.controller.signal.aborted;
    void readSession(identity, scope.controller.signal).then(value => { if (current()) setSessionState({ key: identityKey, value }); })
      .catch(error => { if (current()) { if ((error as Error & { code?: string }).code === 'AUTH_REQUIRED') authRequired.current(); else setNotice((error as Error).message); } });
    return () => { scope.controller.abort(); if (scopeRef.current === scope) scopeRef.current = null; };
  }, [identityKey]);

  function currentScope() {
    const scope = scopeRef.current;
    return scope && scope.key === identityKey && identityKeyRef.current === identityKey && !scope.controller.signal.aborted ? scope : null;
  }

  const classes = useMemo(() => Object.values(catalog.classes)
    .filter(job => !job.gender || job.gender === snapshot.state.gender)
    .sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name, 'pt-BR')), [catalog.classes, snapshot.state.gender]);
  const items = useMemo(() => Object.values(catalog.items)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), [catalog.items]);
  const matches = useMemo(() => {
    const query = itemSearch.trim().toLocaleLowerCase('pt-BR');
    if (!query) return items.filter(item => item.id === itemId).slice(0, 20);
    return items.filter(item => `${item.id} ${item.name}`.toLocaleLowerCase('pt-BR').includes(query)).slice(0, 30);
  }, [items, itemSearch, itemId]);
  const selectedItem = catalog.items[itemId];
  const jobCap = catalog.classes[snapshot.state.job].jobCap;
  const grantedJobLevels = Math.min(jobLevels, Math.max(0, jobCap - snapshot.state.jobLevel));

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const scope = currentScope(); if (!scope) return;
    setLoginBusy(true);
    setNotice('');
    try {
      const response = await fetch('/api/admin/session', {
        method: 'POST', headers: identityHeaders(identity, true),
        body: JSON.stringify({ token }), cache: 'no-store', signal: scope.controller.signal,
      });
      const result = await response.json() as AdminSession & { error?: { message?: string } };
      if (currentScope() !== scope) return;
      if ((result as AdminSession & { error?: { code?: string } }).error?.code === 'AUTH_REQUIRED') { authRequired.current(); return; }
      if (!response.ok) throw new Error(result.error?.message ?? 'Acesso administrativo negado.');
      setSessionState({ key: identityKey, value: result });
      setToken('');
      setNotice('Acesso administrativo liberado para esta sessão.');
    } catch (error) {
      if (currentScope() === scope) setNotice((error as Error).message);
    } finally {
      if (currentScope() === scope) setLoginBusy(false);
    }
  }

  async function run(action: AdminAction, success: string) {
    const scope = currentScope(); if (!scope) return;
    setActionBusy(true);
    setNotice('');
    const actionKey = JSON.stringify(action);
    const requestId = actionRequestIds.current.get(actionKey) ?? crypto.randomUUID();
    actionRequestIds.current.set(actionKey, requestId);
    persistPendingAdminRequestIds(identity, actionRequestIds.current);
    try {
      const response = await fetch('/api/admin/action', {
        method: 'POST', headers: identityHeaders(identity, true),
        body: JSON.stringify({ requestId, action }), cache: 'no-store', signal: scope.controller.signal,
      });
      const result = await response.json() as { error?: { code?: string; message?: string } };
      if (currentScope() !== scope) return;
      if (result.error?.code === 'AUTH_REQUIRED') { authRequired.current(); return; }
      if (!response.ok) {
        if (response.status === 401) setSessionState(value => value?.key === identityKey ? { ...value, value: { ...value.value, authenticated: false } } : value);
        throw new Error(result.error?.message ?? 'Não foi possível aplicar a alteração.');
      }
      actionRequestIds.current.delete(actionKey);
      persistPendingAdminRequestIds(identity, actionRequestIds.current);
      onChanged();
      setNotice(success);
    } catch (error) {
      if (currentScope() === scope) setNotice((error as Error).message);
    } finally {
      if (currentScope() === scope) setActionBusy(false);
    }
  }

  async function logout() {
    const scope = currentScope(); if (!scope) return;
    try {
      const response = await fetch('/api/admin/logout', { method: 'POST', cache: 'no-store', headers: identityHeaders(identity, true), body: '{}', signal: scope.controller.signal });
      const result = await response.json() as { error?: { code?: string } };
      if (currentScope() !== scope) return;
      if (result.error?.code === 'AUTH_REQUIRED') { authRequired.current(); return; }
    } catch { /* A failed logout still closes this tab's local admin panel. */ }
    if (currentScope() !== scope) return;
    actionRequestIds.current.clear();
    try { sessionStorage.removeItem(pendingAdminRequestKey(identity)); } catch { /* Storage may be unavailable. */ }
    setSessionState(value => value?.key === identityKey ? { ...value, value: { ...value.value, authenticated: false } } : value);
    setNotice('Sessão administrativa encerrada.');
  }

  if (!session) return <div className="admin-panel" aria-live="polite">
    <div className="admin-panel-heading"><span className="admin-seal" aria-hidden="true">R</span><div><h3>Painel administrativo</h3><p>Conectando ao controle do servidor…</p></div></div>
    {notice && <p className="admin-message" role="status">{notice}</p>}
  </div>;

  if (!session.enabled) return <div className="admin-panel">
    <div className="admin-panel-heading"><span className="admin-seal" aria-hidden="true">R</span><div><h3>Painel administrativo</h3><p>Controle restrito do personagem</p></div></div>
    <div className="admin-gate"><strong>Configuração necessária</strong><p>O servidor ainda não recebeu uma chave administrativa. Configure <code>RAGIDLE_ADMIN_TOKEN</code> com um segredo aleatório de pelo menos 32 caracteres e reinicie o serviço idle-game.</p></div>
    {notice && <p className="admin-message" role="status">{notice}</p>}
  </div>;

  if (!session.authenticated) return <div className="admin-panel">
    <div className="admin-panel-heading"><span className="admin-seal" aria-hidden="true">R</span><div><h3>Painel administrativo</h3><p>Acesso protegido por chave do servidor</p></div></div>
    <form className="admin-login" onSubmit={login}>
      <label htmlFor="ragidle-admin-token">Chave administrativa</label>
      <input id="ragidle-admin-token" type="password" autoComplete="current-password" required minLength={32}
        value={token} onChange={event => setToken(event.target.value)} />
      <button className="primary" disabled={loginBusy || token.length < 32}>{loginBusy ? 'Verificando…' : 'Entrar no painel'}</button>
    </form>
    {notice && <p className="admin-message" role="status">{notice}</p>}
  </div>;

  return <div className="admin-panel">
    <div className="admin-panel-heading">
      <span className="admin-seal" aria-hidden="true">R</span>
      <div><h3>Painel administrativo</h3><p>{snapshot.state.name} · Base {snapshot.state.baseLevel} · Job {snapshot.state.jobLevel} · {catalog.classes[snapshot.state.job]?.name ?? snapshot.state.job}</p></div>
      <button type="button" className="admin-logout" onClick={() => void logout()}>Sair</button>
    </div>
    <p className="admin-notice">As alterações são validadas e salvas pelo servidor. Trocar a classe inicia o Job 1; o Base e os itens são preservados.</p>

    <div className="admin-actions">
      <section className="admin-action-card">
        <span className="admin-step">01</span><h4>Progressão Base</h4><p>Conceda níveis respeitando a curva de EXP do personagem.</p>
        <div className="admin-inline-form">
          <label>Níveis <input type="number" min={1} max={20} step={1} value={baseLevels} onChange={event => setBaseLevels(Math.max(1, Math.min(20, Number(event.target.value) || 1)))} /></label>
          <button type="button" disabled={actionBusy || snapshot.state.baseLevel >= 99}
            onClick={() => void run({ type: 'baseLevels', amount: baseLevels }, `Níveis Base concedidos. Agora Base ${Math.min(99, snapshot.state.baseLevel + baseLevels)}.`)}>Conceder</button>
        </div>
        {snapshot.state.baseLevel >= 99 && <small>Base máximo atingido.</small>}
      </section>

      <section className="admin-action-card">
        <span className="admin-step">02</span><h4>Níveis Job</h4><p>Conceda níveis e pontos de habilidade respeitando o limite da classe.</p>
        <div className="admin-inline-form">
          <label>Níveis <input type="number" min={1} max={20} step={1} value={jobLevels} onChange={event => setJobLevels(Math.max(1, Math.min(20, Number(event.target.value) || 1)))} /></label>
          <button type="button" disabled={actionBusy || grantedJobLevels === 0}
            onClick={() => void run({ type: 'jobLevels', amount: jobLevels }, `${grantedJobLevels} ${grantedJobLevels === 1 ? 'nível Job concedido' : 'níveis Job concedidos'}. Agora Job ${snapshot.state.jobLevel + grantedJobLevels}.`)}>Conceder</button>
        </div>
        <small>{snapshot.state.jobLevel >= jobCap ? 'Job máximo atingido para esta classe.' : `Job ${snapshot.state.jobLevel} / ${jobCap}. Até ${grantedJobLevels} ${grantedJobLevels === 1 ? 'nível' : 'níveis'} nesta operação.`}</small>
      </section>

      <section className="admin-action-card">
        <span className="admin-step">03</span><h4>Classe</h4><p>Defina qualquer classe incluída no catálogo atual.</p>
        <div className="admin-inline-form admin-class-form">
          <label>Classe <select value={classId} onChange={event => setClassId(event.target.value)}>
            {classes.map(job => <option key={job.id} value={job.id}>{job.name}</option>)}
          </select></label>
          <button type="button" disabled={actionBusy || classId === snapshot.state.job}
            onClick={() => void run({ type: 'class', classId }, `Classe alterada para ${catalog.classes[classId]?.name ?? classId}.`)}>Alterar</button>
        </div>
      </section>

      <section className="admin-action-card">
        <span className="admin-step">04</span><h4>Zeny</h4><p>Adicione moedas sem ultrapassar o limite clássico.</p>
        <div className="admin-inline-form">
          <label>Quantidade <input type="number" min={1} max={1_000_000_000} step={100} value={zeny} onChange={event => setZeny(Math.max(1, Math.min(1_000_000_000, Number(event.target.value) || 1)))} /></label>
          <button type="button" disabled={actionBusy}
            onClick={() => void run({ type: 'zeny', amount: zeny }, `${zeny.toLocaleString('pt-BR')} zeny adicionados.`)}>Adicionar</button>
        </div>
      </section>

      <section className="admin-action-card admin-item-card">
        <span className="admin-step">05</span><h4>Itens</h4><p>Conceda itens existentes no catálogo. Equipamentos são entregues identificados.</p>
        <label>Buscar por nome ou ID <input type="search" value={itemSearch} onChange={event => setItemSearch(event.target.value)} placeholder="Ex.: Poção Vermelha ou 501" /></label>
        <div className="admin-inline-form admin-class-form">
          <label>Item <select value={itemId} onChange={event => setItemId(Number(event.target.value))}>
            {matches.map(item => <option key={item.id} value={item.id}>#{item.id} · {item.name}</option>)}
            {!matches.length && <option value={itemId} disabled>Nenhum item encontrado</option>}
          </select></label>
          <label>Qtd. <input type="number" min={1} max={selectedItem?.type === 'equipment' ? 20 : 9999} step={1} value={itemQuantity}
            onChange={event => setItemQuantity(Math.max(1, Math.min(selectedItem?.type === 'equipment' ? 20 : 9999, Number(event.target.value) || 1)))} /></label>
          <button type="button" disabled={actionBusy || !selectedItem || !matches.some(item => item.id === itemId)}
            onClick={() => selectedItem && void run({ type: 'item', itemId, quantity: itemQuantity }, `${itemQuantity}× ${selectedItem.name} adicionado(s) à mochila.`)}>Conceder</button>
        </div>
      </section>
    </div>
    {notice && <p className="admin-message" role="status">{notice}</p>}
  </div>;
}
