/*
 * Copyright (c) 2017 yvt
 *
 * This file is a part of hyper3d-envmapgen. Please read the license text that
 * comes with the source code for use conditions.
 */
extern crate clap;
extern crate image;
extern crate hyperenvmap;
extern crate cgmath;

use std::mem::swap;
use std::path::{Path, PathBuf};
use std::ffi::{OsStr, OsString};

use cgmath::Vector4;

use hyperenvmap::cubemap::CubeFace;
use hyperenvmap::ltasgblur;

#[derive(Debug, Copy, Clone)]
struct Image<T> {
    pub data: T,
    pub width: usize,
    pub height: usize,
}

struct CubeMapPathSet {
    base: PathBuf,
    ext: OsString,
}

impl CubeMapPathSet {
    pub fn from_one(name: &Path) -> Option<Self> {
        let stem = name.file_stem();
        if ["posx", "negx", "posy", "negy", "posz", "negz"]
            .iter()
            .all(|s| stem != Some(OsStr::new(s)))
        {
            return None;
        }

        Some(Self {
            base: name.parent().unwrap().to_owned(),
            ext: match name.extension() {
                Some(ext) => {
                    let mut s = OsStr::new(".").to_owned();
                    s.push(ext);
                    s
                }
                None => OsString::new(),
            },
        })
    }

    pub fn path(&self, face: CubeFace) -> PathBuf {
        let mut name = OsStr::new(match face {
            CubeFace::PositiveX => "posx",
            CubeFace::NegativeX => "negx",
            CubeFace::PositiveY => "posy",
            CubeFace::NegativeY => "negy",
            CubeFace::PositiveZ => "posz",
            CubeFace::NegativeZ => "negz",
        }).to_owned();
        name.push(&self.ext);
        self.base.join(name)
    }

    pub fn paths(&self) -> [PathBuf; 6] {
        [
            self.path(CubeFace::PositiveX),
            self.path(CubeFace::NegativeX),
            self.path(CubeFace::PositiveY),
            self.path(CubeFace::NegativeY),
            self.path(CubeFace::PositiveZ),
            self.path(CubeFace::NegativeZ),
        ]
    }
}

fn main() {
    use clap::{App, Arg};
    let matches = App::new("blurcubemap")
        .author("yvt <i@yvt.jp>")
        .arg(
            Arg::with_name("input")
                .required(true)
                .index(1)
                .value_name("INDIR")
                .help(
                    "Specifies the path to a cube map. \
                     A cube map is composed of six image files named posx.EXT, \
                     negx.EXT (EXT can be anything), and so forth, and one of \
                     such files must be specified as the parameter.",
                ),
        )
        .arg(
            Arg::with_name("output")
                .required(true)
                .index(2)
                .value_name("OUTDIR")
                .help(
                    "Specifies the path to save the generated cube map. \
                     A cube map is composed of six image files named posx.EXT, \
                     negx.EXT (EXT can be anything), and so forth, and one of \
                     such files must be specified as the parameter.",
                ),
        )
        .arg(
            Arg::with_name("sigma")
                .short("s")
                .long("sigma")
                .value_name("SIGMA")
                .help("Specifies the standard deviation of the blur kernel.")
                .takes_value(true)
                .default_value("0.01"),
        )
        .arg(
            Arg::with_name("normalize")
                .short("n")
                .long("normalize")
                .help("Scale the output values to range [0, 1]"),
        )
        .get_matches();

    let input_files = CubeMapPathSet::from_one(Path::new(matches.value_of_os("input").unwrap()))
        .ok_or("Invalid input path — Try --help")
        .unwrap();

    let output_files = CubeMapPathSet::from_one(Path::new(matches.value_of_os("output").unwrap()))
        .ok_or("Invalid output path — Try --help")
        .unwrap();

    use std::str::FromStr;
    let sigma = f32::from_str(matches.value_of("sigma").unwrap()).unwrap();

    let mut images: Vec<_> = input_files
        .paths()
        .iter()
        .map(|path| {
            println!("Loading {}", path.display());
            let img = image::open(&path).unwrap().to_rgba();

            // Convert to RGBAF32
            (
                Image {
                    data: img.pixels()
                        .map(|rgba| {
                            let rgba = Vector4::new(
                                rgba.data[0],
                                rgba.data[1],
                                rgba.data[2],
                                rgba.data[3],
                            ).cast::<f32>();

                            // Linearize
                            Vector4::new(
                                rgba.x * rgba.x * rgba.w,
                                rgba.y * rgba.y * rgba.w,
                                rgba.z * rgba.z * rgba.w,
                                rgba.w,
                            )
                        })
                        .collect::<Vec<_>>(),
                    width: img.width() as usize,
                    height: img.height() as usize,
                },
                path.clone(),
            )
        })
        .collect();

    let size = images[0].0.width;

    // Validate the image size
    for &(ref image, ref name) in images.iter() {
        if image.width != size || image.height != size {
            panic!(
                "Image size of '{}' is invalid — all images must be square and have the same size",
                name.display()
            );
        }
    }

    // Strip path info
    let mut images: Vec<_> = images.drain(..).map(|(img, _)| img).collect();

    // Design the filter.
    // Find the smallest `num_passes` such that
    //  - `sigma1 * sigma1 * num_passes = sigma * sigma`
    //  - `sigma1 < 1 / sqrt(3) / kernel_ratio`
    println!("Image size = {}", size);

    let kernel_ratio = 2.0f32;
    let kernel_upsample = 3.0f32;
    let sigma1_limit = 1.0 / 2.0 / kernel_ratio;
    let num_passes = (sigma * sigma / (sigma1_limit * sigma1_limit)).ceil() as usize;
    let sigma1 = (sigma * sigma / num_passes as f32).sqrt();
    let sigma1_pxs = sigma1 * size as f32;
    let kernel_radius = (sigma1_pxs * kernel_ratio * kernel_upsample).ceil() as usize;
    println!("(Input) σ = {}", sigma);
    println!("σ₁ = {} = {}px / {}px", sigma1, sigma1_pxs, size);
    println!("# of Passes = {}", num_passes);
    println!(
        "Kernel Radius = {} ≈ 2σ₁ * kernel_upsample",
        kernel_radius
    );

    let kernel = ltasgblur::gaussian_kernel(kernel_radius, sigma1_pxs);

    // Apply the filter
    let mut images2 = images.clone();
    for i in 0..num_passes {
        println!("Pass {}/{}", i + 1, num_passes);
        for k in 0..3 {
            println!("  Phase {}... ", k + 1);

            {
                let mut out_faces: Vec<_> = images2.iter_mut().map(|i| &mut i.data[..]).collect();
                let in_faces: Vec<_> = images.iter().map(|i| &i.data[..]).collect();
                ltasgblur::ltasg_single(
                    &mut out_faces,
                    &in_faces,
                    size,
                    &kernel,
                    1.0 / kernel_upsample,
                    k,
                    ltasgblur::StandardCubeMapTrait,
                );
            }

            swap(&mut images, &mut images2);
        }
    }

    if matches.is_present("normalize") {
        let max_value = images
            .iter()
            .map(|image| {
                image
                    .data
                    .iter()
                    .map(|pixel| {
                        [
                            pixel[0] / pixel[3],
                            pixel[1] / pixel[3],
                            pixel[2] / pixel[3],
                        ].iter()
                            .fold(0.0f32, |x, y| x.max(*y))
                    })
                    .fold(0.0f32, |x, y| x.max(y))
            })
            .fold(0.0f32, |x, y| x.max(y));
        println!("Maximum value = {}", max_value);
        for image in images.iter_mut() {
            for x in image.data.iter_mut() {
                x[0] *= (255.0 * 255.0) / max_value;
                x[1] *= (255.0 * 255.0) / max_value;
                x[2] *= (255.0 * 255.0) / max_value;
            }
        }
    }

    // Output the processed images
    let mut img = image::RgbaImage::new(size as u32, size as u32);
    for (image, path) in images.iter().zip(output_files.paths().iter()) {
        for (y, x) in img.pixels_mut().zip(image.data.iter()) {
            let rgba = *x;

            // De-linearize, convert to straight alpha, and round
            let rgba = Vector4::new(
                ((rgba.x / rgba.w).sqrt()).round().min(255.0),
                ((rgba.y / rgba.w).sqrt()).round().min(255.0),
                ((rgba.z / rgba.w).sqrt()).round().min(255.0),
                (rgba.w).round().min(255.0),
            ).cast::<u8>();

            y.data[0] = rgba.x;
            y.data[1] = rgba.y;
            y.data[2] = rgba.z;
            y.data[3] = rgba.w;
        }
        println!("Saving {}", path.display());
        img.save(path).unwrap();
    }
}
