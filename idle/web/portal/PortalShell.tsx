import { useEffect, useState, type ReactNode } from 'react';
import { ApiFailure, request } from '../http';
import { useAuth } from './AuthProvider';
import { Link, navigate, useRoute } from './router';

export function Panel({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return <section className={`portal-panel ${className}`}><h2>{title}</h2><div className="portal-panel-body">{children}</div></section>;
}
export function usePublicData<T>(path: string) {
  const [state, setState] = useState<{ data: T | null; error: ApiFailure | null }>({ data: null, error: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setState({ data: null, error: null });
    void request<T>(path, { signal: controller.signal }).then(data => { if (!controller.signal.aborted) setState({ data, error: null }); }, error => { if (!controller.signal.aborted) setState({ data: null, error }); });
    return () => controller.abort();
  }, [path, attempt]);
  return { ...state, retry: () => setAttempt(value => value + 1) };
}
export function LoadState({ error, retry }: { error: ApiFailure | null; retry: () => void }) {
  return error ? <div className="portal-feedback" role="alert"><p>{error.message}</p><button onClick={retry}>Tentar novamente</button></div> : <p role="status" className="portal-muted">Carregando…</p>;
}
export const formatNumber = (value: number) => value.toLocaleString('pt-BR');
export const formatDate = (value: string | number) => new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' });
export function Logout() {
  const auth = useAuth();
  return <button onClick={() => { void auth.logout().catch(() => {}); navigate('/'); }}>Sair</button>;
}
export default function PortalShell({ children }: { children: ReactNode }) {
  const auth = useAuth(); const { pathname } = useRoute();
  return <div className="portal-shell">
    <a className="portal-skip" href="#portal-content">Pular para o conteúdo</a>
    <div className="portal-topline"><span>Rune-Midgard espera por você</span><span>Ragnarok Old Times · Idle</span></div>
    <header className="portal-banner"><img src="/portal/banner.png" alt="" onError={event => { event.currentTarget.hidden = true; }} /><div className="portal-brand"><span>Ragnarok</span><strong>Old Times <em>Idle</em></strong><p>Sua aventura continua.</p></div></header>
    <nav className="portal-nav" aria-label="Navegação principal">{[['/', 'Início'], ['/registro', 'Criar conta'], ['/noticias', 'Notícias'], ['/ranking', 'Ranking'], ['/painel', 'Minha conta'], ['/jogar', 'Jogar']].map(([href, label]) => <Link key={href} href={href} aria-current={pathname === href ? 'page' : undefined}>{label}</Link>)}</nav>
    <div className="portal-session"><span>Bem-vindo{auth.account ? `, ${auth.account.characterName}` : ', aventureiro'}.</span>{auth.account ? <Logout /> : <Link href="/login">Entrar na conta</Link>}</div>
    {auth.error && auth.status !== 'loading' && <div className="portal-feedback" role="alert">{auth.error.message} <button onClick={() => void auth.refresh().catch(() => {})}>Verificar sessão</button></div>}
    <main id="portal-content" tabIndex={-1}>{children}</main>
    <footer className="portal-footer"><strong>Ragnarok Old Times Idle</strong><span>Um personagem. Muitas histórias.</span><p>Projeto de fãs. Ragnarok Online e seus recursos pertencem aos respectivos titulares.</p><Link href="/noticias">Comunicados do projeto</Link></footer>
  </div>;
}
