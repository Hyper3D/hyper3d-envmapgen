/*
 * Copyright (c) 2017 yvt
 *
 * This file is a part of hyper3d-envmapgen. Please read the license text that
 * comes with the source code for use conditions.
 */
export interface ViewerState
{
    readonly faceImages: ReadonlyArray<HTMLImageElement | null>;
}

export const DEFAULT_VIEWER_STATE: ViewerState = {
    faceImages: [null, null, null, null, null, null],
};
