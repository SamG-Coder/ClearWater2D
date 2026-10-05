# ClearWater2D

A **pixel-art, 2D isometric coastal scene** with seeded tropical islands and unbounded scrolling, built with the user's CUDA WebShader and Three.js r186 / TSL. It is a flat 2D map with animated water, depth-dependent colour and caustics, drifting cloud light, breaking waves, and persistent wet sand.

The scene contains islands, water and the requested tropical vegetation. Keep beaches clear of vegetation. Do not add piers, rocks, boats, or other decorative objects unless explicitly requested. There is no editor, sculpting panel, or saved-terrain workflow.

## Run

```powershell
git clone https://github.com/SamG-Coder/ClearWater2D.git
cd ClearWater2D
npm ci
npm run build
npm start
```

Open **http://127.0.0.1:5218** in a WebGPU-capable browser. Node.js 20+ is required for the build/server. Compiler and runtime are vendored, all modules are local, and no external scene assets are downloaded.

`npm run build` compiles `src/coast.cu` into sixteen kernel artifacts and creates a portable `dist/`. Serve that bundle with `node scripts/serve.mjs --dist`; set `PORT` to use another port. Hosting requires HTTPS or localhost for WebGPU.

## Scene controls

- Drag / WASD / arrow keys: pan the map.
- Wheel / two-finger pinch: zoom.
- Resolution selector: Pixel, 720p, 1080p, 1440p or 4K. The choice is saved in this browser.
- Click or tap the water: make a ripple.
- Seed button: choose a reproducible world or generate a random seed. The URL stores it as `?seed=642498203`.
- Sunlight / Cloud drift / Passing rain / Golden light: cycle the weather using the small mood button.
- Space: pause or resume. R / home button: return to the composed view.
- H: hide or show the small interface. Fullscreen button is available on desktop.

The interface fades while idle. Weather evolves automatically, with gradual transitions every 100 simulation seconds. Previous editor saves are ignored; existing browser storage is left intact.

## Actual 2D rendering

The renderer uses a fixed **2:1 isometric transform**. Tile size is constant at every screen row. Land height and water depth never move a tile's screen position. There is no perspective camera, raised island geometry, terrain mesh, or 3D scene orbit. Three.js presents one flat CUDA image through TSL on the same GPUDevice.

Terrain and water are procedural; vegetation uses the generated local sprite atlas. A 28-colour palette defines deep water, cyan shallows, sand, wet sand, grass, foam and warm sunlight. Pixel mode uses a low logical resolution (desktop maximum 480 x 360; touch maximum 240 x 440) with nearest-neighbour enlargement. Higher presets increase the actual CUDA render buffer up to 3840 x 2160 at 16:9, or 2160 x 3840 in portrait. Other aspect ratios fit inside these bounds without stretching the scene. Higher resolutions cost more GPU time; 4K performance depends on hardware.

## Water and terrain data

- A moving 513 x 513 elevation grid samples a 6144 m square at 12 m spacing. The cache recentres in 1536 m steps as you pan. Cubic B-spline reconstruction makes continuous beaches and underwater slopes.
- The world seed and region coordinates determine kilometre-scale tropical islands, smaller offshore islets, irregular bays and sand shelves. Interiors stay below 3.6 m; mountains, river routing and channel carving have been removed.
- Only one terrain window is resident. Terrain, vegetation and the two shoreline buffers use about 15 MB, independent of travel distance. Returning to an old location regenerates its geography deterministically, with no CPU readback.
- Camera travel has no imposed map boundary. GPU floating-point coordinates still have finite precision at extreme distances. The zoom limit keeps the visible area inside the active cache.
- Two 128 x 128 spectral cascades, with 48 m and 9 m periods, use a Gaussian Phillips-style spectrum, Hermitian time evolution, and a shared-memory radix-2 inverse FFT adapted from ClearWater6.1.
- Three 256 x 256 photon fields focus refracted light at 0.6 m, 2.4 m and 8 m depth. Bilinear atomic splats conserve flux to quantization precision. Depth interpolation supplies underwater caustics.
- Depth-dependent absorption removes red first and leaves blue/green scattering. Snell refraction samples the 2D depth field; it does not displace the map geometry.
- A 256 x 256 shoreline field stores wetness, residual foam, remembered high-water level, and water coverage. Incoming fronts slow over shallow water, move the wash line, leave foam, and wet the beach. Wetness decays more slowly than foam. Cache moves transfer overlapping wetness at the same world positions; wetness outside the active window is not persisted.
- Tides change water coverage and apparent island outlines. This is a shoreline approximation, not a shallow-water fluid solver or sediment/erosion simulation.

## Light and weather

One sun direction controls wave highlights, cloud lighting/shadow offsets and the refracted light offset. Spectral normals and a GGX lobe generate the highlights. A camera-relative **2D sheen mask** places their visible path across the flat map; this is deliberately art-directed, not a perspective ray-traced sun reflection. Time/weather moves and colours the sheen.

Cloud density is integrated through twelve samples of a 3D procedural field into a 192 x 192 cache, used by the 2D scene for cloud reflections and shadows. Rain adds surface rings and streaks. This is an approximation, not full volumetric multiple scattering.

All terrain, FFT, refraction, caustics, shoreline state, cloud integration, shading and palette work is authored in **`src/coast.cu`** and compiled to WGSL. JavaScript handles input, resources, dispatch, weather timing and presentation. Generated shaders are build outputs and should not be edited by hand. Normal animation performs no CPU readback; `window.coastLab` exposes explicit diagnostic readbacks only when requested.

## Vegetation and live shadows

The local 12-sprite atlas is decoded once by `src/vegetation.js` and uploaded to GPU storage. `vegetation_seed` generates deterministic jittered clusters and open clearings in world coordinates. Roots require ground above 1.42 m, with surrounding samples above 1.18 m to keep planting inside the grass margin. Placement is stable across cache moves and when revisiting distant islands.

`render_vegetation` samples coarse sprite pixels, maps leaves and trunks into the existing muted terrain palette, applies wind sway and cloud/weather lighting, and composites by projected root depth. Mature palms remain around 14 m tall; the opening camera frames a closer coastal view so they are readable. Zooming out reduces them with the world scale.

Live shadows project each sprite texel's estimated height along `-sunXY / sunZ` onto the ground, then apply the same 2:1 map transform as the terrain. The silhouette, wind displacement and root anchor are shared by the tree and its shadow. Lower sun produces longer shadows. These are flat-ground affine sprite silhouettes, not volumetric trees, slope-aware shadow maps or tree-to-tree shadowing.

Run `node scripts/verify-vegetation.mjs` for the 10 vegetation checks: all variants, grass-only placement, actual visible rendering, moving and lengthening shadows, wind, streaming stability, regeneration, readback-free animation and GPU errors. Screenshots include the coastal view and morning/golden-light comparisons.

## Verification

Run `npm test` with the local server running. The 23 checks cover seeded reproducibility, low tropical relief, island scale, removed waterways, scrolling in both directions to distant regions, fixed memory, overlapping cache continuity, wetness transfer, analytical FFT results, photon flux, water animation, mouse/touch controls, seed input, pause and GPU errors. Screenshots and numerical results are saved under `reports/`.

The terrain generator and water renderer are CUDA source compiled to WebGPU, not native NVIDIA CUDA execution. Browser shader preparation is separate from terrain generation; timings are available in `window.coastDiagnostics`.

Pixel 7 coverage is browser emulation, not a physical mobile GPU test. `TEST_URL` can target the portable bundle. `node scripts/capture.mjs` captures the current scene and numerical diagnostics.

## GitHub Pages

Live scene: https://samg-coder.github.io/ClearWater2D/

The Pages workflow builds on pushes to main and manual runs, checks the generated kernels and complete local module graph, uploads dist, then deploys with the GitHub Pages environment. Pull requests run build validation without deploying. The build includes the atlas, Three.js modules, vendored runtime, licenses and .nojekyll. No API keys or native CUDA installation are required; a WebGPU-capable browser is required.

`npm run test:build` validates the portable bundle without a GPU and runs in Actions. `npm test`, `npm run test:vegetation` and `npm run test:resolution` use local Edge/WebGPU and are run separately; the Actions build does not claim hardware rendering coverage. Resolution checks cover real buffer dimensions, 4K persistence, portrait layout and return to Pixel mode.
