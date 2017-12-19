/*
 * Copyright (c) 2017 yvt
 *
 * This file is a part of hyper3d-envmapgen. Please read the license text that
 * comes with the source code for use conditions.
 */
export interface ViewerState
{
    readonly faceImages: ReadonlyArray<HTMLImageElement | null>;
    readonly cubeMapSize: number;
    readonly minNumPasses: number;
    readonly kernelResolution: number;
}

export interface SceneState
{
    readonly geometry: 'sphere' | 'teapot';
}

export const DEFAULT_VIEWER_STATE: ViewerState = {
    faceImages: [null, null, null, null, null, null],
    cubeMapSize: 128,
    minNumPasses: 2,
    kernelResolution: 2,
};

export const DEFAULT_SCENE_STATE: SceneState = {
    geometry: 'sphere',
};
