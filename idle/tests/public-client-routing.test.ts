import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import OriginalMap from '../web/components/OriginalMap';
afterEach(() => vi.unstubAllGlobals());
import { getClassicClientPaths } from '../web/public-client-routing.js';

describe('classic client routing', () => {
  it('keeps the local client on its existing port', () => {
    expect(getClassicClientPaths({ hostname: 'localhost', protocol: 'http:', origin: 'http://localhost:3339' })).toEqual({
      origin: 'http://localhost:3338',
      entry: 'http://localhost:3338/',
      mapViewer: 'http://localhost:3338/applications/pwa/map-idle.html',
    });
  });

  it('uses the same-origin reverse-proxy paths on the public site', () => {
    expect(getClassicClientPaths({ hostname: 'play.example.test', protocol: 'https:', origin: 'https://play.example.test:8443' })).toEqual({
      origin: 'https://play.example.test:8443',
      entry: '/ro/',
      mapViewer: '/ro/map-idle.html',
    });
  });

  it('keeps browser assets and the game WebSocket on the public HTTPS origin', async () => {
    const templatePath = fileURLToPath(new URL('../../docker/web-client/Config.local.js.template', import.meta.url));
    const template = await readFile(templatePath, 'utf8');
    const window = { location: { hostname: 'play.example.test', protocol: 'https:', host: 'play.example.test:8443' } };
    vm.runInNewContext(template.replace('${PACKETVER}', '20141022'), { window });
    const configWindow = window as unknown as { ROConfigLocal: { remoteClient: string; servers: { socketProxy: string }[] } };
    expect(configWindow.ROConfigLocal.remoteClient).toBe('/assets/');
    expect(configWindow.ROConfigLocal.servers[0].socketProxy).toBe('wss://play.example.test:8443/ws/');
  });

  it.each(['localhost', '127.0.0.1'])('keeps the local roBrowser URLs for %s', async hostname => {
    const templatePath = fileURLToPath(new URL('../../docker/web-client/Config.local.js.template', import.meta.url));
    const template = await readFile(templatePath, 'utf8');
    const window = { location: { hostname, protocol: 'http:', host: `${hostname}:3338` } };
    vm.runInNewContext(template.replace('${PACKETVER}', '20141022'), { window });
    const configWindow = window as unknown as { ROConfigLocal: { remoteClient: string; servers: { socketProxy: string }[] } };
    expect(configWindow.ROConfigLocal.remoteClient).toBe('http://127.0.0.1:8080/');
    expect(configWindow.ROConfigLocal.servers[0].socketProxy).toBe('ws://127.0.0.1:5999/');
  });

  it('loads the map viewer assets from the public same-origin route', async () => {
    const htmlPath = fileURLToPath(new URL('../../docker/web-client/map-idle.html', import.meta.url));
    const html = await readFile(htmlPath, 'utf8');
    const imports: string[] = [];
    const moduleScript = html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
    expect(moduleScript).toBeTruthy();
    // Execute the loader; substitute only the external dynamic-import boundary.
    vm.runInNewContext(moduleScript!.replace(/\bimport\(/, 'loadModule('), {
      loadModule: (specifier: string) => { imports.push(specifier); return Promise.resolve({}); },
    });
    expect(imports).toEqual(['./MapViewer.js?v=20261015-render-cadence']);
    const inlineScript = html.match(/<script>\s*([\s\S]*?)<\/script>/)?.[1];
    expect(inlineScript).toBeTruthy();
    const window = {} as { ROConfig?: { remoteClient: string } };
    const location = { hostname: 'play.example.test' };
    vm.runInNewContext(inlineScript!, { window, location });
    expect(window.ROConfig?.remoteClient).toBe('/assets/');
  });

  it('invalidates the iframe document cache while preserving map and field origin', () => {
    vi.stubGlobal('window', { location: { hostname: 'play.example.test', protocol: 'https:', origin: 'https://play.example.test' } });
    const markup = renderToStaticMarkup(createElement(OriginalMap, { map: 'prt_fild08', fieldOrigin: { x: 12, y: 34 } }));
    const src = markup.match(/<iframe[^>]*src="([^"]+)"/)?.[1].replaceAll('&amp;', '&');
    expect(src).toBeDefined();
    const url = new URL(src!, 'https://play.example.test');
    expect(url.pathname).toBe('/ro/map-idle.html');
    expect(url.searchParams.get('v')).toBe('20261015-render-cadence');
    expect(url.searchParams.get('attempt')).toBe('0');
    expect(url.searchParams.get('originX')).toBe('12');
    expect(url.searchParams.get('originY')).toBe('34');
    expect(url.hash).toBe('#prt_fild08.rsw');
  });

  it('allows same-origin public map messages while keeping local origins supported', async () => {
    const patchPath = fileURLToPath(new URL('../../docker/web-client/mapviewer-idle.patch', import.meta.url));
    const patch = await readFile(patchPath, 'utf8');
    const sameOriginGate = 'parentOrigin !== window.location.origin && !/^http:\\/\\/(localhost|127\\.0\\.0\\.1):(3339|5173)$/.test(parentOrigin)';
    expect(patch.split(sameOriginGate)).toHaveLength(5);
    expect(patch).toContain('event.origin !== parentOrigin');
  });
});
