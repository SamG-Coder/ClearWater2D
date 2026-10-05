ClearWater2D tropical vegetation - generated asset set v1

vegetation-atlas-v1.png is the original RGBA output from built-in image_gen.
It contains 12 sprites, read left to right and top to bottom:
  upright palm, leaning palm, leaning coconut palm, upright coconut palm;
  young palm, palm sapling, round shrub, spreading shrub;
  low bush, fern, beach grass, broadleaf ground cover.

The palette and coarse shading were directed toward the existing olive-green,
warm-sand pixel scene. There are no ground tiles or baked ground shadows.

vegetation-atlas-v1.json supplies measured atlas rectangles and approximate
root anchors. The generated image is 1448 x 1086, not the requested uniform
64-pixel cell grid. Use these rectangles rather than assuming uniform cells.
The original generated alpha is preserved. For crisp pixel rendering use
nearest-neighbour sampling and alpha cutoff 0.5; the source has faint partial
alpha at its edges. This is enlarged pixel-style artwork, not an exact native
256 x 192 indexed-colour atlas.

Suggested world heights keep mature palms in the same size class and bushes
and ground cover smaller. These are placement targets, not verified in-scene
sizes. Scale in world units with the camera, not fixed screen pixels: at the
current kilometre-scale overview an individual tree will occupy only a few
logical pixels and reveal more detail on zooming in.

The atlas is now consumed by src/vegetation.js and composited in src/coast.cu.
CUDA samples a coarse pixel grid and remaps colours into the terrain palette.
Plants are seeded on grass only. Sprite heights drive world scaling and live
sun-projected ground silhouettes; the same sway is used for both. Prompts are
recorded in generation-prompts.txt.
