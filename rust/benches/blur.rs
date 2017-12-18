/*
 * Copyright (c) 2017 yvt
 *
 * This file is a part of hyper3d-envmapgen. Please read the license text that
 * comes with the source code for use conditions.
 */
#![feature(test)]
extern crate test;
extern crate hyperenvmap;
use hyperenvmap::ltasgblur;

fn run_single(b: &mut test::Bencher, size: usize, pass: usize) {
    let kernel = ltasgblur::gaussian_kernel(8, 4.0);
    let count = size * size;
    let src = vec![vec![0f32; count]; 6];
    let mut dst = vec![vec![0f32; count]; 6];
    b.iter(move || {
        ltasgblur::ltasg_single(
            dst.iter_mut()
                .map(Vec::as_mut_slice)
                .collect::<Vec<_>>()
                .as_mut_slice(),
            src.iter().map(Vec::as_slice).collect::<Vec<_>>().as_slice(),
            size,
            &kernel,
            0.5,
            pass,
            ltasgblur::StandardCubeMapTrait,
        );
    })
}

#[bench]
fn blur1_16(b: &mut test::Bencher) {
    run_single(b, 16, 0)
}

#[bench]
fn blur1_32(b: &mut test::Bencher) {
    run_single(b, 32, 0)
}

#[bench]
fn blur1_64(b: &mut test::Bencher) {
    run_single(b, 64, 0)
}

#[bench]
fn blur1_128(b: &mut test::Bencher) {
    run_single(b, 128, 0)
}

#[bench]
fn blur2_16(b: &mut test::Bencher) {
    run_single(b, 16, 1)
}

#[bench]
fn blur2_32(b: &mut test::Bencher) {
    run_single(b, 32, 1)
}

#[bench]
fn blur2_64(b: &mut test::Bencher) {
    run_single(b, 64, 1)
}

#[bench]
fn blur2_128(b: &mut test::Bencher) {
    run_single(b, 128, 1)
}

#[bench]
fn blur3_16(b: &mut test::Bencher) {
    run_single(b, 16, 2)
}

#[bench]
fn blur3_32(b: &mut test::Bencher) {
    run_single(b, 32, 2)
}

#[bench]
fn blur3_64(b: &mut test::Bencher) {
    run_single(b, 64, 2)
}

#[bench]
fn blur3_128(b: &mut test::Bencher) {
    run_single(b, 128, 2)
}

#[bench]
fn blur_mip_pyramid(b: &mut test::Bencher) {
    // Based on the parameters from ARcane's `context.rs`
    const LOG_SIZE: usize = 6;
    const SIZE: usize = 1 << LOG_SIZE;

    static BLUR_KERNEL_SIGMA: f32 = 4.0;
    static BLUR_KERNEL_RATIO: f32 = 2.0;

    let blur_table: Vec<(f32, usize)> = {
        let mut last_variance = 0.0;
        (0..5u8)
            .map(|i| {
                let size = SIZE >> i;
                let sigma = (i as f32 - 5.0).exp2();

                // The amount of ltasgblur applied on this stage
                let res_sigma = (sigma * sigma - last_variance).sqrt();
                last_variance = sigma * sigma;

                // Upper bound of ltasgblur amount that can be applied by a single run of
                // `ltasg_single(..., {0, 1, 2}, ...)`
                let sigma_limit = 0.5 / BLUR_KERNEL_RATIO;
                let num_passes = (res_sigma * res_sigma / (sigma_limit * sigma_limit)).ceil();

                let level_sigma = (res_sigma * res_sigma / num_passes).sqrt() * size as f32 /
                    BLUR_KERNEL_SIGMA;

                (level_sigma, num_passes as usize)
            })
            .collect()
    };

    let kernel = ltasgblur::gaussian_kernel(
        (BLUR_KERNEL_SIGMA * BLUR_KERNEL_RATIO) as usize,
        BLUR_KERNEL_SIGMA,
    );

    let count = SIZE * SIZE;
    let src = vec![vec![0f32; count]; 6];
    let mut dst = vec![vec![0f32; count]; 6];
    b.iter(move || for (i, &(kernel_scale, num_passes)) in
        blur_table.iter().enumerate()
    {
        for _ in 0..num_passes {
            for pass in 0..3 {
                ltasgblur::ltasg_single(
                    dst.iter_mut()
                        .map(Vec::as_mut_slice)
                        .collect::<Vec<_>>()
                        .as_mut_slice(),
                    src.iter().map(Vec::as_slice).collect::<Vec<_>>().as_slice(),
                    SIZE >> i,
                    &kernel,
                    kernel_scale,
                    pass,
                    ltasgblur::StandardCubeMapTrait,
                );
            }
        }
    })
}
