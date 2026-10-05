// Host-side resources only. Tropical terrain and wetness transfer run in CUDA.
// One moving window keeps memory independent of travel distance.
export class TerrainWorld {
 constructor(runtime,kernels,seed,diagnostics){
  this.runtime=runtime;this.seed=seed;this.diagnostics=diagnostics;this.origin=null;
  this.tiles=runtime.createBuffer((513*513+1)*16);
  this.vegetation=runtime.createBuffer((384*384+1)*16);
  this.plant=kernels.vegetation_seed.bind({tiles:this.tiles,plants:this.vegetation});
  this.shore=runtime.createBuffer((512*512+1)*16);this.spareShore=runtime.createBuffer((512*512+1)*16);
  this.seedInvocation=kernels.terrain_seed.bind({tiles:this.tiles},{worldSeed:seed,originX:0,originY:0});
  this.shift=kernels.shore_recenter.bind({previous:this.shore,output:this.spareShore},{originX:0,originY:0});
  this.copy=kernels.shore_copy.bind({input:this.spareShore,output:this.shore});
 }
 async setSeed(seed){await this.runtime.idle();this.seed=seed;this.origin=null;}
 async update(x,y){
  const originX=Math.round(x/1536)*1536,originY=Math.round(y/1536)*1536;
  if(this.origin?.[0]===originX&&this.origin?.[1]===originY)return false;
  const start=performance.now(),batch=this.runtime.batch({label:'Stream seeded tropical islands'});
  batch.dispatch(this.seedInvocation.setScalars({worldSeed:this.seed,originX,originY}),[65,65,1]).dispatch(this.plant,[48,48,1]);
  if(this.origin)batch.dispatch(this.shift.setScalars({originX,originY}),[64,64,1]).dispatch(this.copy,[64,64,1]);
  batch.submit();await this.runtime.idle();this.origin=[originX,originY];
  this.diagnostics.terrainGenerationMs=performance.now()-start;
  this.diagnostics.terrain={origin:[originX,originY],extentMetres:6144,cellMetres:12,cachedWindows:1,bufferBytes:(513*513+1)*16+2*(512*512+1)*16+(384*384+1)*16,updates:(this.diagnostics.terrain?.updates||0)+1};
  return true;
 }
}
