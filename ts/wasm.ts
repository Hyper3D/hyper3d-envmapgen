/*
 * Copyright (c) 2017 yvt
 *
 * This file is a part of hyper3d-envmapgen. Please read the license text that
 * comes with the source code for use conditions.
 */
import { ImageFormat } from './image';

export type Ptr = number;

/**
 * Options relevant to the creation of the core WebAssembly module.
 */
export interface CoreOptions {
    /**
     * An optional pre-compiled or cached WebAssembly module, created from
     * `hyperenvmap_wasm.wasm`.
     *
     * If omitted, a global module will be created automatically by calling
     * `getGlobalCoreModule`.
     */
    module?: WebAssembly.Module;

    /**
     * An optional pre-created or cached WebAssembly instance.
     */
    instance?: WebAssembly.Instance;
}

/** The API exported by `hyperenvmap_wasm.wasm`. */
export interface CoreExports {
    memory: WebAssembly.Memory;

    emg_init(): void;

    emg_malloc(size: number): Ptr;
    emg_free(ptr: Ptr): void;

    emg_ltasg_single(
        out_faces: Ptr,
        in_faces: Ptr,
        size: number,
        kernel: Ptr,
        kernel_size: number,
        kernel_scale: number,
        phase: number,
    ): void;
}

let globalModule: Promise<WebAssembly.Module> | null = null;

/**
 * Retrieves the built-in core WebAssembly binary module. Can be used to
 * customize the initialization behavior.
 */
export function getCoreWasmBlob(): Uint8Array {
    return require('./wasm-blob');
}

/**
 * Retrieves the compiled global WebAssembly module. Triggers a synchronous
 * compilation on first use.
 */
export function getGlobalCoreModule(): Promise<WebAssembly.Module> {
    if (!globalModule) {
        globalModule = WebAssembly.compile(getCoreWasmBlob());
    }
    return globalModule;
}

/**
 * Provides a JavaScript interface to the core services.
 */
export class CoreInstance implements Readonly<CoreOptions> {
    readonly module: WebAssembly.Module;
    readonly instance: WebAssembly.Instance;

    /**
     * Asynchronous constructor of `CoreInstance`.
     */
    static async create(options: Readonly<CoreOptions> = {}): Promise<CoreInstance> {
        const module = options.module || await getGlobalCoreModule();
        const instance = options.instance || await WebAssembly.instantiate(module);
        return new CoreInstance({ ... options, module,  instance });
    }

    /**
     * Synchronous constructor of `CoreInstance`. `options.module` and
     * `options.instance` must not be `null` or `undefined`.
     */
    constructor(options: Readonly<CoreOptions> = {}) {
        if (!options.module) {
            throw new Error("options.module must be specified for synchronous construction.");
        }
        if (!options.instance) {
            throw new Error("options.instance must be specified for synchronous construction.");
        }
        this.module = options.module;
        this.instance = options.instance;

        const emg: CoreExports = this.instance.exports;
        emg.emg_init();
    }

    /**
     * Applies a linear-time approximate spherical Gaussian blur on a given
     * cube map image.
     *
     * `C` is the number of elements per pixel and fixed at `4` in the current
     * version.
     *
     * @param inFaces The input cube map image. Must have at least 6 elements
     *                and each one must be at least `(size ** 2) * C` long.
     * @param outFaces The output cube map image. Must have at least 6 elements
     *                 and each one must be at least `(size ** 2) * C` long.
     *                 You can specfify the same value as `inFaces` for in-place
     *                 operation.
     * @param size The length of each side of the cube map, in pixels.
     * @param format The image format. Must be `RgbaF32PremulAlpha`.
     * @param kernel The convolution kernel. Must be odd-sized.
     * @param kernelScale The spatial scale of the kernel. See `ltasgblur.rs` for
     *                    more info.
     * @param numPasses Specifies how many times a Gaussian blur is applied on
     *                  the image. It is more efficient to use this parameter
     *                  than calling this function for multiple times.
     */
    ltasg(
        inFaces: ArrayLike<Float32Array>,
        outFaces: ArrayLike<Float32Array>,
        size: number,
        format: ImageFormat,
        kernel: Float32Array,
        kernelScale: number,
        numPasses: number,
    ): void {
        // Fail-fast
        if (inFaces.length < 6) {
            throw new Error("inFaces.length ≥ 6");
        }
        if (outFaces.length < 6) {
            throw new Error("outFaces.length must be ≥ 6");
        }

        size |= 0; // coerce to integer
        numPasses |= 0; // coerce to integer

        const pixels = size * size;
        const channels = 4;
        const elements = pixels * channels;

        for (let i = 0; i < 6; ++i) {
            if (inFaces[i].length < elements) {
                throw new Error("∀i∈ℕ.(0 ≤ i < 6 ⇒ inFaces[i].length ≥ elements)");
            }
            if (outFaces[i].length < elements) {
                throw new Error("∀i∈ℕ.(0 ≤ i < 6 ⇒ outFaces[i].length ≥ elements)");
            }
        }

        if (format != ImageFormat.RgbaF32PremulAlpha) {
            throw new Error("format must be RgbaF32PremulAlpha");
        }

        if ((kernel.length & 1) === 0) {
            throw new Error("kernel must be odd-sized");
        }
        if (!(kernelScale > 0)) {
            throw new Error("kernelScale must be a positive number");
        }
        const kernelRadius = kernel.length >> 1;
        if (!(size > kernelRadius * kernelScale * 1.8 /* ≈ √3 */)) {
            throw new Error("kernel is too large compared to the image size");
        }

        if (size > 32768) {
            throw new Error("The image is too large");
        }
        if (numPasses < 0) {
            throw new Error("numPasses must be a positive number");
        }

        // Allocate buffers
        //  - `elements * sizeof::<f32>() * 6 * 2` bytes for input/output passing
        //    and temporary (ping-pong buffer)
        //  - `kernel.length * sizeof::<f32>()` for kernel
        const emg: CoreExports = this.instance.exports;
        const bufferLen = elements * 48 + kernel.length * 4;
        const pBuffer = emg.emg_malloc(bufferLen);

        {
            // Increase the memory allocation if needed
            const extra = ((pBuffer + bufferLen + 0xffff) >> 16) - emg.memory.buffer.byteLength;
            if (extra > 0) {
                emg.memory.grow(extra);
            }
        }

        let pImages1 = pBuffer;
        let pImages2 = pBuffer + elements * 4 * 6;
        const pKernel = pImages2 + elements * 4 * 6;

        // Upload the inputs
        for (let i = 0; i < 6; ++i) {
            new Float32Array(emg.memory.buffer, pImages1 + i * (elements * 4))
                .set(inFaces[i]);
        }
        new Float32Array(emg.memory.buffer, pKernel).set(kernel);

        // Let's get this show on the road 🍎
        for (let i = 0; i < numPasses; ++i) {
            for (let k = 0; k < 3; ++k) {
                // `pImages1` → `pImages2`
                emg.emg_ltasg_single(pImages2, pImages1, size, pKernel, kernel.length, kernelScale, k);

                // Swap buffers
                let t = pImages1;
                pImages1 = pImages2;
                pImages2 = t;
            }
        }

        // Retrieve the outputs
        for (let i = 0; i < 6; ++i) {
            outFaces[i].set(new Float32Array(emg.memory.buffer, pImages1 + i * (elements * 4), elements));
        }
        emg.emg_free(pBuffer);
    }
}
