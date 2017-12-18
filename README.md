Hyper3D EnvMapGen
=================

Pre-filtered mipmapped radiance environment map generator that runs on WebAssembly. The core functionality is implemented by Rust and is available as a standalone crate.

## Features

- LTASG (linear-time approximate spherical Gaussian) filtering that can be used to approximate the Blinn-Phong NDF for small roughness values.

Possible TODOs:

- More filtering algorithms and techniques
    - GGX + importance sampling
    - GGX + [Fast Filtering of Reflection Probes]
- Linear filtering in LTASG 
    - The currently used nearest neighbor filtering produces a poor result unless the number of passes is set to at least two or three.

[Fast Filtering of Reflection Probes]: https://dl.acm.org/citation.cfm?id=3071786

## Usage: JavaScript

TODO

## Usage: Rust

This repository provides a crate named `hyperenvmapgen`, which can be found in the directory `rust`.

This crate is never meant to be stablized. Therefore, it is strongly recommended to specify the revision hash as shown below:

```toml
[dependencies]
hyperenvmapgen = { 
    git = "https://github.com/Hyper3D/hyper3d-envmapgen", 
    rev = "INSERT REVISION HASH HERE",
    path = "rust",
}
```

## Building

    # Install the Rust toolchain for WebAssembly compilation
    rustup target add wasm32-unknown-unknown --toolchain nightly
    cargo install --git https://github.com/alexcrichton/wasm-gc 

    # Install necessary packages
    npm install

    # Build the library
    npm run build
