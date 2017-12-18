/*
 * Copyright (c) 2017 yvt
 *
 * This file is a part of hyper3d-envmapgen. Please read the license text that
 * comes with the source code for use conditions.
 */
import { table } from './utils';

const $fr = Math.fround || ((x: number) => x);

export enum ImageFormat {
    Srgbx8,
    Srgba8StraightAlpha,
    RgbaF32PremulAlpha,
}

export type ImageLike = HTMLImageElement | HTMLCanvasElement | HTMLVideoElement;

export function coerceImageToSrgba8StraightAlpha(
    image: Uint8Array | ImageLike,
    width?: number,
    height?: number,
): Uint8Array {
    if (image instanceof Uint8Array) {
        return image;
    }

    if (!width || !height) {
        if (image instanceof HTMLImageElement) {
            width = image.naturalWidth;
            height = image.naturalHeight;
        } else if (image instanceof HTMLCanvasElement) {
            width = image.width;
            height = image.height;
        } else if (image instanceof HTMLVideoElement) {
            width = image.videoWidth;
            height = image.videoHeight;
        }
    }
    if (!width || !height) {
        throw new Error("Cannot guess the size of the image");
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0, width, height);
    return context.getImageData(0, 0, width, height).data;
}

export function coerceToRgbaF32PremulAlphaFrom(
    image: Uint8Array | Float32Array | ImageLike,
    format: ImageFormat,
    width?: number,
    height?: number,
): Float32Array {
    switch (format) {
        case ImageFormat.RgbaF32PremulAlpha:
            if (image instanceof Float32Array) {
                return image;
            } else {
                throw new Error("Invalid type for RgbaF32PremulAlpha");
            }
        case ImageFormat.Srgba8StraightAlpha: {
            if (image instanceof Float32Array) {
                throw new Error("Invalid type for RgbaF32PremulAlpha");
            }
            if (!(image instanceof Uint8Array)) {
                image = coerceImageToSrgba8StraightAlpha(image, width, height);
            }
            const u8 = image;
            const f32 = new Float32Array(u8.length);
            const table = SRGB_DECODE_TABLE;
            for (let i = 0; i < u8.length; i += 4) {
                const a = u8[i + 3] * (1 / 255) + 1e-20;
                f32[i] = table[u8[i]] * a;
                f32[i + 1] = table[u8[i + 1]] * a;
                f32[i + 2] = table[u8[i + 2]] * a;
                f32[i + 3] = a;
            }
            return f32;
        }
        case ImageFormat.Srgbx8: {
            if (image instanceof Float32Array) {
                throw new Error("Invalid type for RgbaF32PremulAlpha");
            }
            if (!(image instanceof Uint8Array)) {
                image = coerceImageToSrgba8StraightAlpha(image, width, height);
            }
            const u8 = image;
            const f32 = new Float32Array(u8.length);
            const table = SRGB_DECODE_TABLE;
            for (let i = 0; i < u8.length; i += 4) {
                f32[i] = table[u8[i]];
                f32[i + 1] = table[u8[i + 1]];
                f32[i + 2] = table[u8[i + 2]];
                f32[i + 3] = 1;
            }
            return f32;
        }
        default:
            throw new Error(`Invalid ImageFormat: ${format}`);
    }
}

export function coerceRgbaF32PremulAlphaTo(
    image: Float32Array,
    format: ImageFormat,
): Uint8Array | Float32Array {
    switch (format) {
        case ImageFormat.RgbaF32PremulAlpha:
            return image;
        case ImageFormat.Srgba8StraightAlpha:
        case ImageFormat.Srgbx8: {
            const u8 = new Uint8Array(image.length);
            const table = SRGB_ENCODE_TABLE;
            for (let i = 0; i < u8.length; i += 4) {
                const a = image[i + 3];
                const scale = $fr(65000 / a);
                u8[i] = table[$fr(image[i] * scale) & 0xffff];
                u8[i + 1] = table[$fr(image[i + 1] * scale) & 0xffff];
                u8[i + 2] = table[$fr(image[i + 2] * scale) & 0xffff];
                u8[i + 3] = $fr(a * 255) + 0.5;
            }
            return u8;
        }
        default:
            throw new Error(`Invalid ImageFormat: ${format}`);
    }
}

export const SRGB_DECODE_TABLE = new Float32Array(table(256, i => {
    i /= 255;
    return (i < 0.04045 ? i / 12.92 : ((i + 0.055) / 1.055) ** 2.4);
}));

export const SRGB_ENCODE_TABLE = new Uint8Array(table(65536, i => {
    i = Math.min(i / 65000, 1);
    return (i < 0.0031308 ? 12.92 * i : 1.055 * (i ** (1 / 2.4)) - 0.055) * 255 + 0.5 | 0;
}));

export function resampleRgbF32(
    inImage: Float32Array,
    inWidth: number,
    inHeight: number,
    outWidth: number,
    outHeight: number,
): Float32Array
{
    const outImage = new Float32Array(outWidth * outHeight * 4);

    if (inWidth < outWidth || inHeight < outHeight) {
        throw new Error("Does not support magnification yet");
    }

    let outIndex = 0;

    if (inWidth === outWidth * 2 && inHeight === outHeight * 2) {
        for (let y = 0; y < outHeight; ++y) {
            let inIndex1 = (y * 2 * inWidth) << 2;
            let inIndex2 = inIndex1 + (inWidth << 2);
            for (let x = 0; x < outWidth; ++x) {
                let r1 = inImage[inIndex1], g1 = inImage[inIndex1 + 1],
                    b1 = inImage[inIndex1 + 2], a1 = inImage[inIndex1 + 3];
                let r2 = inImage[inIndex1 + 4], g2 = inImage[inIndex1 + 4 + 1],
                    b2 = inImage[inIndex1 + 4 + 2], a2 = inImage[inIndex1 + 4 + 3];
                let r3 = inImage[inIndex2], g3 = inImage[inIndex2 + 1],
                    b3 = inImage[inIndex2 + 2], a3 = inImage[inIndex2 + 3];
                let r4 = inImage[inIndex2 + 4], g4 = inImage[inIndex2 + 4 + 1],
                    b4 = inImage[inIndex2 + 4 + 2], a4 = inImage[inIndex2 + 4 + 3];

                outImage[outIndex] = $fr($fr(r1 + r2) + $fr(r3 + r4)) * 0.25;
                outImage[outIndex + 1] = $fr($fr(g1 + g2) + $fr(g3 + g4)) * 0.25;
                outImage[outIndex + 2] = $fr($fr(b1 + b2) + $fr(b3 + b4)) * 0.25;
                outImage[outIndex + 3] = $fr($fr(a1 + a2) + $fr(a3 + a4)) * 0.25;

                outIndex += 4; inIndex1 += 8; inIndex2 += 8;
            }
        }
    } else {
        let inY = $fr(0.5 * inHeight / outHeight - 0.5);
        const inDY = $fr(inHeight / outHeight);
        let inX = $fr(0.5 * inWidth / outWidth - 0.5);
        const inDX = $fr(inWidth / outWidth);
        for (let y = 0; y < outHeight; ++y) {
            const inBase1 = Math.floor(inY) * inWidth << 2;
            const inBase2 = Math.ceil(inY) * inWidth << 2;
            const facY2 = $fr(inY - Math.floor(inY));
            const facY1 = $fr(1 - facY2);
            let inX2 = inX;
            for (let x = 0; x < outWidth; ++x) {
                // Linear interpolation
                const x1 = Math.floor(inX2) << 2;
                const x2 = Math.ceil(inX2) << 2;
                const facX2 = $fr(inX2 - Math.floor(inX2));
                const facX1 = $fr(1 - facX2);

                let r1 = inImage[inBase1 + x1], g1 = inImage[inBase1 + x1 + 1],
                    b1 = inImage[inBase1 + x1 + 2], a1 = inImage[inBase1 + x1 + 3];
                let r2 = inImage[inBase1 + x2], g2 = inImage[inBase1 + x2 + 1],
                    b2 = inImage[inBase1 + x2 + 2], a2 = inImage[inBase1 + x2 + 3];
                let r3 = inImage[inBase2 + x1], g3 = inImage[inBase2 + x1 + 1],
                    b3 = inImage[inBase2 + x1 + 2], a3 = inImage[inBase2 + x1 + 3];
                let r4 = inImage[inBase2 + x2], g4 = inImage[inBase2 + x2 + 1],
                    b4 = inImage[inBase2 + x2 + 2], a4 = inImage[inBase2 + x2 + 3];

                r1 = $fr($fr(r1 * facY1) + $fr(r3 * facY2));
                g1 = $fr($fr(g1 * facY1) + $fr(g3 * facY2));
                b1 = $fr($fr(b1 * facY1) + $fr(b3 * facY2));
                a1 = $fr($fr(a1 * facY1) + $fr(a3 * facY2));

                r2 = $fr($fr(r2 * facY1) + $fr(r4 * facY2));
                g2 = $fr($fr(g2 * facY1) + $fr(g4 * facY2));
                b2 = $fr($fr(b2 * facY1) + $fr(b4 * facY2));
                a2 = $fr($fr(a2 * facY1) + $fr(a4 * facY2));

                r1 = $fr($fr(r1 * facX1) + $fr(r2 * facX2));
                g1 = $fr($fr(g1 * facX1) + $fr(g2 * facX2));
                b1 = $fr($fr(b1 * facX1) + $fr(b2 * facX2));
                a1 = $fr($fr(a1 * facX1) + $fr(a2 * facX2));

                outImage[outIndex] = r1;
                outImage[outIndex + 1] = g1;
                outImage[outIndex + 2] = b1;
                outImage[outIndex + 3] = a1;

                outIndex += 4;
                inX2 += inDX;
                inX2 = $fr(inX2);
            }
            inY += inDY;
            inY = $fr(inY);
        }
    }

    return outImage;
}
