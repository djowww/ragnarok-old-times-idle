import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { number, type PanelProps } from './common';
import { useDraggableWindow } from '../hooks/useDraggableWindow';
import type { AccountView } from '../../shared/portal-types';

interface ChatMessage { id: number; name: string; text: string; at: number; }
interface ChatPage { messages: ChatMessage[]; nextCursor: number; hasMore: boolean; }
export interface ChatJournalProps extends PanelProps {
  identity: AccountView;
  onAuthRequired: () => void;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}
class ChatFailure extends Error {
  constructor(message: string, readonly status: number, readonly retryAfter = 0, readonly code?: string) { super(message); }
}
async function chatRequest<T>(path: string, controllers: Set<AbortController>, identity: AccountView, body?: unknown): Promise<T> {
  const controller = new AbortController();
  controllers.add(controller);
  const timer = window.setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'same-origin',
      headers: { 'X-Idle-Expected-Identity': JSON.stringify([identity.accountId, identity.profileId]), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store', signal: controller.signal,
    });
    const value = await response.json();
    controller.signal.throwIfAborted();
    if (!response.ok) throw new ChatFailure(value.error?.message ?? 'Não foi possível acessar o chat.', response.status, Number(response.headers.get('Retry-After')) || 0, value.error?.code);
    return value as T;
  } catch (error) {
    if (error instanceof ChatFailure) throw error;
    throw new ChatFailure('A conexão com o chat foi interrompida.', 0);
  } finally {
    window.clearTimeout(timer);
    controllers.delete(controller);
  }
}
function mergeMessages(previous: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const messages = new Map(previous.map(message => [message.id, message]));
  for (const message of incoming) messages.set(message.id, message);
  return [...messages.values()].sort((left, right) => left.id - right.id).slice(-100);
}
function useGlobalChat(viewing: boolean, identity: AccountView, onAuthRequired: () => void) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connection, setConnection] = useState<'connecting' | 'online' | 'offline'>('connecting');
  const [readError, setReadError] = useState('');
  const [sendError, setSendError] = useState('');
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [unread, setUnread] = useState(0);
  const controllers = useRef(new Set<AbortController>());
  const cursor = useRef<number | null>(null);
  const seenIds = useRef(new Set<number>());
  const viewingRef = useRef(viewing);
  const alive = useRef(false);
  const sendPending = useRef(false);
  const refresh = useRef<() => void>(() => {});
  const generation = useRef(0);
  const identityKey = JSON.stringify([identity.accountId, identity.profileId]);
  const currentIdentity = useRef(identityKey); currentIdentity.current = identityKey;
  const authRequired = useRef(onAuthRequired); authRequired.current = onAuthRequired;
  const expire = useRef<() => void>(() => {});
  viewingRef.current = viewing;
  useEffect(() => { if (viewing) setUnread(0); }, [viewing]);
  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setTimeout(() => setCooldown(value => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);
  useEffect(() => {
    let disposed = false;
    let pending = false;
    let timer = 0;
    alive.current = true;
    const session = ++generation.current;
    const current = () => !disposed && generation.current === session && currentIdentity.current === identityKey;
    cursor.current = null; seenIds.current.clear(); sendPending.current = false;
    setMessages([]); setConnection('connecting'); setReadError(''); setSendError(''); setSending(false); setCooldown(0); setUnread(0);
    expire.current = () => {
      if (!current()) return;
      disposed = true; alive.current = false; window.clearTimeout(timer);
      for (const controller of controllers.current) controller.abort();
      authRequired.current();
    };
    const poll = async () => {
      if (disposed || pending) return;
      window.clearTimeout(timer);
      if (document.hidden) { timer = window.setTimeout(poll, 3000); return; }
      pending = true;
      let delay = 3000;
      try {
        const initial = cursor.current === null;
        const page = await chatRequest<ChatPage>(initial ? '/api/chat' : `/api/chat?after=${cursor.current}`, controllers.current, identity);
        if (!current()) return;
        const fresh = page.messages.filter(message => !seenIds.current.has(message.id));
        for (const message of page.messages) seenIds.current.add(message.id);
        // Bound memory together with the visible history.
        if (seenIds.current.size > 200) seenIds.current = new Set([...seenIds.current].sort((a, b) => a - b).slice(-100));
        if (fresh.length) setMessages(previous => mergeMessages(previous, page.messages));
        if (!initial && !viewingRef.current) setUnread(value => Math.min(99, value + fresh.length));
        cursor.current = page.nextCursor;
        setConnection('online');
        setReadError('');
        if (page.hasMore) delay = 100;
      } catch (error) {
        if (current() && error instanceof ChatFailure && error.code === 'AUTH_REQUIRED') { expire.current(); return; }
        if (current()) { setConnection('offline'); setReadError((error as Error).message); }
        delay = 5000;
      } finally {
        pending = false;
        if (current()) timer = window.setTimeout(poll, delay);
      }
    };
    const wake = () => { if (!document.hidden) void poll(); };
    refresh.current = wake;
    void poll();
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('online', wake);
    return () => {
      disposed = true;
      alive.current = false;
      refresh.current = () => {};
      window.clearTimeout(timer);
      for (const controller of controllers.current) controller.abort();
      controllers.current.clear();
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('online', wake);
    };
  }, [identityKey]);
  const send = async (text: string): Promise<boolean> => {
    if (sendPending.current || !alive.current || connection !== 'online' || cooldown) return false;
    sendPending.current = true;
    const session = generation.current;
    const current = () => alive.current && generation.current === session && currentIdentity.current === identityKey;
    setSending(true);
    setSendError('');
    try {
      const result = await chatRequest<{ message: ChatMessage }>('/api/chat', controllers.current, identity, { text });
      if (!current()) return false;
      setMessages(previous => mergeMessages(previous, [result.message]));
      seenIds.current.add(result.message.id);
      // Only GET advances the cursor: a concurrent POST must not skip others' messages.
      refresh.current();
      return true;
    } catch (error) {
      if (current()) {
        const failure = error as ChatFailure;
        if (failure.code === 'AUTH_REQUIRED') { expire.current(); return false; }
        setSendError(failure.status === 0 || failure.status >= 500
          ? 'Envio não confirmado. Confira o histórico antes de tentar novamente.' : failure.message);
        if (failure.status === 429) setCooldown(Math.max(1, failure.retryAfter));
        if (failure.status === 0 || failure.status >= 500) setConnection('offline');
      }
      return false;
    } finally {
      if (current()) { sendPending.current = false; setSending(false); }
    }
  };
  return { messages, connection, error: sendError || readError, sending, cooldown, unread, send, retry: () => refresh.current() };
}
const timeLabel = (at: number) => new Date(at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

export default function ChatJournal({ snapshot, isOpen, onOpenChange, identity, onAuthRequired }: ChatJournalProps) {
  const movable = useDraggableWindow<HTMLElement>('chat-journal', 'diário e chat');
  const [localOpen, setLocalOpen] = useState(true);
  const [tab, setTab] = useState<'combat' | 'global'>('combat');
  const [draft, setDraft] = useState('');
  const open = isOpen ?? localOpen;
  const chat = useGlobalChat(open && tab === 'global', identity, onAuthRequired);
  const prefix = useId();
  const log = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  const lastVisibleMessage = useRef(0);
  const [showLatest, setShowLatest] = useState(false);
  const events = [...snapshot.state.events].reverse().slice(0, 30);
  const changeOpen = (value: boolean) => { setLocalOpen(value); onOpenChange?.(value); };
  useEffect(() => {
    const element = log.current;
    if (!element || !open || tab !== 'global') return;
    const newest = chat.messages.at(-1)?.id ?? 0;
    if (followLatest.current) element.scrollTop = element.scrollHeight;
    else if (newest > lastVisibleMessage.current) setShowLatest(true);
    lastVisibleMessage.current = newest;
  }, [chat.messages, open, tab]);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || text.length > 240) return;
    if (await chat.send(text)) setDraft('');
  };
  return (
    <section ref={movable.ref} style={movable.style} className={`chat-journal ${open ? 'is-open' : 'is-folded'}`} aria-label="Diário e chat global">
      <div {...movable.handleProps} className="ro-drag-handle chat-journal-titlebar">
        <h2>Diário de aventura</h2>
        <span className={`chat-connection ${chat.connection}`} title={chat.connection === 'online' ? 'Chat conectado' : chat.connection === 'connecting' ? 'Conectando ao chat' : 'Chat sem conexão'}>
          <i aria-hidden="true" />{chat.connection === 'online' ? 'Online' : chat.connection === 'connecting' ? 'Conectando…' : 'Sem conexão'}
        </span>
        <button type="button" className="chat-fold" onClick={() => changeOpen(!open)} aria-expanded={open}
          aria-controls={`${prefix}-body`} aria-label={open ? 'Recolher diário e chat' : 'Expandir diário e chat'}>{open ? '−' : '+'}</button>
      </div>
      {open && <div id={`${prefix}-body`} className="chat-journal-body">
        <div className="chat-journal-tabs" role="tablist" aria-label="Canal do diário" onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === 'Home' ? 'combat' : event.key === 'End' ? 'global' : tab === 'combat' ? 'global' : 'combat';
          setTab(next);
          event.currentTarget.querySelector<HTMLButtonElement>(`[data-tab="${next}"]`)?.focus();
        }}>
          <button id={`${prefix}-combat-tab`} data-tab="combat" type="button" role="tab" tabIndex={tab === 'combat' ? 0 : -1} aria-selected={tab === 'combat'} aria-controls={`${prefix}-combat`} onClick={() => setTab('combat')}>Combate</button>
          <button id={`${prefix}-global-tab`} data-tab="global" type="button" role="tab" tabIndex={tab === 'global' ? 0 : -1} aria-selected={tab === 'global'} aria-controls={`${prefix}-global`} onClick={() => setTab('global')}>
            Global{chat.unread > 0 && <span className="chat-unread" aria-label={`${chat.unread} novas mensagens`}>{chat.unread}</span>}
          </button>
        </div>
        <div id={`${prefix}-combat`} role="tabpanel" aria-labelledby={`${prefix}-combat-tab`} hidden={tab !== 'combat'}>
          <div className="chat-combat-log" role="log" aria-live="off" tabIndex={0} aria-label="Eventos recentes de combate">
            {events.map(event => <div className={`chat-combat-event event-${event.kind}`} key={event.id}>
              <time dateTime={new Date(event.at).toISOString()}>{timeLabel(event.at)}</time>
              <span>{event.text}{event.amount !== undefined && <b> · {number(event.amount)}</b>}</span>
            </div>)}
            {events.length === 0 && <p className="chat-empty">Escolha uma área e comece a caçar. Sua aventura aparecerá aqui.</p>}
          </div>
        </div>
        <div id={`${prefix}-global`} role="tabpanel" aria-labelledby={`${prefix}-global-tab`} hidden={tab !== 'global'}>
          <div className="chat-global-log" ref={log} role="log" aria-live="off" tabIndex={0} aria-label="Mensagens do chat global"
            onScroll={event => {
              const element = event.currentTarget;
              followLatest.current = element.scrollHeight - element.scrollTop - element.clientHeight < 24;
              if (followLatest.current) setShowLatest(false);
            }}>
            {chat.messages.map(message => <p className="chat-message" key={message.id}>
              <time dateTime={new Date(message.at).toISOString()}>{timeLabel(message.at)}</time>
              <span><b>{message.name}:</b> {message.text}</span>
            </p>)}
            {chat.messages.length === 0 && <p className="chat-empty">{chat.connection === 'connecting' ? 'Carregando mensagens…' : 'Nenhuma mensagem por aqui. Diga olá para Rune-Midgard!'}</p>}
          </div>
          {showLatest && <button type="button" className="chat-latest" onClick={() => {
            followLatest.current = true; setShowLatest(false);
            if (log.current) log.current.scrollTop = log.current.scrollHeight;
          }}>Ir às mensagens recentes ↓</button>}
          {chat.error && <div className="chat-error" role="status">
            <span>{chat.error}</span>{chat.connection === 'offline' && <button type="button" onClick={chat.retry}>Reconectar</button>}
          </div>}
          <form className="chat-compose" onSubmit={submit}>
            <label className="chat-input-label" htmlFor={`${prefix}-message`}>Mensagem para o chat global</label>
            <input id={`${prefix}-message`} value={draft} maxLength={240} autoComplete="off" placeholder="Conversar no Global…"
              disabled={chat.connection !== 'online' || chat.sending} onChange={event => setDraft(event.target.value)} />
            <button type="submit" disabled={chat.connection !== 'online' || chat.sending || chat.cooldown > 0 || !draft.trim()}>
              {chat.sending ? '…' : chat.cooldown ? `${chat.cooldown}s` : 'Enviar'}
            </button>
          </form>
          <div className="chat-compose-hint"><span>{snapshot.state.name} · Global</span><span>{draft.length}/240</span></div>
        </div>
      </div>}
    </section>
  );
}
