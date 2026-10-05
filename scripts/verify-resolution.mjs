import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-webgpu']});
const page=await browser.newPage({viewport:{width:1440,height:810}}),checks=[],errors=[];
page.on('pageerror',e=>errors.push(e.message));
const url=process.env.TEST_URL||'http://127.0.0.1:5218/';
try{
 await page.goto(url);await page.waitForFunction(()=>coastDiagnostics?.ready||coastDiagnostics?.errors.length,null,{timeout:120000});assert.deepEqual(await page.evaluate(()=>coastDiagnostics.errors),[]);
 await page.locator('#pause').click();const before=await page.evaluate(()=>({x:coastLab.state.cameraX,y:coastLab.state.cameraY,height:coastLab.state.viewHeight,time:coastLab.state.time}));
 for(const [value,width,height] of [['720',1280,720],['1080',1920,1080],['1440',2560,1440],['2160',3840,2160]]){
  await page.locator('#resolution').selectOption(value);await page.waitForFunction(([w,h])=>coastDiagnostics.width===w&&coastDiagnostics.height===h&&coastDiagnostics.camera[2]===coastLab.state.viewHeight,[width,height],{timeout:120000});
  await page.waitForTimeout(250);assert.deepEqual(await page.evaluate(()=>coastDiagnostics.errors),[]);
  const actual=await page.evaluate(()=>({width:document.querySelector('canvas').width,height:document.querySelector('canvas').height,read:coastDiagnostics.stats.readbackBytes}));assert.equal(actual.width,width);assert.equal(actual.height,height);assert.equal(actual.read,0);checks.push({preset:value,...actual});console.log('PASS',value,actual);
 }
 await page.screenshot({path:'reports/resolution-4k.png'});
 assert.deepEqual(await page.evaluate(()=>({x:coastLab.state.cameraX,y:coastLab.state.cameraY,height:coastLab.state.viewHeight,time:coastLab.state.time})),before);
 await page.reload();await page.waitForFunction(()=>coastDiagnostics?.ready||coastDiagnostics?.errors.length,null,{timeout:120000});assert.equal(await page.locator('#resolution').inputValue(),'2160');assert.equal(await page.evaluate(()=>coastDiagnostics.width),3840);console.log('PASS persisted 4K preference');
 await page.locator('#pause').click();await page.setViewportSize({width:810,height:1440});await page.waitForFunction(()=>coastDiagnostics.width===2160&&coastDiagnostics.height===3840,null,{timeout:120000});console.log('PASS portrait 4K');
 await page.locator('#resolution').selectOption('pixel');await page.waitForFunction(()=>coastDiagnostics.width<=480&&coastDiagnostics.height<=360,null,{timeout:120000});console.log('PASS return to pixel mode');
 assert.deepEqual(await page.evaluate(()=>coastDiagnostics.errors),[]);assert.deepEqual(errors,[]);await writeFile('reports/resolution-validation.json',JSON.stringify({checks,persistence:true,portrait:true,pixelFallback:true,errors},null,2));
}finally{await browser.close();}
