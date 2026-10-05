// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Link, navigate, safeReturn, useRoute } from '../web/portal/router';
let root: Root; let host: HTMLDivElement;
function Probe() { const route = useRoute(); return <><span>{route.pathname}{route.search}</span><Link href='/noticias/inicio?from=home'>News</Link></>; }
beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); history.replaceState(null, '', '/'); host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });
it('tracks internal news URLs and popstate while rejecting external navigation', async () => {
  await act(async () => root.render(<Probe />)); await act(async () => navigate('/noticias/inicio?from=home')); expect(host.querySelector('span')?.textContent).toBe('/noticias/inicio?from=home');
  await act(async () => { history.replaceState(null, '', '/ranking?category=zeny'); window.dispatchEvent(new PopStateEvent('popstate')); }); expect(host.querySelector('span')?.textContent).toBe('/ranking?category=zeny');
  expect(() => navigate('https://example.invalid')).toThrow(); expect(location.pathname).toBe('/ranking');
});
it('intercepts plain and keyboard link clicks, preserves modifiers/defaults/targets', async () => {
  await act(async () => root.render(<Probe />)); let link = host.querySelector('a')!;
  for (const options of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) { const event = new MouseEvent('click', { bubbles: true, cancelable: true, ...options }); await act(async () => link.dispatchEvent(event)); expect(event.defaultPrevented).toBe(false); expect(location.pathname).toBe('/'); }
  const click = new MouseEvent('click', { bubbles: true, cancelable: true, detail: 0 }); await act(async () => link.dispatchEvent(click)); expect(click.defaultPrevented).toBe(true); expect(location.pathname).toBe('/noticias/inicio');
  await act(async () => root.render(<Link href='/jogar' target='_blank' onClick={e => e.preventDefault()}>Game</Link>)); link = host.querySelector('a')!; await act(async () => link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))); expect(location.pathname).toBe('/noticias/inicio');
});
it('restricts return destinations to the two explicit private routes', () => {
  expect(safeReturn('/jogar')).toBe('/jogar'); expect(safeReturn('/painel')).toBe('/painel'); for (const path of [null, '//evil.invalid', 'https://evil.invalid', '/login', '/jogar?x=1', '/jogar/../login', '/%6aogar']) expect(safeReturn(path)).toBe('/painel');
});
