/** Binary layouts adapted from roBrowserLegacy Loaders/Sprite.js and Action.js.
 * Copyright Vincent Thibault and roBrowserLegacy contributors; GPL-3.0-or-later.
 * See THIRD_PARTY_NOTICES.md. */
export class AssetDecodeError extends Error {
    constructor(message: string) { super(message); this.name = 'AssetDecodeError'; }
}
export class BinaryReader {
    private view: DataView;
    offset = 0;
    constructor(public buffer: ArrayBuffer) { this.view = new DataView(buffer); }
    require(n: number) { if (n < 0 || this.offset + n > this.buffer.byteLength)
        throw new AssetDecodeError('Truncated asset binary'); }
    skip(n: number) { this.require(n); this.offset += n; }
    u8() { this.require(1); return this.view.getUint8(this.offset++); }
    u16() { this.require(2); const n = this.view.getUint16(this.offset, true); this.offset += 2; return n; }
    i32() { this.require(4); const n = this.view.getInt32(this.offset, true); this.offset += 4; return n; }
    u32() { this.require(4); const n = this.view.getUint32(this.offset, true); this.offset += 4; return n; }
    f32() { this.require(4); const n = this.view.getFloat32(this.offset, true); this.offset += 4; if (!Number.isFinite(n))
        throw new AssetDecodeError('Invalid asset transform'); return n; }
    bytes(n: number) { this.require(n); const b = new Uint8Array(this.buffer, this.offset, n); this.offset += n; return b; }
    count(n: number, max = 100000) { if (n < 0 || n > max)
        throw new AssetDecodeError('Invalid asset count'); return n; }
}
export interface SpriteFrame {
    width: number;
    height: number;
    rgba: Uint8ClampedArray;
    type: 0 | 1;
    /** Original palette indexes, retained so a client .pal can recolor this frame. */
    indexedPixels?: Uint8Array;
}
export interface DecodedSprite {
    version: number;
    indexedCount: number;
    frames: SpriteFrame[];
    palette?: Uint8Array;
}
export function decodeSPR(data: ArrayBuffer): DecodedSprite {
    const r = new BinaryReader(data);
    if (r.u8() !== 83 || r.u8() !== 80)
        throw new AssetDecodeError('Invalid SPR header');
    const version = r.u8() / 10 + r.u8();
    if (version < 1.1 || version > 2.1)
        throw new AssetDecodeError('Unsupported SPR version ' + version);
    const indexedCount = r.count(r.u16(), 10000), rgbaCount = version > 1.1 ? r.count(r.u16(), 10000) : 0;
    const raw: Array<{
        width: number;
        height: number;
        type: 0 | 1;
        bytes: Uint8Array;
    }> = [];
    for (let i = 0; i < indexedCount; i++) {
        const width = r.u16(), height = r.u16(), size = r.count(width * height, 16777216);
        let pixels: Uint8Array;
        if (version >= 2.1) {
            const encoded = r.bytes(r.u16());
            pixels = new Uint8Array(size);
            let out = 0;
            for (let p = 0; p < encoded.length; p++) {
                const value = encoded[p];
                if (value) {
                    if (out >= size)
                        throw new AssetDecodeError('SPR RLE overflow');
                    pixels[out++] = value;
                }
                else {
                    if (++p >= encoded.length)
                        throw new AssetDecodeError('Truncated SPR RLE run');
                    const run = encoded[p] === 0 ? 2 : encoded[p];
                    if (out + run > size)
                        throw new AssetDecodeError('SPR RLE overflow');
                    out += run;
                }
            }
            if (out !== size)
                throw new AssetDecodeError('Truncated SPR RLE pixels');
        }
        else
            pixels = r.bytes(size);
        raw.push({ width, height, type: 0, bytes: pixels });
    }
    for (let i = 0; i < rgbaCount; i++) {
        const width = r.u16(), height = r.u16();
        raw.push({ width, height, type: 1, bytes: r.bytes(r.count(width * height * 4, 67108864)) });
    }
    const palette = indexedCount ? r.bytes(1024) : null;
    const frames = raw.map(frame => {
        const { width, height, type, bytes } = frame, rgba = new Uint8ClampedArray(width * height * 4);
        for (let y = 0; y < height; y++)
            for (let x = 0; x < width; x++) {
                const dst = (y * width + x) * 4;
                if (type === 0) {
                    const index = bytes[y * width + x];
                    if (index !== 0) {
                        rgba[dst] = palette![index * 4];
                        rgba[dst + 1] = palette![index * 4 + 1];
                        rgba[dst + 2] = palette![index * 4 + 2];
                        rgba[dst + 3] = 255;
                    }
                }
                else {
                    const src = ((height - y - 1) * width + x) * 4;
                    rgba[dst] = bytes[src + 3];
                    rgba[dst + 1] = bytes[src + 2];
                    rgba[dst + 2] = bytes[src + 1];
                    rgba[dst + 3] = bytes[src];
                }
            }
        return { width, height, type, rgba, ...(type === 0 ? { indexedPixels: bytes } : {}) };
    });
    return { version, indexedCount, frames, ...(palette ? { palette: new Uint8Array(palette) } : {}) };
}
