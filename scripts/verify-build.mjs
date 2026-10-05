import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const source=await readFile('src/coast.cu','utf8'),manifest=JSON.parse(await readFile('dist/kernels/manifest.json','utf8'));
assert.equal(manifest.sha256,createHash('sha256').update(source).digest('hex'));
assert.deepEqual(manifest.entries,[...source.matchAll(/__global__ void (\w+)/g)].map(m=>m[1]));
for(const name of manifest.entries){const artifact=JSON.parse(await readFile(`dist/kernels/${name}.json`,'utf8'));assert.ok(artifact.wgsl.includes('@compute'));assert.ok(artifact.metadata);}
for(const path of ['.nojekyll','index.html','style.css','src/app.js','src/terrain-world.js','src/vegetation.js','assets/tropical/vegetation-atlas-v1.png','assets/tropical/vegetation-atlas-v1.json','vendor/webcuda/runtime/runtime.js','vendor/webcuda/runtime/three-bridge.js','vendor/webcuda/LICENSE','node_modules/three/build/three.webgpu.js','node_modules/three/build/three.tsl.js','node_modules/three/build/three.core.js','node_modules/three/LICENSE','LICENSE'])await access('dist/'+path);
const html=await readFile('dist/index.html','utf8');assert.ok(!/(?:src|href)=["']\//.test(html),'Pages assets must be relative');assert.ok(html.includes('value="2160"'));
const atlas=JSON.parse(await readFile('dist/assets/tropical/vegetation-atlas-v1.json','utf8'));assert.equal(atlas.sprites.length,12);
// Walk each local runtime import, including vendor transitive modules.
const imports=JSON.parse(html.match(/<script type="importmap">(.*?)<\/script>/s)[1]).imports;
const {posix}=await import('node:path');const seen=new Set();
async function visit(file){if(seen.has(file))return;seen.add(file);const content=await readFile('dist/'+file,'utf8');for(const m of content.matchAll(/^import\s+(?:[^;]*?\sfrom\s*)?["']([^"'\r\n]+)["']/gm)){const spec=m[1];let target;if(spec.startsWith('.'))target=posix.normalize(posix.join(posix.dirname(file),spec));else if(imports[spec])target=imports[spec].replace(/^\.\//,'');else throw Error(`Unresolved module ${spec} in ${file}`);await visit(target);}}
await visit('src/app.js');console.log(`Validated ${manifest.entries.length} CUDA artifacts, ${seen.size} runtime modules, atlas, licenses and Pages paths.`);
