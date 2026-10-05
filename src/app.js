import { loadVegetation } from './vegetation.js';
import { TerrainWorld } from './terrain-world.js';
import * as THREE from 'three/webgpu';
import { uv, uint, vec4 } from 'three/tsl';
import { GpuRuntime } from '../vendor/webcuda/runtime/runtime.js';
import { createSharedFloat4 } from '../vendor/webcuda/runtime/three-bridge.js';

const $ = id => document.getElementById(id), canvas = $('scene');
const mobile = matchMedia('(pointer:coarse)').matches || innerWidth < 650;
const diagnostics = window.coastDiagnostics = { ready: false, errors: [], frames: 0, renderReadbackBytes: 0 };
const presets = {
 clear: { name: 'Sunlight', cover: .25, rain: 0, wind: 7, hour: 14.8 },
 cloudy: { name: 'Cloud drift', cover: .88, rain: 0, wind: 10, hour: 14.3 },
 storm: { name: 'Passing rain', cover: 1, rain: .85, wind: 16, hour: 15.2 },
 sunset: { name: 'Golden light', cover: .38, rain: 0, wind: 5, hour: 17.4 }
};
const home = { cameraX: -1430, cameraY: -1080, viewHeight: Math.min(260, Math.max(160, 190 * innerHeight / innerWidth)) };
const initialSeed = new URLSearchParams(location.search).get('seed') || '1847';
function seedNumber(text) { let h=2166136261;for(const c of text){h=Math.imul(h^c.codePointAt(0),16777619);}return (h>>>0)&16777215; }
const state = { ...home, worldSeed: initialSeed, clarity: 1, time: 0, paused: false, weather: 'clear', hour: 14.8, wind: 7, cover: .25, rain: 0, caustics: true, reflections: true, shadows: true, sunStrength: .9, autoWeather: true, vegetation: true, vegetationShadows: true };
const resolutions=['pixel','720','1080','1440','2160'];
try { const saved=localStorage.getItem('clearwater2d-resolution');state.resolution=resolutions.includes(saved)?saved:'pixel'; } catch { state.resolution='pixel'; }
$('resolution').value=state.resolution;
$('resolution').onchange=()=>{state.resolution=$('resolution').value;try{localStorage.setItem('clearwater2d-resolution',state.resolution);}catch{}resizePending=true;dirty=true;wake();};
let target = { ...presets.clear }, runtime, renderer, scene, camera, quad, shared, width = 0, height = 0;
let vegetationAssets, world, tiles, shore, seed, twiddles, fftA, fftB, surface, photons, clouds, ripples, inv = {}, kernels = {};
let lastWind = -1, dirty = true, resizing = false, rendering = false, lastFrame = 0, lastUi = 0, rippleIndex = 0, autoAt = 100;
let rippleData = new Float32Array(32), resizePending = true, shoreReset = true;
const keys = new Set(), pointers = new Map();
let gesture = null, pinch = null, idleTimer;
function fail(error) { const message = error?.message || String(error); diagnostics.errors.push(message); diagnostics.ready = false; $('loading').classList.remove('hidden'); $('loading-message').textContent = message; console.error(error); }
function wake() { document.body.classList.remove('resting'); clearTimeout(idleTimer); idleTimer = setTimeout(() => document.body.classList.add('resting'), 4500); }
function setWeather(name, immediate = false) {
 if (!presets[name]) throw Error('Unknown weather preset'); state.weather = name; target = { ...presets[name] };
 if (immediate) for (const key of ['hour', 'wind', 'cover', 'rain']) state[key] = target[key];
 $('mood').textContent = target.name; autoAt = state.time + 100; dirty = true;
}
function togglePause() { state.paused = !state.paused; $('pause').textContent = state.paused ? 'â–¶' : 'â…¡'; $('pause').setAttribute('aria-label', state.paused ? 'Resume scene' : 'Pause scene'); dirty = true; wake(); }
async function dispatchTerrain() {
 await world.setSeed(seedNumber(state.worldSeed));await world.update(state.cameraX,state.cameraY);
 shoreReset=true;rippleData.fill(0);runtime.write(ripples,rippleData);$('world-seed').textContent=`Seed ${state.worldSeed}`;
}
let generating=false;
async function generateWorld(value) {
 if(generating)return;
 const text=String(value).trim().slice(0,64);if(!text)return;
 generating=true;$('world-seed').disabled=true;
 try{return await coastLab.exclusive(async()=>{state.worldSeed=text;Object.assign(state,home);await dispatchTerrain();state.time=0;dirty=true;compute(0);await runtime.idle();
  const url=new URL(location.href);url.searchParams.set('seed',text);history.replaceState(null,'',url);diagnostics.worldSeed=text;
 });}finally{generating=false;$('world-seed').disabled=false;}
}
$('world-seed').onclick=()=>{$('seed-input').value=state.worldSeed;$('seed-dialog').showModal();$('seed-input').select();};
$('seed-cancel').onclick=()=>$('seed-dialog').close();
$('seed-form').onsubmit=async e=>{e.preventDefault();if(!diagnostics.ready)return;const value=$('seed-input').value;if(!value.trim())return;$('seed-dialog').close();await generateWorld(value);wake();};
$('seed-random').onclick=()=>{$('seed-input').value=String(crypto.getRandomValues(new Uint32Array(1))[0]);};
function seaLevel() { return .10 * Math.sin(state.time * .025) + .025 * Math.sin(state.time * .09); }
function maxViewHeight(){return Math.min(1800,2200/(Math.SQRT1_2*(innerWidth/innerHeight*.5+1)));}
function worldPoint(clientX, clientY) {
 const r = canvas.getBoundingClientRect(), s = state.viewHeight / r.height;
 const x = (clientX - r.left - r.width / 2) * s, y = (clientY - r.top - r.height / 2) * s;
 return [(x+y/.5)*Math.SQRT1_2+state.cameraX,(y/.5-x)*Math.SQRT1_2+state.cameraY];
}
function addRipple(x, y) { rippleData.set([x, y, state.time, 1], (rippleIndex++ % 8) * 4); runtime?.write(ripples, rippleData); dirty = true; }
$('pause').onclick = togglePause;
$('mood').onclick = () => { const names = Object.keys(presets); setWeather(names[(names.indexOf(state.weather) + 1) % names.length]); wake(); };
$('home').onclick = () => { Object.assign(state, home); dirty = true; wake(); };
$('fullscreen').onclick = async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch {} };
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointerdown', e => {
 canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, [e.clientX, e.clientY]);
 if (pointers.size === 2) { const [a,b] = [...pointers.values()]; pinch = { distance: Math.hypot(a[0]-b[0],a[1]-b[1]), height: state.viewHeight }; gesture = null; return; }
 gesture = { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, moved: false }; wake();
});
canvas.addEventListener('pointermove', e => {
 wake(); if (pointers.has(e.pointerId)) pointers.set(e.pointerId,[e.clientX,e.clientY]);
 if (pointers.size === 2 && pinch) { const [a,b] = [...pointers.values()]; state.viewHeight = Math.max(18,Math.min(maxViewHeight(),pinch.height*pinch.distance/Math.max(1,Math.hypot(a[0]-b[0],a[1]-b[1])))); dirty = true; return; }
 if (!gesture || !pointers.has(e.pointerId)) return;
 const g=gesture;g.moved ||= Math.hypot(e.clientX-g.startX,e.clientY-g.startY)>4;
 const before=worldPoint(g.x,g.y),after=worldPoint(e.clientX,e.clientY);state.cameraX+=before[0]-after[0];state.cameraY+=before[1]-after[1];
 g.x=e.clientX;g.y=e.clientY;dirty=true;
});
function release(e) { if(e.type==='pointerup'&&gesture&&!gesture.moved&&e.button!==2)addRipple(...worldPoint(e.clientX,e.clientY));pointers.delete(e.pointerId);gesture=null;if(pointers.size<2)pinch=null; }
for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,release);
canvas.addEventListener('wheel',e=>{e.preventDefault();const before=worldPoint(e.clientX,e.clientY);state.viewHeight=Math.max(18,Math.min(maxViewHeight(),state.viewHeight*Math.exp(e.deltaY*.001)));const after=worldPoint(e.clientX,e.clientY);state.cameraX+=before[0]-after[0];state.cameraY+=before[1]-after[1];dirty=true;wake();},{passive:false});
addEventListener('keydown',e=>{if(['BUTTON','INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)||$('seed-dialog').open)return;keys.add(e.code);if(e.repeat)return;if(e.code==='Space'){e.preventDefault();togglePause();}if(e.code==='KeyH')document.body.classList.toggle('clean');if(e.code==='KeyR'){$('home').click();}});
addEventListener('keyup',e=>keys.delete(e.code));addEventListener('blur',()=>{keys.clear();pointers.clear();gesture=pinch=null;});
addEventListener('resize',()=>{resizePending=true;dirty=true;});document.addEventListener('visibilitychange',()=>{lastFrame=0;});
function renderScalars() {
 const daylight=Math.max(.2,Math.min(1,Math.sin((state.hour-6)/14*Math.PI)*1.3));
 const sunset=Math.exp(-Math.pow((state.hour-18)/2,2));
 const azimuth=-2.40+(state.hour-14.8)*.13,altitude=.80-(state.hour-14.8)*.09;
 return {width,height,cameraX:state.cameraX,cameraY:state.cameraY,scale:state.viewHeight/height,time:state.time,rain:state.rain,daylight,sunset,caustics:+state.caustics,reflections:+state.reflections,cloudShadows:+state.shadows,clarity:state.clarity,seaLevel:seaLevel(),sunX:Math.cos(azimuth)*Math.cos(altitude),sunY:Math.sin(azimuth)*Math.cos(altitude),sunZ:Math.sin(altitude),sunStrength:state.sunStrength};
}
function vegetationScalars(){
 const s=renderScalars();return {width,height,cameraX:state.cameraX,cameraY:state.cameraY,scale:s.scale,time:state.time,wind:state.wind,sunX:s.sunX,sunY:s.sunY,sunZ:s.sunZ,daylight:s.daylight,rain:state.rain,sunset:s.sunset,atlasWidth:vegetationAssets.width,enabled:+state.vegetation,castShadows:+state.vegetationShadows};
}
async function resize() {
  resizing = true; await runtime.idle();state.viewHeight=Math.min(state.viewHeight,maxViewHeight());
  // Draw the scene in actual logical pixels, then enlarge with nearest filtering.
  const portrait=innerHeight>innerWidth;
  const targetHeight=Number(state.resolution);
  const maxWidth=state.resolution==='pixel'?(mobile?240:480):(portrait?targetHeight:Math.round(targetHeight*16/9));
  const maxHeight=state.resolution==='pixel'?(mobile?440:360):(portrait?Math.round(targetHeight*16/9):targetHeight);
  const ratio=Math.min(state.resolution==='pixel'?.5:Infinity,maxWidth/innerWidth,maxHeight/innerHeight);
  const nextW=Math.max(8,Math.floor(innerWidth*ratio)),nextH=Math.max(8,Math.floor(innerHeight*ratio));
  if(nextW*nextH*16>runtime.device.limits.maxStorageBufferBindingSize)throw Error('Selected resolution exceeds this GPU buffer limit. Choose a lower resolution.');
  if (nextW !== width || nextH !== height) {
    width = nextW; height = nextH;
    if (quad) { scene.remove(quad); quad.material.dispose(); quad.geometry.dispose(); shared.dispose(); }
    renderer.setSize(width, height, false);
    shared = createSharedFloat4(renderer, runtime, new Float32Array(width * height * 4), { label: 'CUDA coast / TSL presentation' });
    const pixel = uv().x.mul(width).floor().min(width - 1).toUint().add(uv().y.oneMinus().mul(height).floor().min(height - 1).toUint().mul(uint(width)));
    const material = new THREE.MeshBasicNodeMaterial();
    material.colorNode = shared.node.element(pixel).rgb; material.opacityNode = vec4(1).w; material.depthTest = false; material.depthWrite = false;
    quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material); quad.frustumCulled = false; scene.add(quad);
    inv.render = kernels.render_coast.bind({ tiles, surface, photons, clouds, ripples, shore, image: shared.resource }, renderScalars());
    inv.vegetation=kernels.render_vegetation.bind({tiles,plants:world.vegetation,atlas:vegetationAssets.atlas,metadata:vegetationAssets.metadata,clouds,image:shared.resource},vegetationScalars());
    await renderer.compileAsync(scene, camera);
    diagnostics.width = width; diagnostics.height = height;
    diagnostics.resolution=state.resolution;diagnostics.renderPixels=width*height;
    $('resolution').title=`Render resolution: ${width} x ${height}`;
  }
  resizePending = false; resizing = false;
}

function compute(dt=0) {
 const batch=runtime.batch({label:'ClearWater2D coastal scene'});
 if(Math.abs(lastWind-state.wind)>.08){batch.dispatch(inv.seed.setScalars({wind:state.wind}),[16,16,2]);lastWind=state.wind;}
 batch.dispatch(inv.spectrum.setScalars({time:state.time,energy:.65+state.rain*.6}),[16,16,2]);
 batch.dispatch(inv.fftX,[128,1,2]);batch.dispatch(inv.fftY,[128,1,2]);batch.dispatch(inv.resolve,[16,16,2]);
 batch.dispatch(inv.clear,[32,32,3]);batch.dispatch(inv.trace,[32,32,3]);
 const scalars=renderScalars();
 batch.dispatch(inv.shore.setScalars({time:state.time,dt,seaLevel:scalars.seaLevel,reset:+shoreReset}),[64,64,1]);shoreReset=false;
 if(diagnostics.frames%4===0||dirty)batch.dispatch(inv.cloud.setScalars({time:state.time,cover:state.cover,daylight:scalars.daylight,sunX:scalars.sunX,sunY:scalars.sunY,sunZ:scalars.sunZ,originX:world.origin[0],originY:world.origin[1]}),[24,24,1]);
 batch.dispatch(inv.render.setScalars(scalars),[Math.ceil(width/8),Math.ceil(height/8),1]);batch.dispatch(inv.vegetation.setScalars(vegetationScalars()),[Math.ceil(width/8),Math.ceil(height/8),1]);batch.submit();renderer.render(scene,camera);
 diagnostics.frames++;diagnostics.time=state.time;diagnostics.camera=[state.cameraX,state.cameraY,state.viewHeight];diagnostics.weather=state.weather;diagnostics.stats={...runtime.stats};dirty=false;
}
async function frame(now) {
 if(diagnostics.errors.length)return;requestAnimationFrame(frame);
 if(rendering||resizing||document.hidden||window.coastLab?.locked)return;
 const dt=lastFrame?Math.min(.05,(now-lastFrame)/1000):1/60;lastFrame=now;
 if(!state.paused){
  state.time+=dt;const blend=1-Math.exp(-dt*.28);
  for(const key of ['hour','wind','cover','rain'])state[key]+=(target[key]-state[key])*blend;
  if(state.autoWeather&&state.time>=autoAt){const names=Object.keys(presets);setWeather(names[(names.indexOf(state.weather)+1)%names.length]);}
 }
 const speed=dt*state.viewHeight*.25,dx=(+keys.has('KeyD')+ +keys.has('ArrowRight')- +keys.has('KeyA')- +keys.has('ArrowLeft'))*speed,dy=(+keys.has('KeyS')+ +keys.has('ArrowDown')- +keys.has('KeyW')- +keys.has('ArrowUp'))*speed/.5;
 if(dx||dy){state.cameraX+=(dx+dy)*Math.SQRT1_2;state.cameraY+=(dy-dx)*Math.SQRT1_2;dirty=true;}
 // Camera coordinates are intentionally unbounded; terrain streams around them.
 if(state.paused&&!dirty&&!resizePending)return;
 rendering=true;
 try{if(resizePending)await resize();await world.update(state.cameraX,state.cameraY);compute(state.paused?0:dt);await runtime.idle();
  if(now-lastUi>1000){diagnostics.fps=(diagnostics.framesSinceUi||0)*1000/(now-lastUi);diagnostics.framesSinceUi=0;lastUi=now;}
  diagnostics.framesSinceUi=(diagnostics.framesSinceUi||0)+1;
 }catch(error){fail(error);}finally{rendering=false;}
}
// Explicit diagnostics read back only on request; the animation path never does.
window.coastLab = {
  locked: false, state, generateWorld,
  async moveTo(x,y){return this.exclusive(async()=>{state.cameraX=x;state.cameraY=y;await world.update(x,y);compute(0);await runtime.idle();});}, setWeather, worldPoint, renderScalars,
  async exclusive(fn) { this.locked = true; while (rendering || resizing) await new Promise(r => setTimeout(r, 20)); await runtime.idle(); try { return await fn(); } finally { this.locked = false; lastFrame = 0; dirty = true; } },
  async seek(time) { return this.exclusive(async () => { state.time = time; await world.update(state.cameraX,state.cameraY);compute(0); await runtime.idle(); }); },
  async inspect() { return this.exclusive(async () => {
    const values = await runtime.read(surface), flux = await runtime.read(photons, Uint32Array), terrain = await runtime.read(tiles);
    let terrainMin=Infinity,terrainMax=-Infinity;for(let i=0;i<513*513*4;i+=4){terrainMin=Math.min(terrainMin,terrain[i]);terrainMax=Math.max(terrainMax,terrain[i]);}
    let sum = 0, imaginary = 0, finite = true, maxSlope = 0;
    for (let i = 0; i < values.length; i += 4) { sum += values[i] ** 2; imaginary = Math.max(imaginary, Math.abs(values[i + 3])); maxSlope = Math.max(maxSlope, Math.abs(values[i + 1]), Math.abs(values[i + 2])); if (!Number.isFinite(values[i])) finite = false; }
    let fluxSum = 0, causticMax = 0, causticMin = Infinity; for (const f of flux) { fluxSum += f; causticMax = Math.max(causticMax, f / 4096); causticMin = Math.min(causticMin, f / 4096); }
    return { finite, heightRms: Math.sqrt(sum / (values.length / 4)), imaginaryResidual: imaginary, maxSlope, causticMax, causticMin, photonFluxRatio: fluxSum / (3 * 256 * 256 * 4096), terrainMin, terrainMax, stats: runtime.stats, adapter: runtime.describe() };
  }); },
  async pixels() { return this.exclusive(async () => Array.from(await runtime.read(shared.resource))); },
  async shore() { return this.exclusive(async () => Array.from(await runtime.read(shore))); },
  async advance(seconds, steps = 60) { return this.exclusive(async () => { for (let i=0;i<steps;i++) { state.time += seconds/steps; compute(seconds/steps); await runtime.idle(); } }); },
  async plants() { return this.exclusive(async()=>Array.from(await runtime.read(world.vegetation))); },
  async terrain() { return this.exclusive(async () => Array.from(await runtime.read(tiles))); },
  async shoreProbe(points) { return this.exclusive(async () => {
    const input=runtime.createBuffer(new Float32Array(points.flat())),output=runtime.createBuffer(points.length*16);
    try { runtime.batch().dispatch(kernels.shore_probe.bind({tiles,shore,points:input,output},{count:points.length,time:state.time,seaLevel:seaLevel()}),[Math.ceil(points.length/64),1,1]).submit();return Array.from(await runtime.read(output)); }finally{runtime.destroyBuffer(input);runtime.destroyBuffer(output);}
  }); },
  async probe(points) { return this.exclusive(async () => {
    const input = runtime.createBuffer(new Float32Array(points.flat())), output = runtime.createBuffer(points.length * 16);
    try { runtime.batch().dispatch(kernels.sample_probe.bind({ tiles, surface, points: input, output }, { count: points.length }), [Math.ceil(points.length / 64), 1, 1]).submit(); return Array.from(await runtime.read(output)); } finally { runtime.destroyBuffer(input); runtime.destroyBuffer(output); }
  }); },
  async fftTest() { return this.exclusive(async () => {
    const data = new Float32Array(128 * 128 * 2 * 2), modes = [[3, 5, .7, .2], [17, 9, -.3, .4], [0, 0, 1, 0]];
    const reverse = a => Number.parseInt((a & 127).toString(2).padStart(7, '0').split('').reverse().join(''), 2);
    for (const [x, y, re, im] of modes) data.set([re, im], (reverse(y) * 128 + reverse(x)) * 2);
    const a = runtime.createBuffer(data), b = runtime.createBuffer(data.byteLength);
    try { runtime.batch().dispatch(kernels.fft_local.bind({ input: a, output: b, twiddles }, { axis: 0 }), [128, 1, 2]).dispatch(kernels.fft_local.bind({ input: b, output: a, twiddles }, { axis: 1 }), [128, 1, 2]).submit(); const out = await runtime.read(a); let maxError = 0; for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) { let re = 0, im = 0; for (const [kx, ky, r, s] of modes) { const angle = 2 * Math.PI * (kx * x + ky * y) / 128; re += r * Math.cos(angle) - s * Math.sin(angle); im += r * Math.sin(angle) + s * Math.cos(angle); } const i = (y * 128 + x) * 2; maxError = Math.max(maxError, Math.abs(out[i] - re), Math.abs(out[i + 1] - im)); } return { maxError, samples: 16384, modes: modes.length }; } finally { runtime.destroyBuffer(a); runtime.destroyBuffer(b); }
  }); },
  async flatCausticsTest() { return this.exclusive(async () => {
    const flat = runtime.createBuffer(32768 * 16), flux = runtime.createBuffer(3 * 65536 * 4);
    try { runtime.batch().dispatch(kernels.caustic_trace.bind({ surface: flat, photons: flux }), [32, 32, 3]).submit(); const out = await runtime.read(flux, Uint32Array); let maxError = 0; for (const value of out) maxError = Math.max(maxError, Math.abs(value / 4096 - 1)); return { maxError }; } finally { runtime.destroyBuffer(flat); runtime.destroyBuffer(flux); }
  }); }
};


async function start() {
 const startupStart=performance.now();
 runtime=await GpuRuntime.create({backend:'webgpu',onError:fail});
 renderer=new THREE.WebGPURenderer({canvas,device:runtime.device,antialias:false,alpha:false});renderer.outputColorSpace=THREE.LinearSRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;await renderer.init();
 scene=new THREE.Scene();camera=new THREE.OrthographicCamera(-1,1,1,-1,0,2);camera.position.z=1;
 const manifest=await fetch('./kernels/manifest.json').then(r=>r.json());
 const shaderStart=performance.now();
 for(const name of manifest.entries)kernels[name]=await runtime.kernel(await fetch(`./kernels/${name}.json`).then(r=>r.json()));
 diagnostics.shaderPreparationMs=performance.now()-shaderStart;
 world=new TerrainWorld(runtime,kernels,seedNumber(state.worldSeed),diagnostics);tiles=world.tiles;shore=world.shore;
 vegetationAssets=await loadVegetation(runtime);diagnostics.vegetation={sprites:vegetationAssets.count,placement:'CUDA seeded clusters',shadows:'sun-projected sprite silhouettes'};
 seed=runtime.createBuffer(32768*16);twiddles=runtime.createBuffer(64*8);
 fftA=runtime.createBuffer(32768*8);fftB=runtime.createBuffer(32768*8);surface=runtime.createBuffer(32768*16);photons=runtime.createBuffer(3*65536*4);clouds=runtime.createBuffer((192*192+1)*16);ripples=runtime.createBuffer(rippleData);
 inv.shore=kernels.shore_step.bind({tiles,shore},{time:0,dt:0,seaLevel:0,reset:1});
 inv.seed=kernels.seed_modes.bind({seed,twiddles},{wind:state.wind});inv.spectrum=kernels.spectrum.bind({output:fftA,seed},{time:0,energy:1});
 inv.fftX=kernels.fft_local.bind({input:fftA,output:fftB,twiddles},{axis:0});inv.fftY=kernels.fft_local.bind({input:fftB,output:fftA,twiddles},{axis:1});
 inv.resolve=kernels.resolve.bind({input:fftA,surface});inv.clear=kernels.caustic_clear.bind({photons});inv.trace=kernels.caustic_trace.bind({surface,photons});
 inv.cloud=kernels.cloud_volume.bind({clouds},{time:0,cover:state.cover,daylight:1,sunX:0,sunY:0,sunZ:1,originX:0,originY:0});
 await dispatchTerrain();
 await resize();compute();await runtime.idle();diagnostics.ready=true;diagnostics.backend='WebCUDA + Three.js r186 / TSL';diagnostics.startupMs=performance.now()-startupStart;$('loading').classList.add('hidden');wake();requestAnimationFrame(frame);
}
start().catch(fail);


