/*
 * Copyright (c) 2017 yvt
 *
 * This file is a part of hyper3d-envmapgen. Please read the license text that
 * comes with the source code for use conditions.
 */
#![feature(allocator_api)]
extern crate cgmath;
extern crate hyperenvmap;
extern crate smallvec;

use std::heap::{Heap, Alloc, Layout};
use std::{ptr, mem};
use std::slice::{from_raw_parts, from_raw_parts_mut};

use smallvec::SmallVec;
use cgmath::Vector4;

use hyperenvmap::ltasgblur;

#[no_mangle]
pub unsafe fn emg_init() {
    // Force the initialization of the lazily initialized value.
    // (This must be done before `emg_malloc` in order to prevent memory
    // fragmentation.)
    &*hyperenvmap::cubemap::CUBE_FACE_INFOS;
}

#[no_mangle]
pub unsafe fn emg_malloc(size: usize) -> *mut u8 {
    let layout = Layout::from_size_align(size + mem::size_of::<Layout>(), 4).unwrap();
    let p = Heap.alloc(layout.clone()).unwrap();
    ptr::write(p as *mut Layout, layout);
    for i in 0..size / 4 {
        ptr::write(
            p.offset(mem::size_of::<Layout>() as isize + (i * 4) as isize) as *mut u32,
            0xdeadbeef,
        );
    }
    p.offset(mem::size_of::<Layout>() as isize)
}

#[no_mangle]
pub unsafe fn emg_free(p: *mut u8) {
    let p = p.offset(-(mem::size_of::<Layout>() as isize));
    let layout = ptr::read(p as *mut _);
    Heap.dealloc(p, layout);
}

#[no_mangle]
pub unsafe fn emg_ltasg_single(
    mut out_faces: *mut Vector4<f32>,
    mut in_faces: *const Vector4<f32>,
    size: usize,
    kernel: *const f32,
    kernel_size: usize,
    kernel_scale: f32,
    phase: usize,
) {
    ltasgblur::ltasg_single(
        (0..6)
            .map(|_| {
                let slice = from_raw_parts_mut(out_faces, size * size);
                out_faces = out_faces.offset((size * size) as isize);
                slice
            })
            .collect::<SmallVec<[_; 6]>>()
            .as_mut_slice(),
        (0..6)
            .map(|_| {
                let slice = from_raw_parts(in_faces, size * size);
                in_faces = in_faces.offset((size * size) as isize);
                slice
            })
            .collect::<SmallVec<[_; 6]>>()
            .as_slice(),
        size,
        from_raw_parts(kernel, kernel_size),
        kernel_scale,
        phase,
        ltasgblur::StandardCubeMapTrait,
    );
}
