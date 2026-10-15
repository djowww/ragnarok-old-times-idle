import { afterEach, describe, expect, it, vi } from 'vitest';
import { FALLBACK_ICON, getBitmapUrl } from '../web/assets/items';

const png = 'data:image/png;base64,fixture';
function bitmap(): ArrayBuffer {
  const bytes = new Uint8Array(58), view = new DataView(bytes.buffer);
  bytes.set([66, 77]); view.setUint32(2, 58, true); view.setUint32(10, 54, true);
  view.setUint32(14, 40, true); view.setInt32(18, 1, true); view.setInt32(22, 1, true);
  view.setUint16(26, 1, true); view.setUint16(28, 24, true); bytes.set([30, 20, 10, 0], 54);
  return bytes.buffer;
}
function canvas() {
  const putImageData = vi.fn();
  vi.stubGlobal('document', { createElement: () => ({
    getContext: () => ({ createImageData: () => ({ data: new Uint8ClampedArray(4) }), putImageData }),
    toDataURL: () => png,
  }) });
  return putImageData;
}
afterEach(() => vi.unstubAllGlobals());

describe('bitmap requests recover after a failed load', () => {
  it('requests a CPU readback canvas for native bitmap encoding', async () => {
    const getContext = vi.fn(() => ({
      createImageData: () => ({ data: new Uint8ClampedArray(4) }),
      putImageData: vi.fn(),
    }));
    vi.stubGlobal('document', { createElement: () => ({ getContext, toDataURL: () => png }) });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(bitmap())));
    expect(await getBitmapUrl('data/texture/cpu-readback.bmp')).toBe(png);
    expect(getContext).toHaveBeenCalledWith('2d', { willReadFrequently: true });
  });

  it('shares an in-flight request and retains a decoded successful bitmap', async () => {
    const draw = canvas();
    let resolve!: (response: Response) => void;
    const fetch = vi.fn(() => new Promise<Response>(done => { resolve = done; }));
    vi.stubGlobal('fetch', fetch);
    const first = getBitmapUrl('data/texture/cache-success.bmp');
    const shared = getBitmapUrl('data/texture/cache-success.bmp');
    expect(shared).toBe(first); expect(fetch).toHaveBeenCalledTimes(1);
    resolve(new Response(bitmap()));
    expect(await first).toBe(png);
    expect(await getBitmapUrl('data/texture/cache-success.bmp')).toBe(png);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect([...draw.mock.calls[0][0].data]).toEqual([10, 20, 30, 255]);
  });
  it('allows a later caller to recover from HTTP503 without a page reload', async () => {
    canvas();
    const fetch = vi.fn().mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(bitmap()));
    vi.stubGlobal('fetch', fetch);
    const failed = getBitmapUrl('data/texture/cache-503.bmp');
    expect(getBitmapUrl('data/texture/cache-503.bmp')).toBe(failed);
    expect(await failed).toBe(FALLBACK_ICON);
    expect(await getBitmapUrl('data/texture/cache-503.bmp')).toBe(png);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('allows another load after transport failure', async () => {
    canvas();
    const fetch = vi.fn().mockRejectedValueOnce(new TypeError('Network unavailable'))
      .mockResolvedValueOnce(new Response(bitmap()));
    vi.stubGlobal('fetch', fetch);
    expect(await getBitmapUrl('data/texture/cache-network.bmp')).toBe(FALLBACK_ICON);
    expect(await getBitmapUrl('data/texture/cache-network.bmp')).toBe(png);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('allows another load after a truncated bitmap rather than caching the fallback', async () => {
    canvas();
    const fetch = vi.fn().mockResolvedValueOnce(new Response(new Uint8Array([66, 77])))
      .mockResolvedValueOnce(new Response(bitmap()));
    vi.stubGlobal('fetch', fetch);
    expect(await getBitmapUrl('data/texture/cache-truncated.bmp')).toBe(FALLBACK_ICON);
    expect(await getBitmapUrl('data/texture/cache-truncated.bmp')).toBe(png);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('allows another load after canvas recovery', async () => {
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => null }) });
    const fetch = vi.fn(async () => new Response(bitmap())); vi.stubGlobal('fetch', fetch);
    expect(await getBitmapUrl('data/texture/cache-canvas.bmp')).toBe(FALLBACK_ICON);
    canvas();
    expect(await getBitmapUrl('data/texture/cache-canvas.bmp')).toBe(png);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
