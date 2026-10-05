import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-webgpu']});
const page=await browser.newPage({viewport:{width:1440,height:960}}),checks=[],errors=[];
page.on('pageerror',e=>errors.push(e.message));
const check=(name,ok,detail)=>{assert.ok(ok,`${name}: ${JSON.stringify(detail)}`);checks.push({name,detail});console.log('PASS '+name);};
const pixels=()=>page.evaluate(()=>coastLab.pixels());
const difference=(a,b)=>{let count=0;for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>.015)count++;return count;};
try{
 await page.goto((process.env.TEST_URL||'http://127.0.0.1:5218')+'/?seed=642498203');await page.waitForFunction(()=>coastDiagnostics?.ready||coastDiagnostics?.errors.length,null,{timeout:120000});
 assert.deepEqual(await page.evaluate(()=>coastDiagnostics.errors),[]);
 await page.evaluate(()=>{coastLab.state.paused=true;coastLab.state.autoWeather=false;return coastLab.seek(12);});
 const original=await page.evaluate(()=>coastLab.plants()),plants=[];for(let i=0;i<384*384*4;i+=4)if(original[i+3]>0)plants.push(original.slice(i,i+4));
 const species=[...new Set(plants.map(p=>p[3]))];check('All twelve authored vegetation variants are placed',species.length===12,{plants:plants.length,species});
 const heights=await page.evaluate(p=>coastLab.probe(p.map(p=>[p[0],p[1],0,0])),plants);let min=Infinity;for(let i=0;i<heights.length;i+=4)min=Math.min(min,heights[i]);check('Vegetation roots stay behind the grassy beach margin',min>1.41,min);
 const on=await pixels();await page.evaluate(()=>{coastLab.state.vegetation=false;return coastLab.seek(12);});const off=await pixels();check('Authored sprites and shadows visibly contribute to the scene',difference(on,off)>500,difference(on,off));
 await page.evaluate(()=>{coastLab.state.vegetation=true;return coastLab.seek(12);});await page.screenshot({path:'reports/vegetation-coast.png'});
 // Compare only shadow contributions by toggling them at fixed time and light.
 const masks=[];for(const hour of [10,17.4]){
  await page.evaluate(hour=>{coastLab.state.hour=hour;coastLab.state.vegetationShadows=false;return coastLab.seek(12);},hour);const bare=await pixels();
  await page.evaluate(()=>{coastLab.state.vegetationShadows=true;return coastLab.seek(12);});const shaded=await pixels(),mask=[];
  for(let i=0;i<bare.length;i+=4)mask.push(bare[i]+bare[i+1]+bare[i+2]-shaded[i]-shaded[i+1]-shaded[i+2]>.015?1:0);
  masks.push(mask);await page.screenshot({path:`reports/vegetation-${hour===10?'morning':'golden'}.png`});
 }
 const areas=masks.map(m=>m.reduce((s,v)=>s+v,0)),moved=masks[0].reduce((s,v,i)=>s+(v!==masks[1][i]?1:0),0);
 check('Sun movement changes live ground shadows',areas.every(a=>a>40)&&moved>100,{areas,moved});
 check('Lower sun lengthens shadows',areas[1]>areas[0]*1.2,areas);
 await page.evaluate(()=>{coastLab.state.hour=14.8;return coastLab.seek(12);});const calm=await pixels();await page.evaluate(()=>coastLab.seek(13));check('Wind animates the vegetation presentation',difference(calm,await pixels())>100);
 const before=plants.filter(p=>p[0]>-1000&&p[0]<0&&p[1]>-800&&p[1]<500);
 await page.evaluate(()=>coastLab.moveTo(0,0));const after=await page.evaluate(()=>coastLab.plants());const map=new Map();for(let i=0;i<384*384*4;i+=4)if(after[i+3])map.set(`${after[i]},${after[i+1]}`,after.slice(i,i+4));
 check('Streaming preserves species, root positions and heights',before.length>0&&before.every(p=>JSON.stringify(map.get(`${p[0]},${p[1]}`))===JSON.stringify(p)),{compared:before.length});
 await page.evaluate(()=>coastLab.moveTo(64000,-32000));await page.evaluate(()=>coastLab.moveTo(-1430,-1080));const restored=await page.evaluate(()=>coastLab.plants());check('Returning from distant islands restores vegetation exactly',original.every((v,i)=>v===restored[i]));
 const stats=await page.evaluate(()=>({read:coastDiagnostics.stats.readbackBytes,frames:coastDiagnostics.frames}));await page.evaluate(()=>{coastLab.state.paused=false;});await page.waitForTimeout(1800);const end=await page.evaluate(()=>({read:coastDiagnostics.stats.readbackBytes,frames:coastDiagnostics.frames,fps:coastDiagnostics.fps}));check('Vegetation animates without GPU readback',stats.read===end.read&&end.frames>stats.frames+20,end);
 check('No browser or GPU errors',errors.length===0&&await page.evaluate(()=>coastDiagnostics.errors.length===0),errors);
 await writeFile('reports/vegetation-validation.json',JSON.stringify({checks,errors},null,2));
}finally{await browser.close();}
