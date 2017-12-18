/*
 * Copyright (c) 2017 yvt
 *
 * This file is a part of hyper3d-envmapgen. Please read the license text that
 * comes with the source code for use conditions.
 */
//! Provides a linear-time approximate spherical Gaussian blur implementation.
//! Please see `Pre-filtering Environment Maps.lyx` for the principle behind
//! this algorithm.
use std::ops;
use std::mem::swap;
use cgmath::{num_traits, Vector2};
use accessor::SliceAccessor;

use cubemap::CubeFace;

/// Faster alternative for the standard `f32::round` function.
#[inline(always)]
fn roundf32(x: f32) -> f32 {
    (x + 0.5).floor()
}

pub fn gaussian_kernel(radius: usize, sigma: f32) -> Vec<f32> {
    let mut v: Vec<f32> = (-(radius as isize)..(radius as isize) + 1)
        .map(|i| (-0.5 * (i as f32 * (1.0 / sigma)).powi(2)).exp())
        .collect();

    // normalize
    let sum: f32 = v.iter().sum();
    for x in v.iter_mut() {
        *x *= 1.0 / sum;
    }

    v
}

pub trait CubeMapTrait {
    fn edge_stretch_fixup(&self) -> bool;
}

#[derive(Debug, Clone, Copy)]
pub struct StandardCubeMapTrait;

impl CubeMapTrait for StandardCubeMapTrait {
    fn edge_stretch_fixup(&self) -> bool {
        false
    }
}

#[derive(Debug, Clone, Copy)]
pub struct StretchedCubeMapTrait;

impl CubeMapTrait for StretchedCubeMapTrait {
    fn edge_stretch_fixup(&self) -> bool {
        false
    }
}

// Convert from a given fixed point value to integer with the nearest rounding mode.
#[inline(always)]
fn round_xp2i(v: i32) -> i32 {
    (v + 32768) >> 16
}

/// Perform a single pass of a linear-time approximate spherical Gaussian blur.
///
///  - `out_faces` is a slice of six `size`×`size` raster images on which the
///    result is written.
///  - `in_faces` is a slice of six `size`×`size` raster images to be processed.
///  - `size` specifies the size of each cube map face in pixels. Note that
///    all input/output cube faces must have the same size and must be square.
///  - `kernel` is a slice containing the kernel used for the convolution.
///    The size of the kernel is scaled by `kernel_scale`. Furthermore, it is
///    scaled by up to √3 due to the cube map projection onto a unit sphere.
///    Therefore, it is advised to use a scale value smaller than `1 / √3`.
///  - `kernel.len()` must be odd. The kernel is always center-aligned.
///  - A single call to `ltasg_single` performs a blur in a single direction.
///    `phase` specifies the direction from one of `0`, `1`, and `2`. You must
///    perform blur in all directions (in an arbitrary order) in a successive
///    fashion.
///  - `cube_map_trait` specifies the way the pixels are mapped to points on
///    cube faces. Usually you specifiy `StandardCubeMapTrait` or
///    `StretchedCubeMapTrait`.
///
/// See the example `blurcubemap` for the usage.
pub fn ltasg_single<T, Trait>(
    out_faces: &mut [&mut [T]],
    in_faces: &[&[T]],
    size: usize,
    kernel: &[f32],
    kernel_scale: f32,
    phase: usize,
    cube_map_trait: Trait,
) where
    T: Copy + Clone + ops::Mul<f32, Output = T> + ops::Add + num_traits::Zero,
    Trait: CubeMapTrait,
{
    assert!(phase < 3);
    assert!(kernel.len() % 2 == 1);

    let kernel_radius = kernel.len() / 2;
    assert!(kernel_scale >= 0.0);
    assert!(size as f32 > kernel_radius as f32 * kernel_scale * 3.0f32.sqrt());

    // Limitation due to the fixed point arithmetics
    assert!(size <= 32768);

    let out_faces = &mut out_faces[0..6];
    let in_faces = &in_faces[0..6];

    let (corner_uv, duv_dxy, brd_min, brd_max) = if cube_map_trait.edge_stretch_fixup() {
        (-1.0, 2.0 / (size - 1) as f32, 0.0, size as f32 - 1.0)
    } else {
        (
            1.0 / size as f32 - 1.0,
            2.0 / size as f32,
            -0.5,
            size as f32 - 0.5,
        )
    };

    let axis = match phase {
        0 => CubeFace::PositiveX,
        1 => CubeFace::PositiveY,
        2 => CubeFace::PositiveZ,
        _ => unreachable!(),
    };

    fn map_edge_index(face: CubeFace, edge: CubeFace, size: usize) -> (isize, isize, isize) {
        let size = size as isize;
        if face.u_face().abs() == edge.abs() {
            // Either `face`'s +U or -U edge is adjacent to `edge`
            let (x, cross_offs) = if face.u_face() == edge {
                (size - 1, -1)
            } else {
                (0, 1)
            };
            if face.v_face() == edge.u_face() || face.v_face() == edge.v_face() {
                (x, size, cross_offs)
            } else {
                debug_assert!(face.v_face() == -edge.u_face() || face.v_face() == -edge.v_face());
                (x + (size - 1) * size, -size, cross_offs)
            }
        } else {
            debug_assert!(face.v_face().abs() == edge.abs());
            // Either `face`'s +V or -V edge is adjacent to `edge`
            let (y, cross_offs) = if face.v_face() == edge {
                (size - 1, -size)
            } else {
                (0, size)
            };
            if face.u_face() == edge.u_face() || face.u_face() == edge.v_face() {
                (y * size, 1, cross_offs)
            } else {
                debug_assert!(face.u_face() == -edge.u_face() || face.u_face() == -edge.v_face());
                (size - 1 + y * size, -1, cross_offs)
            }
        }
    }

    for (out_face_i, out_face_img) in out_faces.iter_mut().enumerate() {
        let out_face_img = &mut out_face_img[0..size * size];
        let out_face = CubeFace::from_ordinal(out_face_i).unwrap();
        let in_face_img = unsafe { SliceAccessor::new(&in_faces[out_face_i][0..size * size]) };

        if out_face.abs() == axis {
            // Radial blur
            // Compute the indices, etc. for the adjacent faces
            let pos_u_face = out_face.u_face();
            let neg_u_face = -pos_u_face;
            let pos_v_face = out_face.v_face();
            let neg_v_face = -pos_v_face;

            let pos_u_img =
                unsafe { SliceAccessor::new(&in_faces[pos_u_face.as_ordinal()][0..size * size]) };
            let neg_u_img =
                unsafe { SliceAccessor::new(&in_faces[neg_u_face.as_ordinal()][0..size * size]) };
            let pos_v_img =
                unsafe { SliceAccessor::new(&in_faces[pos_v_face.as_ordinal()][0..size * size]) };
            let neg_v_img =
                unsafe { SliceAccessor::new(&in_faces[neg_v_face.as_ordinal()][0..size * size]) };

            let pos_u_idx = map_edge_index(pos_u_face, out_face, size);
            let neg_u_idx = map_edge_index(neg_u_face, out_face, size);
            let pos_v_idx = map_edge_index(pos_v_face, out_face, size);
            let neg_v_idx = map_edge_index(neg_v_face, out_face, size);

            let mut i = 0;
            let mut cur_v = corner_uv;
            for y in 0..size {
                let mut cur_u = corner_uv;
                for x in 0..size {
                    let local_scale = kernel_scale * (1.0 + cur_u * cur_u + cur_v * cur_v).sqrt();
                    let mut sum = T::zero();

                    let mut in_coord_f = Vector2::new(x, y).cast::<f32>();
                    let mut in_coord_df = Vector2::new(cur_u, cur_v) * local_scale;
                    in_coord_f -= in_coord_df * kernel_radius as f32;

                    let mut offs = Vector2::new(1, size);

                    // Swap the coordinates if Y is the major axis
                    let major_y = if cur_v.abs() > cur_u.abs() {
                        swap(&mut in_coord_f.x, &mut in_coord_f.y);
                        swap(&mut in_coord_df.x, &mut in_coord_df.y);
                        swap(&mut offs.x, &mut offs.y);
                        true
                    } else {
                        false
                    };

                    // The footprint possibly crosses the boundary?
                    // (We must be conservative due to FP rounding)
                    let in_coord_end_f = in_coord_f + in_coord_df * kernel.len() as f32;

                    if in_coord_end_f.x <= brd_min || in_coord_end_f.x >= brd_max {
                        let ((base_idx, main_offs, cross_offs), overflow_img) = if major_y {
                            if in_coord_df.x >= 0.0 {
                                (pos_v_idx, pos_v_img)
                            } else {
                                (neg_v_idx, neg_v_img)
                            }
                        } else {
                            if in_coord_df.x >= 0.0 {
                                (pos_u_idx, pos_u_img)
                            } else {
                                (neg_u_idx, neg_u_img)
                            }
                        };

                        // Where does it possibly cross the boundary?
                        let mut minor_pos = if in_coord_df.x >= 0.0 {
                            (brd_max - in_coord_f.x) / in_coord_df.x
                        } else {
                            (brd_min - in_coord_f.x) / in_coord_df.x
                        } * in_coord_df.y +
                            in_coord_f.y;

                        // Corner case (causes a crash)
                        if minor_pos <= brd_min {
                            minor_pos = brd_min + 0.00001;
                        } else if minor_pos >= brd_max {
                            minor_pos = brd_max - 0.00001;
                        }

                        let (overflow_start, overflow_offs) =
                            (
                                base_idx + main_offs * roundf32(minor_pos) as isize,
                                cross_offs,
                            );

                        // Convert to 16.16 fixed point
                        let mut in_coord_f = (in_coord_f * 65536.0).cast::<i32>();
                        let mut in_coord_df = (in_coord_df * 65536.0).cast::<i32>();
                        let brd_min = (brd_min * 65536.0) as i32;
                        let brd_max = (brd_max * 65536.0) as i32;

                        macro_rules! step_overflow {
                            ($dist:expr) => ({
                                let distance_i = round_xp2i($dist - brd_min) as isize;
                                overflow_img[(overflow_start + distance_i * overflow_offs) as usize]
                            })
                        }
                        macro_rules! step_normal {
                            () => ({
                                let in_coord_x = round_xp2i(in_coord_f.x) as usize;
                                let in_coord_y = round_xp2i(in_coord_f.y) as usize;
                                in_face_img[in_coord_x * offs.x + in_coord_y * offs.y]
                            })
                        }

                        // `in_coord_df.x` is monotonically increasing/decreasing, so...
                        let mut it = kernel.iter();

                        loop {
                            if in_coord_df.x >= 0 {
                                if in_coord_f.x >= brd_max {
                                    break;
                                }
                            } else {
                                if in_coord_f.x <= brd_min {
                                    break;
                                }
                            }
                            if let Some(weight) = it.next() {
                                sum = sum + step_normal!() * *weight;
                                in_coord_f += in_coord_df;
                            } else {
                                break;
                            }
                        }
                        while let Some(weight) = it.next() {
                            let distance = if in_coord_df.x >= 0 {
                                in_coord_f.x - brd_max
                            } else {
                                brd_min - in_coord_f.x
                            };
                            debug_assert!(distance >= 0);

                            sum = sum + step_overflow!(distance) * *weight;
                            in_coord_f += in_coord_df;
                        }
                    } else {
                        // Convert to 16.16 fixed point
                        let mut in_coord_f = (in_coord_f * 65536.0).cast::<i32>();
                        let mut in_coord_df = (in_coord_df * 65536.0).cast::<i32>();

                        for weight in kernel.iter() {
                            let in_coord_x = round_xp2i(in_coord_f.x) as usize;
                            let in_coord_y = round_xp2i(in_coord_f.y) as usize;

                            sum = sum +
                                in_face_img[in_coord_x * offs.x + in_coord_y * offs.y] * *weight;

                            in_coord_f += in_coord_df;
                        }
                    }

                    out_face_img[i] = sum;

                    i += 1;
                    cur_u += duv_dxy;
                }
                cur_v += duv_dxy;
            }
        } else {
            // Directional blur
            let (pos_axis_face, neg_axis_face) = if out_face.u_face().abs() == axis {
                (out_face.u_face(), -out_face.u_face())
            } else {
                (out_face.v_face(), -out_face.v_face())
            };

            let pos_axis_img = unsafe {
                SliceAccessor::new(&in_faces[pos_axis_face.as_ordinal()][0..size * size])
            };
            let neg_axis_img = unsafe {
                SliceAccessor::new(&in_faces[neg_axis_face.as_ordinal()][0..size * size])
            };

            let pos_axis_idx = map_edge_index(pos_axis_face, out_face, size);
            let neg_axis_idx = map_edge_index(neg_axis_face, out_face, size);

            let mut offs = Vector2::new(1, size);

            // Swap the coordinates if `out_face.v_face().abs() == axis`
            // TODO: transpose the input image for an `improved cache utilization
            if out_face.v_face().abs() == axis {
                swap(&mut offs.x, &mut offs.y);
            }

            let mut cur_v = corner_uv;
            for y in 0..size {
                let mut cur_u = corner_uv;
                for x in 0..size {
                    let local_scale = kernel_scale * (1.0 + cur_u * cur_u + cur_v * cur_v).sqrt();
                    let mut sum = T::zero();

                    // 48.16 fixed point values
                    let mut in_coord_x_f = (x as i32) << 16;
                    let in_coord_x_df = (local_scale * 65536.0) as i32;
                    let brd_min = (brd_min * 65536.0) as i32;
                    let brd_max = (brd_max * 65536.0) as i32;
                    let cur_v = (cur_v * 65536.0) as i32;

                    in_coord_x_f -= in_coord_x_df * kernel_radius as i32;

                    macro_rules! step_overflow {
                        ($idx:expr, $img:expr, $dist:expr) => ({
                            // Toward the center
                            let (base_idx, main_offs, cross_offs) = $idx;
                            let overflow_main_df = $dist as i64 * (-cur_v as i64); // 32.32
                            let overflow_main = y as isize + ((overflow_main_df + (32768 << 16)) >> 32) as isize;
                            let overflow_cross = round_xp2i($dist) as isize;
                            $img[(base_idx + overflow_main * main_offs +
                                overflow_cross * cross_offs) as usize]
                        })
                    }
                    macro_rules! step_normal {
                        () => ({
                            let in_coord_x = round_xp2i(in_coord_x_f) as usize;
                            let in_coord_y = y;

                            in_face_img[in_coord_x * offs.x + in_coord_y * offs.y]
                        })
                    }

                    // `in_coord_x_f` monotonically increases, so...
                    let mut it = kernel.iter();
                    loop {
                        if in_coord_x_f > brd_min {
                            break;
                        }
                        if let Some(weight) = it.next() {
                            sum = sum +
                                step_overflow!(
                                    neg_axis_idx,
                                    neg_axis_img,
                                    brd_min - in_coord_x_f
                                ) * *weight;
                        } else {
                            break;
                        }
                        in_coord_x_f += in_coord_x_df;
                    }
                    loop {
                        if in_coord_x_f >= brd_max {
                            break;
                        }
                        if let Some(weight) = it.next() {
                            sum = sum + step_normal!() * *weight;
                        } else {
                            break;
                        }
                        in_coord_x_f += in_coord_x_df;
                    }
                    while let Some(weight) = it.next() {
                        sum = sum +
                            step_overflow!(pos_axis_idx, pos_axis_img, in_coord_x_f - brd_max) *
                                *weight;
                        in_coord_x_f += in_coord_x_df;
                    }

                    out_face_img[x * offs.x + y * offs.y] = sum;

                    cur_u += duv_dxy;
                }
                cur_v += duv_dxy;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn doesnt_panic() {
        let kernel = gaussian_kernel(8, 4.0);
        for &size in [15, 16, 32, 64, 100, 127, 128, 256].iter() {
            println!("Trying size {}", size);
            let count = size * size;
            ltasg_single(
                &mut [
                    &mut vec![0f32; count][..],
                    &mut vec![0f32; count][..],
                    &mut vec![0f32; count][..],
                    &mut vec![0f32; count][..],
                    &mut vec![0f32; count][..],
                    &mut vec![0f32; count][..],
                ],
                &[
                    &vec![0f32; count][..],
                    &vec![0f32; count][..],
                    &vec![0f32; count][..],
                    &vec![0f32; count][..],
                    &vec![0f32; count][..],
                    &vec![0f32; count][..],
                ],
                size,
                &kernel,
                0.5,
                0,
                StandardCubeMapTrait,
            );
        }
    }
}
