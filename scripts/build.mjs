import { readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { compile, serializableArtifact } from '../vendor/webcuda/compiler/compiler.js';
const source = await readFile('src/coast.cu', 'utf8');
await mkdir('kernels', { recursive: true });
// Remove retired editor and drainage artifacts from incremental builds as well.
for (const root of ['kernels', 'dist/kernels']) {
  for (const name of ['terrain_pick', 'terrain_edit', 'region_heights', 'river_paths', 'river_tributaries', 'river_pack', 'terrain_carve']) await rm(`${root}/${name}.json`, { force: true });
}
const entries = [...source.matchAll(/__global__ void (\w+)/g)].map(m => m[1]);
for (const entry of entries) {
  const workgroupSize = entry === 'fft_local' ? [64, 1, 1] : [8, 8, 1];
  const artifact = serializableArtifact(compile(source, { entry, workgroupSize }));
  await writeFile(`kernels/${entry}.json`, JSON.stringify(artifact));
  console.log(`Compiled ${entry}`);
}
await writeFile('kernels/manifest.json', JSON.stringify({ source: 'src/coast.cu', sha256: createHash('sha256').update(source).digest('hex'), entries }, null, 2));
await mkdir('dist', { recursive: true });
for (const file of ['index.html', 'style.css', 'src', 'kernels', 'assets', 'vendor', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'README.md']) await cp(file, `dist/${file}`, { recursive: true });
await mkdir('dist/node_modules/three', { recursive: true });
await cp('node_modules/three/build', 'dist/node_modules/three/build', { recursive: true });
await cp('node_modules/three/LICENSE', 'dist/node_modules/three/LICENSE');
await writeFile('dist/.nojekyll', '');
console.log(`Built ${entries.length} CUDA kernels and portable dist/`);
