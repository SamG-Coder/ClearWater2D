# Third-party sources

CUDA WebShader compiler, runtime, and Three.js bridge are vendored from CUDA WebShader, upstream https://github.com/SamG-Coder/cuda-webshader (MIT; see vendor/webcuda/LICENSE). Three.js r186 is pinned in package-lock.json and distributed under MIT.

The local compiler/runtime checkout reported commit `d6b9de81a68c1ced62144d325fdc701dd368b6ea` when copied. The ClearWater6.1 reference checkout reported `9b8eca59c211d93c1d594c9577ae4bf4ffeebe73`. These identify the inspected checkouts; vendored files themselves are the authoritative source used by this build.

The spectral initialization, Hermitian evolution, and shared-memory radix-2 inverse FFT adapt the CUDA water implementation in ClearWater6.1, owned by SamG-Coder (MIT). The seeded tropical terrain, streaming cache, tiled coast renderer, pixel-art palette, persistent shoreline, weather volume, depth optics, and scene interface are authored for ClearWater2D. Terrain and water imagery are procedural. Tropical vegetation uses the original image_gen artwork in assets/tropical, with generation prompts recorded there; CUDA placement, palette adaptation, wind and shadow projection are authored for ClearWater2D.

