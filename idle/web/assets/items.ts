import type { Item } from '../../shared/types';
import { AssetDecodeError, BinaryReader } from './sprite';
export interface DecodedBitmap {
    width: number;
    height: number;
    rgba: Uint8ClampedArray;
}
export function decodeBMP(data: ArrayBuffer): DecodedBitmap {
    const r = new BinaryReader(data);
    if (r.u8() !== 66 || r.u8() !== 77)
        throw new AssetDecodeError('Invalid BMP header');
    r.skip(8);
    const offset = r.u32();
    const dib = r.u32();
    if (dib < 40)
        throw new AssetDecodeError('Unsupported BMP DIB');
    const width = r.i32(), signedHeight = r.i32();
    const height = Math.abs(signedHeight);
    if (width <= 0 || height <= 0 || width * height > 16777216)
        throw new AssetDecodeError('Invalid BMP dimensions');
    if (r.u16() !== 1)
        throw new AssetDecodeError('Invalid BMP planes');
    const bits = r.u16(), compression = r.u32();
    if (![8, 24, 32].includes(bits) || compression !== 0)
        throw new AssetDecodeError('Unsupported BMP format');
    r.skip(12);
    const colorCount = r.u32();
    r.skip(4);
    let palette: Uint8Array | undefined;
    if (bits === 8) {
        r.offset = 14 + dib;
        palette = r.bytes((colorCount || 256) * 4);
    }
    const stride = Math.ceil(width * bits / 32) * 4;
    r.offset = offset;
    const pixels = r.bytes(stride * height), rgba = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
            const src = (signedHeight > 0 ? height - y - 1 : y) * stride + x * (bits / 8), dst = (y * width + x) * 4;
            let red: number, green: number, blue: number;
            if (bits === 8) {
                const p = pixels[src] * 4;
                if (p + 3 >= palette!.length)
                    throw new AssetDecodeError('Invalid BMP palette index');
                blue = palette![p];
                green = palette![p + 1];
                red = palette![p + 2];
            }
            else {
                blue = pixels[src];
                green = pixels[src + 1];
                red = pixels[src + 2];
            }
            rgba[dst] = red;
            rgba[dst + 1] = green;
            rgba[dst + 2] = blue;
            rgba[dst + 3] = red === 255 && green === 0 && blue === 255 ? 0 : 255;
        }
    return { width, height, rgba };
}
export function assetUrl(path: string): string { return '/assets/' + path.replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/'); }
export const FALLBACK_ICON = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect x="3" y="3" width="26" height="26" rx="4" fill="#e8dec1" stroke="#8e7956"/><text x="16" y="22" text-anchor="middle" font-size="20" fill="#725b3d">?</text></svg>');
const iconCache = new Map<string, Promise<string>>();
export function getBitmapUrl(path: string): Promise<string> {
    const existing = iconCache.get(path);
    if (existing)
        return existing;
    const promise = (async () => { try {
        const response = await fetch(assetUrl(path), { signal: AbortSignal.timeout(10000) });
        if (!response.ok)
            throw new Error('Bitmap HTTP ' + response.status);
        const decoded = decodeBMP(await response.arrayBuffer());
        const canvas = document.createElement('canvas');
        canvas.width = decoded.width;
        canvas.height = decoded.height;
        const ctx = canvas.getContext('2d');
        if (!ctx)
            throw new Error('Canvas unavailable');
        const image = ctx.createImageData(decoded.width, decoded.height);
        image.data.set(decoded.rgba);
        ctx.putImageData(image, 0, 0);
        return canvas.toDataURL('image/png');
    }
    catch {
        return FALLBACK_ICON;
    } })();
    iconCache.set(path, promise);
    return promise;
}
export function getItemIcon(item: Item): Promise<string> {
    return item.resource ? getBitmapUrl(item.resource) : Promise.resolve(FALLBACK_ICON);
}
