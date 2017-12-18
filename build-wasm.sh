#!/bin/sh

set -x
cd "`dirname "$0"`"

pushd wasmbinding
cargo build --target=wasm32-unknown-unknown --release || exit 1
popd

wasm-gc target/wasm32-unknown-unknown/release/hyperenvmap_wasm.wasm target/hyperenvmap_wasm.wasm
node tools/btoa.js target/hyperenvmap_wasm.wasm > dist/wasm-blob.js
