import {chromium,devices} from 'playwright';
import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
await mkdir('reports',{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-webgpu']});
const report={date:new Date().toISOString(),checks:[],errors:[]};
const check=(name,ok,detail)=>{assert.ok(ok,`${name}: ${JSON.stringify(detail)}`);report.checks.push({name,detail});console.log('PASS '+name);};
const url=process.env.TEST_URL||'http://127.0.0.1:5218';
async function ready(page){page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});await page.goto(url+'/?seed=1847');await page.waitForFunction(()=>window.coastDiagnostics?.ready||window.coastDiagnostics?.errors.length,null,{timeout:120000});assert.deepEqual(await page.evaluate(()=>coastDiagnostics.errors),[]);await page.waitForTimeout(800);}
async function imageSample(page){return page.evaluate(async()=>{const p=await coastLab.pixels(),out=[];for(let i=0;i<p.length;i+=64)out.push(p[i],p[i+1],p[i+2]);return out;});}
const diff=(a,b)=>a.reduce((s,v,i)=>s+Math.abs(v-b[i]),0)/a.length;
async function worldStats(page){return page.evaluate(async()=>{
 const data=await coastLab.terrain(),side=513,count=side*side,bits=new Uint32Array(new Float32Array(data).buffer);let hash=2166136261,min=Infinity,max=-Infinity,water=0,land=0;
 for(let i=0;i<count;i++){const h=data[i*4];min=Math.min(min,h);max=Math.max(max,h);if(h>0)land++;else water++;for(let j=0;j<4;j++)hash=Math.imul(hash^bits[i*4+j],16777619);}
 const seen=new Uint8Array(count),queue=new Int32Array(count),areas=[];let widest=0;
 for(let i=0;i<count;i++){if(seen[i]||data[i*4]<=0)continue;let begin=0,end=1,lo=513,hi=0;queue[0]=i;seen[i]=1;while(begin<end){const q=queue[begin++],x=q%side,y=Math.floor(q/side);lo=Math.min(lo,x);hi=Math.max(hi,x);for(const n of [x>0?q-1:-1,x<512?q+1:-1,y>0?q-side:-1,y<512?q+side:-1])if(n>=0&&!seen[n]&&data[n*4]>0){seen[n]=1;queue[end++]=n;}}areas.push(end*144);widest=Math.max(widest,(hi-lo)*12);}
 areas.sort((a,b)=>b-a);return {hash:hash>>>0,min,max,landFraction:land/count,largestAreas:areas.slice(0,5),islands:areas.filter(a=>a>3000&&a<300000).length,widest,terrain:coastDiagnostics.terrain,generationMs:coastDiagnostics.terrainGenerationMs};
});}
try{
 const page=await browser.newPage({viewport:{width:1440,height:960}});await ready(page);
 const startup=await page.evaluate(()=>({shaderMs:coastDiagnostics.shaderPreparationMs,generationMs:coastDiagnostics.terrainGenerationMs,startupMs:coastDiagnostics.startupMs,read:coastDiagnostics.stats.readbackBytes}));
 check('Terrain generation and animation are GPU resident',startup.read===0,startup);
 await page.locator('#pause').click();await page.evaluate(()=>{coastLab.state.autoWeather=false;return coastLab.seek(12);});
 check('Scene contains no terrain editor controls',await page.locator('aside,input[type=range],[data-tool],#settings').count()===0);
 await page.screenshot({path:'reports/tropical-islands.png'});await page.evaluate(()=>coastLab.moveTo(0,0));
 const initial=await worldStats(page);check('Large tropical islands have low interiors and offshore islets',initial.widest>1600&&initial.largestAreas[0]>1e6&&initial.islands>=2&&initial.max<3.7&&initial.max>2,initial);
 check('Terrain contains no elevated waterways',await page.evaluate(async()=>{const a=await coastLab.terrain();for(let i=0;i<513*513;i++)if(a[i*4+1]||a[i*4+2]||a[i*4+3])return false;return true;}));
 await page.screenshot({path:'reports/terrain-mainland.png'});
 const waterBefore=await imageSample(page);await page.evaluate(()=>coastLab.seek(13));check('Tropical water animates',diff(waterBefore,await imageSample(page))>.0001);
 await page.evaluate(()=>coastLab.generateWorld('1847'));await page.evaluate(()=>coastLab.moveTo(0,0));const repeat=await worldStats(page);check('Same seed exactly reproduces tropical islands',repeat.hash===initial.hash,[initial.hash,repeat.hash]);
 await page.evaluate(()=>coastLab.generateWorld('642498203'));await page.evaluate(()=>coastLab.moveTo(0,0));const other=await worldStats(page);check('Different seeds produce different geography',other.hash!==initial.hash&&other.max<3.7&&other.max>2,other);
 await page.locator('#world-seed').click();await page.locator('#seed-input').fill('1847');await page.getByRole('button',{name:'Create world',exact:true}).click();await page.waitForFunction(()=>coastLab.state.worldSeed==='1847'&&!document.querySelector('#world-seed').disabled);
 await page.evaluate(()=>coastLab.moveTo(0,0));check('Seed control recreates a shareable seeded URL',new URL(page.url()).searchParams.get('seed')==='1847'&&(await worldStats(page)).hash===initial.hash);
 const probePoints=[[-800.25,-500.75,0,0],[-400.5,-200.25,0,0],[700.25,300.5,0,0],[1200.5,400.25,0,0]];
 const beforeMove=await page.evaluate(p=>coastLab.probe(p),probePoints);await page.evaluate(()=>coastLab.advance(12,80));
 const wetRecord=await page.evaluate(async()=>{const a=await coastLab.shore();for(let y=100;y<410;y++)for(let x=150;x<450;x++){const i=(y*512+x)*4;if(a[i]>.3&&a[i+3]<.3)return {x:(x+.5-256)*12,y:(y+.5-256)*12,wet:a[i],high:a[i+2]};}return null;});
 await page.evaluate(()=>coastLab.moveTo(1600,0));const afterMove=await page.evaluate(p=>coastLab.probe(p),probePoints);let seamError=0;for(let i=0;i<beforeMove.length;i+=4)seamError=Math.max(seamError,Math.abs(beforeMove[i]-afterMove[i]));
 check('Overlapping terrain is identical when the cache recentres',seamError<.003,seamError);
 const wetAfter=wetRecord&&await page.evaluate(async p=>{const a=await coastLab.shore(),origin=coastDiagnostics.terrain.origin,x=Math.round((p.x-origin[0])/12+255.5),y=Math.round((p.y-origin[1])/12+255.5),i=(y*512+x)*4;return {wet:a[i],high:a[i+2]};},wetRecord);
 check('Wetness stays at the same world position while streaming',wetRecord&&Math.abs(wetRecord.wet-wetAfter.wet)<.002&&Math.abs(wetRecord.high-wetAfter.high)<.002,{before:wetRecord,after:wetAfter});
 const timings=[];for(const [x,y] of [[6400,0],[13000,6500],[-12500,7000],[64000,-32000],[-98000,66000],[1600,0]]){await page.evaluate(p=>coastLab.moveTo(...p),[x,y]);timings.push(await page.evaluate(()=>({camera:[coastLab.state.cameraX,coastLab.state.cameraY],...coastDiagnostics.terrain,ms:coastDiagnostics.terrainGenerationMs})));}
 check('Scrolling streams far beyond the original world in both directions',timings.some(t=>t.camera[0]===64000)&&timings.some(t=>t.camera[0]===-98000)&&timings.every(t=>t.cachedWindows===1&&t.bufferBytes<16e6),timings);
 const back=await page.evaluate(p=>coastLab.probe(p),probePoints);let returnError=0;for(let i=0;i<back.length;i+=4)returnError=Math.max(returnError,Math.abs(back[i]-beforeMove[i]));check('Distant islands regenerate consistently when revisited',returnError<.003,returnError);
 await page.evaluate(()=>{coastLab.state.viewHeight=1000;return coastLab.moveTo(5700,-400);});await page.screenshot({path:'reports/terrain-streamed-region.png'});
 const boundaries=[];for(const x of [3060,3072,3084,6132,6144]){await page.evaluate(x=>coastLab.moveTo(x,0),x);const p=await page.evaluate(x=>coastLab.probe([[x-.05,30,0,0],[x+.05,30,0,0]]),x);boundaries.push(Math.abs(p[0]-p[4]));}
 check('Seeded regions meet without height discontinuities',Math.max(...boundaries)<.02,boundaries);
 await page.locator('#home').click();await page.evaluate(()=>coastLab.seek(12));const gpu=await page.evaluate(()=>coastLab.inspect()),fft=await page.evaluate(()=>coastLab.fftTest()),flat=await page.evaluate(()=>coastLab.flatCausticsTest());
 check('Spectral ocean remains finite and matches analytical FFT',gpu.finite&&gpu.imaginaryResidual<1e-5&&fft.maxError<1e-5,{fft,imaginary:gpu.imaginaryResidual});check('Photon flux and flat-water irradiance remain correct',Math.abs(gpu.photonFluxRatio-1)<.001&&flat.maxError<1e-5,{flux:gpu.photonFluxRatio,flat});
 const cameraBefore=await page.evaluate(()=>coastLab.state.cameraX);await page.mouse.move(600,500);await page.mouse.down();await page.mouse.move(880,550,{steps:8});await page.mouse.up();check('Drag pans the unbounded map',await page.evaluate(x=>coastLab.state.cameraX!==x,cameraBefore));const zoomBefore=await page.evaluate(()=>coastLab.state.viewHeight);await page.mouse.wheel(0,-300);await page.waitForTimeout(150);check('Wheel zoom retains the flat isometric camera',await page.evaluate(h=>coastLab.state.viewHeight<h,zoomBefore));
 await page.locator('#home').click();await page.locator('#pause').click();const start=await page.evaluate(()=>({frames:coastDiagnostics.frames,read:coastDiagnostics.stats.readbackBytes}));await page.waitForTimeout(2500);const end=await page.evaluate(()=>({frames:coastDiagnostics.frames,read:coastDiagnostics.stats.readbackBytes,fps:coastDiagnostics.fps}));check('Streaming scene animates without frame readback',end.frames-start.frames>20&&end.read===start.read,{frames:end.frames-start.frames,seconds:2.5,fps:end.fps});await page.locator('#pause').click();const time=await page.evaluate(()=>coastLab.state.time);await page.waitForTimeout(150);check('Pause freezes simulation',await page.evaluate(t=>coastLab.state.time===t,time));
 await page.close();const mobileContext=await browser.newContext({...devices['Pixel 7']}),phone=await mobileContext.newPage();await ready(phone);check('Mobile uses a bounded pixel-art framebuffer',await phone.evaluate(()=>coastDiagnostics.width<=240&&coastDiagnostics.height<=440));const cdp=await mobileContext.newCDPSession(phone),phoneX=await phone.evaluate(()=>coastLab.state.cameraX);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:130,y:400}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:250,y:450}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});check('Touch panning streams terrain',await phone.evaluate(x=>coastLab.state.cameraX!==x,phoneX));await phone.locator('#world-seed').click();check('Seed control is usable on mobile',await phone.locator('#seed-input').isVisible());await phone.locator('#seed-cancel').click();await phone.screenshot({path:'reports/terrain-mobile.png'});await mobileContext.close();
 check('No browser or GPU errors',report.errors.length===0,report.errors);await writeFile('reports/validation.json',JSON.stringify(report,null,2));console.log(`${report.checks.length} checks passed.`);
}catch(error){await writeFile('reports/validation-failure.json',JSON.stringify({...report,failure:error.message},null,2));throw error;}finally{await browser.close();}

