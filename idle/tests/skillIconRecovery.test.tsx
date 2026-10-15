// @vitest-environment jsdom
import { act, createElement, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import catalog from '../content/catalog.json';
import type { Skill } from '../shared/types';
import SkillIcon from '../web/components/SkillIcon';

const oldPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const newPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a16sAAAAASUVORK5CYII=';
let host: HTMLDivElement;
let root: Root | undefined;

function bitmap(red = 80): ArrayBuffer {
  const bytes = new Uint8Array(58), view = new DataView(bytes.buffer);
  bytes.set([66, 77]); view.setUint32(2, 58, true); view.setUint32(10, 54, true);
  view.setUint32(14, 40, true); view.setInt32(18, 1, true); view.setInt32(22, 1, true);
  view.setUint16(26, 1, true); view.setUint16(28, 24, true); bytes.set([10, 20, red, 0], 54);
  return bytes.buffer;
}
function skill(path?: string): Skill {
  return { ...catalog.skills.ht_detecting, name: 'Detectar', iconResource: path } as Skill;
}
async function render(path?: string, strict = false) {
  const icon = createElement(SkillIcon, { skill: skill(path) });
  await act(async () => root!.render(strict ? createElement(StrictMode, null, icon) : icon));
}
async function advance(milliseconds: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(milliseconds); });
}
function image() { return host.querySelector('img')?.getAttribute('src'); }

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  // Keep the component and bitmap decoding real; replace only the jsdom canvas boundary.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function(this: HTMLCanvasElement) {
    return {
      createImageData: (width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4) }),
      putImageData: (data: ImageData) => { this.dataset.red = String(data.data[0]); },
    } as unknown as CanvasRenderingContext2D;
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(function(this: HTMLCanvasElement) {
    return this.dataset.red === '80' ? newPng : oldPng;
  });
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined; host.remove(); vi.clearAllTimers(); vi.useRealTimers();
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe('mounted original skill icon recovery', () => {
  it('replaces fallback after a transient failure without remounting, waiting one second', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(bitmap()));
    vi.stubGlobal('fetch', fetch);
    await render('data/texture/retry-transient.bmp');
    expect(host.textContent).toBe('De'); expect(image()).toBeUndefined();
    await advance(999); expect(fetch).toHaveBeenCalledTimes(1);
    await advance(1); expect(image()).toBe(newPng); expect(host.textContent).toBe('');
    await advance(30000); expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('makes at most two additional attempts, with one and two second backoff', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 503 }));
    vi.stubGlobal('fetch', fetch);
    await render('data/texture/retry-exhausted.bmp');
    expect(fetch).toHaveBeenCalledTimes(1);
    await advance(1000); expect(fetch).toHaveBeenCalledTimes(2);
    await advance(1999); expect(fetch).toHaveBeenCalledTimes(2);
    await advance(1); expect(fetch).toHaveBeenCalledTimes(3);
    await advance(60000); expect(fetch).toHaveBeenCalledTimes(3);
    expect(host.textContent).toBe('De'); expect(image()).toBeUndefined();
  });
  it('does not retry a successful initial load', async () => {
    const fetch = vi.fn(async () => new Response(bitmap())); vi.stubGlobal('fetch', fetch);
    await render('data/texture/retry-success.bmp'); expect(image()).toBe(newPng);
    await advance(60000); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('cancels a pending retry when unmounted', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 503 })); vi.stubGlobal('fetch', fetch);
    await render('data/texture/retry-unmounted.bmp');
    await act(async () => root!.unmount()); root = undefined;
    await advance(60000); expect(fetch).toHaveBeenCalledTimes(1); expect(host.innerHTML).toBe('');
  });
  it('cancels the previous resource retry when the skill resource changes', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(bitmap())); vi.stubGlobal('fetch', fetch);
    await render('data/texture/retry-previous.bmp');
    await render('data/texture/retry-current.bmp'); expect(image()).toBe(newPng);
    await advance(60000); expect(fetch).toHaveBeenCalledTimes(2); expect(image()).toBe(newPng);
  });
  it('ignores a previous resource result after the replacement icon is ready', async () => {
    let finish!: (response: Response) => void;
    const fetch = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }))
      .mockResolvedValueOnce(new Response(bitmap())); vi.stubGlobal('fetch', fetch);
    await render('data/texture/retry-late-previous.bmp');
    await render('data/texture/retry-late-current.bmp'); expect(image()).toBe(newPng);
    await act(async () => { finish(new Response(bitmap(20))); });
    expect(image()).toBe(newPng); await advance(60000); expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('does not schedule a retry for a failure that resolves after unmount', async () => {
    let finish!: (response: Response) => void;
    const fetch = vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })); vi.stubGlobal('fetch', fetch);
    await render('data/texture/retry-late-unmounted.bmp');
    await act(async () => root!.unmount()); root = undefined;
    await act(async () => { finish(new Response(null, { status: 503 })); });
    await advance(60000); expect(fetch).toHaveBeenCalledTimes(1); expect(host.innerHTML).toBe('');
  });
  it('keeps a missing icon resource as a fallback without requests or retries', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch); await render(); await advance(60000);
    expect(fetch).not.toHaveBeenCalled(); expect(host.textContent).toBe('De'); expect(image()).toBeUndefined();
  });
  it('recovers under StrictMode without duplicate retry requests', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(bitmap())); vi.stubGlobal('fetch', fetch);
    await render('data/texture/retry-strict.bmp', true); expect(fetch).toHaveBeenCalledTimes(1);
    await advance(1000); expect(image()).toBe(newPng); expect(fetch).toHaveBeenCalledTimes(2);
    await advance(60000); expect(fetch).toHaveBeenCalledTimes(2);
  });
});
