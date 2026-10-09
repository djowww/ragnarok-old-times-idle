import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
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
    expect(getClassicClientPaths({ hostname: 'tibia74.tech', protocol: 'https:', origin: 'https://tibia74.tech:8443' })).toEqual({
      origin: 'https://tibia74.tech:8443',
      entry: '/ro/',
      mapViewer: '/ro/map-idle.html',
    });
  });

  it('keeps browser assets and the game WebSocket on the public HTTPS origin', async () => {
    const templatePath = fileURLToPath(new URL('../../docker/web-client/Config.local.js.template', import.meta.url));
    const template = await readFile(templatePath, 'utf8');
    const window = { location: { hostname: 'tibia74.tech', protocol: 'https:', host: 'tibia74.tech:8443' } };
    vm.runInNewContext(template.replace('${PACKETVER}', '20141022'), { window });
    const configWindow = window as unknown as { ROConfigLocal: { remoteClient: string; servers: { socketProxy: string }[] } };
    expect(configWindow.ROConfigLocal.remoteClient).toBe('/assets/');
    expect(configWindow.ROConfigLocal.servers[0].socketProxy).toBe('wss://tibia74.tech:8443/ws/');
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
    const inlineScript = html.match(/<script>\s*([\s\S]*?)<\/script>/)?.[1];
    expect(inlineScript).toBeTruthy();
    const window = {} as { ROConfig?: { remoteClient: string } };
    const location = { hostname: 'tibia74.tech' };
    vm.runInNewContext(inlineScript!, { window, location });
    expect(window.ROConfig?.remoteClient).toBe('/assets/');
  });

  it('allows same-origin public map messages while keeping local origins supported', async () => {
    const patchPath = fileURLToPath(new URL('../../docker/web-client/mapviewer-idle.patch', import.meta.url));
    const patch = await readFile(patchPath, 'utf8');
    const sameOriginGate = 'parentOrigin !== window.location.origin && !/^http:\\/\\/(localhost|127\\.0\\.0\\.1):(3339|5173)$/.test(parentOrigin)';
    expect(patch.split(sameOriginGate)).toHaveLength(5);
    expect(patch).toContain('event.origin !== parentOrigin');
  });
});
