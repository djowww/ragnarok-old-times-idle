import { useEffect } from 'react';
import App from '../App';
import { AuthProvider, useAuth } from './AuthProvider';
import PortalShell, { LoadState } from './PortalShell';
import { navigate, useRoute } from './router';
import Home from './pages/Home';
import Register from './pages/Register';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import News from './pages/News';
import NewsDetail from './pages/NewsDetail';
import Ranking from './pages/Ranking';
import NotFound from './pages/NotFound';
const titles: Record<string, string> = { '/': 'Início', '/registro': 'Criar conta', '/cadastro': 'Criar conta', '/login': 'Entrar', '/painel': 'Painel do jogador', '/jogar': 'Jogar', '/noticias': 'Notícias', '/ranking': 'Ranking' };
function Routes() {
  const { pathname, search } = useRoute(); const auth = useAuth(); const privateRoute = pathname === '/painel' || pathname === '/jogar';
  const game = pathname === '/jogar' && auth.status === 'authenticated';
  useEffect(() => { document.documentElement.classList.toggle('game-route', game); return () => document.documentElement.classList.remove('game-route'); }, [game]);
  useEffect(() => {
    document.title = `${titles[pathname] ?? (pathname.startsWith('/noticias/') ? 'Notícia' : 'Página não encontrada')} · Ragnarok Old Times Idle`;
    document.querySelector<HTMLElement>('#portal-content')?.focus({ preventScroll: true });
  }, [pathname, search]);
  useEffect(() => { document.querySelector<HTMLElement>('#portal-content')?.focus({ preventScroll: true }); }, [auth.status]);
  useEffect(() => {
    if (pathname === '/cadastro') navigate('/registro', true);
    else if (privateRoute && auth.status === 'anonymous') navigate(`/login?return=${pathname}`, true);
    else if (auth.status === 'authenticated' && (pathname === '/login' || pathname === '/registro')) navigate('/painel', true);
  }, [pathname, privateRoute, auth.status]);
  if (game && auth.account) return <App key={JSON.stringify([auth.account.accountId, auth.account.profileId])} identity={auth.account} onAuthRequired={auth.invalidate} />;
  let page;
  if (auth.status === 'loading' && (privateRoute || ['/registro', '/cadastro', '/login'].includes(pathname))) page = <><h1>Conectando à sua conta</h1><LoadState error={auth.error} retry={() => void auth.refresh().catch(() => {})} /></>;
  else if (privateRoute && !auth.account) page = <p role="status">Abrindo a entrada da conta…</p>;
  else if (pathname === '/') page = <Home />;
  else if (pathname === '/registro' || pathname === '/cadastro') page = <Register />;
  else if (pathname === '/login') page = <Login />;
  else if (pathname === '/painel') page = <Dashboard key={JSON.stringify([auth.account!.accountId, auth.account!.profileId])} />;
  else if (pathname === '/noticias') page = <News />;
  else if (/^\/noticias\/[a-z0-9][a-z0-9-]*$/.test(pathname)) page = <NewsDetail key={pathname} slug={pathname.slice(10)} />;
  else if (pathname === '/ranking') page = <Ranking />;
  else page = <NotFound />;
  return <PortalShell>{auth.status === 'loading' && auth.error && !privateRoute && !['/registro', '/cadastro', '/login'].includes(pathname) && <LoadState error={auth.error} retry={() => void auth.refresh().catch(() => {})} />}{page}</PortalShell>;
}
export default function PortalApp() { return <AuthProvider><Routes /></AuthProvider>; }
