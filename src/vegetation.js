// Decode/upload the authored atlas once. Placement, compositing and sun shadows
// remain CUDA kernels; no CPU geometry generation or animation readback.
export async function loadVegetation(runtime) {
 const root='./assets/tropical/';
 const manifest=await fetch(root+'vegetation-atlas-v1.json').then(r=>r.json());
 const response=await fetch(root+manifest.image);if(!response.ok)throw Error('Vegetation atlas could not be loaded');
 const bitmap=await createImageBitmap(await response.blob(),{premultiplyAlpha:'none',colorSpaceConversion:'none'});
 const canvas=new OffscreenCanvas(bitmap.width,bitmap.height),context=canvas.getContext('2d',{willReadFrequently:true});
 context.drawImage(bitmap,0,0);const pixels=context.getImageData(0,0,bitmap.width,bitmap.height).data;
 const atlas=runtime.createBuffer(new Uint32Array(pixels.buffer));
 const records=new Float32Array(12*8);
 manifest.sprites.forEach((sprite,i)=>{const r=sprite.rect;records.set([r.x,r.y,r.width,r.height,...sprite.anchorPixels,sprite.suggestedHeightMetres,0],i*8);});
 const metadata=runtime.createBuffer(records);bitmap.close();
 return {atlas,metadata,width:canvas.width,height:canvas.height,count:manifest.sprites.length};
}
