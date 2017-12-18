/*
 * Copyright (c) 2017 yvt
 *
 * This file is a part of hyper3d-envmapgen. Please read the license text that
 * comes with the source code for use conditions.
 */
import { CoreInstance, CoreOptions } from './wasm';
import {
    ImageLike, ImageFormat, coerceToRgbaF32PremulAlphaFrom, coerceRgbaF32PremulAlphaTo,
    resampleRgbF32,
} from './image';
import { table } from './utils';

export interface LtasgOptions
{
    core?: Readonly<CoreOptions>;

    /** The input image size. */
    imageSize: number;

    /**
     * The σ (standard deviation) value for each generated mip level.
     *
     * Large values (> 0.2) significantly increase the processing time in the
     * order of `O(σ²)` since the assumption that LTASG makes is no longer valid
     * under large σ values and it has to realize a large blur by a repeated
     * application of small-sized blurs.
     */
    mipLevelSigmas: ArrayLike<number>;

    /**
     * The minimum number of passes. Specify `1` for best performance, and
     * `2` or `3` for best quality. A larger value usually hurts both of
     * performance and quality.
     *
     * Defaults to `2`.
     */
    minNumPasses?: number;
}

// Hard-coded values. I don't know a good (user-friendly) way to explain these
// values in the public interface, so I decided to just keep them private.
const kernelResolution = 2;
/** Specifies the size of the Gaussian kernel by the ratio to the σ value. */
const kernelWidth = 3;

function generateGaussianKernel(radius: number, sigma: number): Float32Array {
    const v = new Float32Array(radius * 2 + 1);

    let sum = 0;
    for (let i = 0; i <= radius * 2; ++i) {
        sum += (v[i] = Math.exp(-0.5 * ((i - radius) / sigma) ** 2));
    }

    // normalize
    const scale = 1 / sum;
    for (let i = 0; i < v.length; ++i) {
        v[i] *= scale;
    }

    return v;
}

/**
 * Provides a linear-time approximate spherical Gaussian blur algorithm.
 */
export class LtasgBlur {
    readonly core: CoreInstance;

    private readonly size: number;
    private readonly plan: {
        kernel: Float32Array,
        kernelScale: number;
        numPasses: number;
    }[] = [];

    constructor(options: Readonly<LtasgOptions>) {
        this.core = new CoreInstance(options.core);
        this.size = options.imageSize | 0;
        const minNumPasses = (options.minNumPasses || 2) | 0;

        let lastVariance = 0;

        const levels = options.mipLevelSigmas;
        for (let i = 0; i < levels.length; ++i) {
            const size = (this.size + (1 << i) - 1) >> i;

            const desiredSigma = levels[i];
            const residueVar = desiredSigma * desiredSigma - lastVariance;
            if (residueVar < 0) {
                throw new Error("mipLevelSigmas must be a monotonically increasing sequence");
            }

            lastVariance = residueVar;

            // Upper bound of blur amount that can be applied by a single run of
            // `ltasg_single(..., {0, 1, 2}, ...)`
            const sigmaLimit = 0.5 / kernelWidth;
            const numPasses = Math.max(Math.ceil(residueVar / (sigmaLimit * sigmaLimit)), minNumPasses);
            const levelSigma = Math.sqrt(residueVar / numPasses) * size;

            const kernelRadius = Math.ceil(levelSigma * kernelResolution * kernelWidth);
            const kernelScale = 1 / kernelResolution;

            const kernel = generateGaussianKernel(
                kernelRadius, levelSigma * kernelScale
            );

            this.plan.push({
                kernel,
                kernelScale,
                numPasses,
            });
        }
    }

    /**
     * Apply the blur on the cube map image.
     *
     * @return The processed mipmapped cube map image.
     */
    process(
        input: (Uint8Array | Float32Array | ImageLike)[],
        inFormat: ImageFormat,
        outFormat: ImageFormat,
    ): Float32Array[][] | Uint8Array[][] {
        if (input.length < 6) {
            throw new Error("input.length must be ≥ 6");
        }

        const {core, plan, size} = this;

        // Coerce to `RgbaF32PremulAlpha`
        const baseLevel = table(6, i => {
            const img = input[i];
            let f32 = coerceToRgbaF32PremulAlphaFrom(img, inFormat, size, size);

            // Make it an unique object
            if (f32 === img) {
                f32 = new Float32Array(f32);
            }

            if (f32.length < size * size * 4) {
                throw new Error("One of the input images is too small");
            }

            return f32;
        });

        // Generate levels
        const levels: (Float32Array | Uint8Array)[][] = [];
        let currentLevel = baseLevel;
        let currentSize = size;

        for (let i = 0; i < plan.length; ++i) {
            let newSize = (currentSize + 1) >> 1;
            if (i > 0) {
                // Resample from the previous mip level
                currentLevel = currentLevel.map(image => resampleRgbF32(
                    image, currentSize, currentSize, newSize, newSize,
                ));
            }
            currentSize = newSize;

            const {kernel, kernelScale, numPasses} = plan[i];
            core.ltasg(
                currentLevel,
                currentLevel,
                currentSize,
                ImageFormat.RgbaF32PremulAlpha,
                kernel,
                kernelScale,
                numPasses,
            );

            if (outFormat != ImageFormat.RgbaF32PremulAlpha) {
                levels.push(currentLevel.map(image => coerceRgbaF32PremulAlphaTo(image, outFormat)));
            } else {
                levels.push(currentLevel);
            }
        }

        return levels as any;
    }
}
