/*
 * Copyright (c) 2017 yvt
 *
 * This file is a part of hyper3d-envmapgen. Please read the license text that
 * comes with the source code for use conditions.
 */

export function table<T>(length: number, cb: (i: number) => T): T[] {
    const result: T[] = [];
    for (let i = 0; i < length; ++i) {
        result.push(cb(i));
    }
    return result;
}
