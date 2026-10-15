import { useSyncExternalStore, type AnchorHTMLAttributes, type ReactElement } from 'react';
const routes = new Set(['/', '/registro', '/cadastro', '/login', '/painel', '/jogar', '/noticias', '/ranking']);
function internal(path: string): boolean {
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return false;
  const url = new URL(path, window.location.href);
  return url.origin === window.location.origin && (routes.has(url.pathname) || /^\/noticias\/[a-z0-9][a-z0-9-]*$/.test(url.pathname));
}
export function navigate(path: string, replace = false): void {
  if (!internal(path)) throw new Error('Rota interna inválida.');
  if (replace) window.history.replaceState(null, '', path); else window.history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
export function Link({ href, onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }): ReactElement {
  return <a {...props} href={href} onClick={event => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || (props.target && props.target !== '_self') || props.download !== undefined || !internal(href)) return;
    event.preventDefault(); navigate(href);
  }} />;
}
const subscribe = (notify: () => void) => { window.addEventListener('popstate', notify); return () => window.removeEventListener('popstate', notify); };
const current = () => `${window.location.pathname}${window.location.search}`;
export function useRoute(): { pathname: string; search: string } {
  const path = useSyncExternalStore(subscribe, current, () => '/');
  const split = path.indexOf('?'); return split < 0 ? { pathname: path, search: '' } : { pathname: path.slice(0, split), search: path.slice(split) };
}
export function safeReturn(path: string | null): '/painel' | '/jogar' { return path === '/jogar' ? '/jogar' : '/painel'; }
