// ClearWater2D. Authored CUDA -> CUDA WebShader compiler -> WebGPU.
// World units are metres. Seeded tropical terrain streams through a moving 6144-metre cache.
__device__ float sat(float x){return fminf(1,fmaxf(0,x));}
__device__ float lerp(float a,float b,float t){return a+(b-a)*t;}
__device__ float frac(float x){return x-floorf(x);}
__device__ float smooth(float a,float b,float x){float t=sat((x-a)/(b-a));return t*t*(3-2*t);}
__device__ float3 rgb(float x,float y,float z){return make_float3(x,y,z);}
__device__ float3 add(float3 a,float3 b){return rgb(a.x+b.x,a.y+b.y,a.z+b.z);}
__device__ float3 mul(float3 a,float b){return rgb(a.x*b,a.y*b,a.z*b);}
__device__ float3 blend(float3 a,float3 b,float t){return add(mul(a,1-t),mul(b,t));}
__device__ unsigned hash(unsigned a){a^=a>>16;a*=2246822519u;a^=a>>13;a*=3266489917u;a^=a>>16;return a;}
__device__ float rnd(unsigned a){return ((float)(hash(a)&16777215u)+.5f)/16777216.0f;}
__device__ float cell(int x,int y){return rnd((unsigned)(x*92837111+y*689287499+7919));}
__device__ float noise(float x,float y){int ix=(int)floorf(x),iy=(int)floorf(y);float a=frac(x),b=frac(y);a=a*a*(3-2*a);b=b*b*(3-2*b);return lerp(lerp(cell(ix,iy),cell(ix+1,iy),a),lerp(cell(ix,iy+1),cell(ix+1,iy+1),a),b);}
__device__ float fbm(float x,float y){return noise(x,y)*.56f+noise(x*2.03f+8,y*2.03f)*.28f+noise(x*4.07f,y*4.07f+7)*.16f;}
__device__ float noise3(float x,float y,float z){float iz=floorf(z),f=frac(z);f=f*f*(3-2*f);return lerp(noise(x+iz*17.1f,y+iz*9.2f),noise(x+(iz+1)*17.1f,y+(iz+1)*9.2f),f);}
__device__ float length2(float x,float y){return sqrtf(x*x+y*y);}
__device__ float island(float x,float y,float cx,float cy,float rx,float ry){float a=(x-cx)/rx,b=(y-cy)/ry;return expf(-(a*a+b*b)*1.8f);}
__device__ float smoothMax(float a,float b,float k){float t=sat(.5f+.5f*(a-b)/k);return lerp(b,a,t)+k*t*(1-t);}
__device__ float seedRand(unsigned seed,int id){return rnd(seed^(unsigned)(id*747796405+289133645));}
__device__ float2 massCenter(unsigned seed,int mass){return make_float2((mass==0?-78.0f:94.0f)+(seedRand(seed,mass*7+2)-.5f)*38,(mass==0?-48.0f:68.0f)+(seedRand(seed,mass*7+3)-.5f)*36);}
__device__ float elevation(float x,float y,unsigned seed){
 float ox=seedRand(seed,90)*1700,oy=seedRand(seed,91)*1700;
 float wx=x+(fbm(x*.018f+ox,y*.018f+oy)-.5f)*24,wy=y+(fbm(x*.019f+oy+31,y*.019f+ox)-.5f)*24;
 float shape=0;
 for(int m=0;m<2;m++){
  float2 c=massCenter(seed,m);float angle=seedRand(seed,m*7+4)*2.6f,cs=cosf(angle),sn=sinf(angle),dx=wx-c.x,dy=wy-c.y;
  float u=dx*cs+dy*sn,v=-dx*sn+dy*cs,rx=78+seedRand(seed,m*7+5)*25,ry=63+seedRand(seed,m*7+6)*25;
  float land=island(u,v,0,0,rx,ry)*23+island(u,v,rx*.55f,ry*.20f,rx*.60f,ry*.57f)*12;
  land+=island(u,v,-rx*.65f,ry*.38f,rx*.51f,ry*.60f)*(9+seedRand(seed,m+155)*6);
  land-=island(u,v,rx*.35f,-ry*.62f,rx*.36f,ry*.47f)*(8+seedRand(seed,m+160)*6);
  land-=island(u,v,-rx*.35f,ry*.78f,rx*.30f,ry*.37f)*9;
  shape=smoothMax(shape,land,1.4f);
 }
 // Separate smaller island groups occupy the outer shelf around the larger tropical islands.
 for(int i=0;i<9;i++){
  float a=(float)i*.6981317f+(seedRand(seed,40+i)-.5f)*.35f,r=158+seedRand(seed,60+i)*65;
  float cx=cosf(a)*r,cy=sinf(a)*r,rx=12+seedRand(seed,70+i)*17,ry=10+seedRand(seed,80+i)*13;
  shape=smoothMax(shape,island(wx,wy,cx,cy,rx,ry)*(9+seedRand(seed,100+i)*5),.8f);
 }
 float base=shape-6.3f+(fbm(wx*.040f+ox,wy*.040f+oy)-.5f)*4.5f;
 // Low coastal terrain: broad sand shelves and gently raised island interiors.
 // Compress positive heights without shrinking the kilometre-scale coastline.
 return base>0?3.6f*(1-expf(-base*.15f)):-powf(-base,1.7f)*.45f;
}
__device__ unsigned regionSeed(unsigned seed,int x,int y){if(x==0&&y==0)return seed;return hash(seed^(unsigned)(x*92837111)^(unsigned)(y*689287499))&16777215u;}
__device__ float worldElevation(float x,float y,unsigned seed){
 int rx=(int)floorf((x+256)/512),ry=(int)floorf((y+256)/512);
 float ocean=-31-fbm(x*.0204f+83,y*.0204f+19)*3,h=ocean;
 for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){
  int cx=rx+i,cy=ry+j;float lx=x-(float)cx*512,ly=y-(float)cy*512;
  if(fmaxf(fabsf(lx),fabsf(ly))>300)continue;
  float raw=elevation(lx,ly,regionSeed(seed,cx,cy)),height=raw;
  h=fmaxf(h,lerp(ocean,height,smooth(-10,-5,raw)));
 }return h;
}
__global__ void terrain_seed(float4 *tiles,unsigned worldSeed,float originX,float originY){
 int x=blockIdx.x*8+threadIdx.x,y=blockIdx.y*8+threadIdx.y;if(x>=513||y>=513)return;
 float h=worldElevation((float)x-256+originX/12,(float)y-256+originY/12,worldSeed);tiles[y*513+x]=make_float4(h,0,0,0);
 if(x==0&&y==0)tiles[263169]=make_float4(originX,originY,(float)worldSeed,0);
}
__device__ float4 cubicWeights(float t){float s=1-t;return make_float4(s*s*s/6,(3*t*t*t-6*t*t+4)/6,(-3*t*t*t+3*t*t+3*t+1)/6,t*t*t/6);}
// Rendering samples cached fields only. The expensive seeded generator is
// compiled only into terrain_seed, never into the per-frame water pipelines.
__device__ float4 terrainField(const float4 *tiles,float x,float y){
 float4 meta=tiles[263169];float u=(x-meta.x)/12+256,v=(y-meta.y)/12+256,edge=fmaxf(fabsf(x-meta.x),fabsf(y-meta.y));
 float ocean=-31-fbm(x*.0017f+83,y*.0017f+19)*3;
 if(edge>=3060)return make_float4(ocean,0,0,0);
 int ix=(int)floorf(u),iy=(int)floorf(v);float4 a=cubicWeights(frac(u)),b=cubicWeights(frac(v));float h=0;
 for(int j=0;j<4;j++){float wy=j==0?b.x:j==1?b.y:j==2?b.z:b.w;
  for(int k=0;k<4;k++){float wx=k==0?a.x:k==1?a.y:k==2?a.z:a.w;float4 p=tiles[(iy+j-1)*513+ix+k-1];float w=wx*wy;h+=p.x*w;}}
 if(edge>3036)h=lerp(h,ocean,smooth(3036,3060,edge));return make_float4(h,0,0,0);
}
__device__ float ground(const float4 *tiles,float x,float y){return terrainField(tiles,x,y).x;}
__device__ int reverse7(int a){int b=0;for(int i=0;i<7;i++){b=b*2+(a&1);a=a>>1;}return b;}
__device__ float patch(int c){return c==0?48.0f:9.0f;}
__device__ float2 cmul(float2 a,float2 b){return make_float2(a.x*b.x-a.y*b.y,a.x*b.y+a.y*b.x);}
__device__ float2 initial(int x,int y,int c,float wind){
 int fx=x<64?x:x-128,fy=y<64?y:y-128;float kx=6.2831853f*(float)fx/patch(c),ky=6.2831853f*(float)fy/patch(c),kk=kx*kx+ky*ky;if(kk<.00001f)return make_float2(0,0);
 float alignment=(kx*.8f+ky*.6f)*(kx*.8f+ky*.6f)/kk,L=wind*wind/9.81f;
 float P=expf(-1/(kk*L*L))*expf(-kk*.009f)/(kk*kk)*(.15f+.85f*alignment),band=c==1?1-expf(-kk*1.5f):expf(-kk*.4f);
 unsigned id=(unsigned)(c*16384+y*128+x+17);float r=sqrtf(-2*logf(fmaxf(.000001f,rnd(id*2u)))),a=6.2831853f*rnd(id*2u+1u),amp=sqrtf(P*band)*.024f*6.2831853f/patch(c);
 return make_float2(r*cosf(a)*amp,r*sinf(a)*amp);
}
__global__ void seed_modes(float4 *seed,float2 *twiddles,float wind){int x=blockIdx.x*8+threadIdx.x,y=blockIdx.y*8+threadIdx.y,c=blockIdx.z;if(x>=128||y>=128||c>=2)return;if(c==0&&y==0&&x<64){float a=6.2831853f*(float)x/128;twiddles[x]=make_float2(cosf(a),sinf(a));}float2 a=initial(x,y,c,wind),b=initial((-x)&127,(-y)&127,c,wind);seed[c*16384+y*128+x]=make_float4(a.x,a.y,b.x,b.y);}
__global__ void spectrum(float2 *output,const float4 *seed,float time,float energy){
 int x=blockIdx.x*8+threadIdx.x,y=blockIdx.y*8+threadIdx.y,c=blockIdx.z;if(x>=128||y>=128||c>=2)return;int fx=x<64?x:x-128,fy=y<64?y:y-128;
 float k=6.2831853f*sqrtf((float)(fx*fx+fy*fy))/patch(c),phase=sqrtf(9.81f*k)*time;float4 h=seed[c*16384+y*128+x];float2 a=cmul(make_float2(h.x,h.y),make_float2(cosf(phase),sinf(phase))),b=cmul(make_float2(h.z,-h.w),make_float2(cosf(phase),-sinf(phase)));
 output[c*16384+reverse7(y)*128+reverse7(x)]=make_float2((a.x+b.x)*energy,(a.y+b.y)*energy);
}
// Adapted from ClearWater6.1: 64 lanes transform a 128-value row/column.
__global__ void fft_local(const float2 *input,float2 *output,const float2 *twiddles,int axis){
 __shared__ float2 values[128];__shared__ float2 rotation[64];int lane=threadIdx.x,line=blockIdx.x,base=blockIdx.z*16384;
 int first=axis==0?base+line*128+lane:base+lane*128+line,second=axis==0?first+64:first+8192;
 values[lane]=input[first];values[lane+64]=input[second];rotation[lane]=twiddles[lane];__syncthreads();
 for(int span=2;span<=128;span*=2){int half=span/2,j=lane&(half-1),a=(lane/half)*span+j,b=a+half;float2 left=values[a],right=cmul(values[b],rotation[j*(128/span)]);values[a]=make_float2(left.x+right.x,left.y+right.y);values[b]=make_float2(left.x-right.x,left.y-right.y);__syncthreads();}
 output[first]=values[lane];output[second]=values[lane+64];
}
__global__ void resolve(const float2 *input,float4 *surface){int x=blockIdx.x*8+threadIdx.x,y=blockIdx.y*8+threadIdx.y,c=blockIdx.z;if(x>=128||y>=128||c>=2)return;int base=c*16384,i=base+y*128+x;float d=patch(c)/128;surface[i]=make_float4(input[i].x,(input[base+y*128+((x+1)&127)].x-input[base+y*128+((x-1)&127)].x)/(2*d),(input[base+((y+1)&127)*128+x].x-input[base+((y-1)&127)*128+x].x)/(2*d),input[i].y);}
__device__ float4 waves(const float4 *s,float x,float y,int c){float u=x*128/patch(c),v=y*128/patch(c);int ix=(int)floorf(u),iy=(int)floorf(v),b=c*16384;float a=frac(u),d=frac(v);float4 p=s[b+(iy&127)*128+(ix&127)],q=s[b+(iy&127)*128+((ix+1)&127)],r=s[b+((iy+1)&127)*128+(ix&127)],t=s[b+((iy+1)&127)*128+((ix+1)&127)];return make_float4(lerp(lerp(p.x,q.x,a),lerp(r.x,t.x,a),d),lerp(lerp(p.y,q.y,a),lerp(r.y,t.y,a),d),lerp(lerp(p.z,q.z,a),lerp(r.z,t.z,a),d),0);}
__device__ float shorePhase(float x,float y,float h,float time,float seaLevel){return (h-seaLevel)*7.2f-time*1.45f+noise(x*.09f,y*.09f)*1.5f;}
__device__ float waterline(float x,float y,float h,float time,float seaLevel){// Run-up is a level, not a function of bed elevation. Depending on h here
 // made the coverage function non-monotone and created detached wet bands.
 float p=shorePhase(x,y,seaLevel,time,seaLevel);return seaLevel+(.035f+.20f*sinf(p)+.045f*sinf(2*p-.5f))*(1-smooth(.25f,1.5f,seaLevel));}
// Persistent wetness/foam, one independent record per metre of terrain.
// Carry persistent wetness with its world coordinates when the cache moves.
__global__ void shore_recenter(const float4 *previous,float4 *output,float originX,float originY){
 int x=blockIdx.x*8+threadIdx.x,y=blockIdx.y*8+threadIdx.y;if(x>=512||y>=512)return;float4 old=previous[262144];
 int ox=x+(int)((originX-old.x)/12),oy=y+(int)((originY-old.y)/12);
 output[y*512+x]=(ox>=0&&oy>=0&&ox<512&&oy<512)?previous[oy*512+ox]:make_float4(0,0,-10000,0);
 if(x==0&&y==0)output[262144]=make_float4(originX,originY,0,0);
}
__global__ void shore_copy(const float4 *input,float4 *output){int x=blockIdx.x*8+threadIdx.x,y=blockIdx.y*8+threadIdx.y;if(x>=512||y>=512)return;output[y*512+x]=input[y*512+x];if(x==0&&y==0)output[262144]=input[262144];}
__global__ void shore_step(const float4 *tiles,float4 *shore,float time,float dt,float seaLevel,int reset){
 int ix=blockIdx.x*8+threadIdx.x,iy=blockIdx.y*8+threadIdx.y;if(ix>=512||iy>=512)return;float4 meta=tiles[263169];float x=((float)ix+.5f-256)*12+meta.x,y=((float)iy+.5f-256)*12+meta.y;float4 field=terrainField(tiles,x,y);float waterBase=seaLevel;float h=field.x,d=waterBase-h,level=waterline(x,y,h,time,waterBase);
 float cover=smooth(-.025f,.025f,level-h),phase=shorePhase(x,y,h,time,waterBase);
 float breaker=powf(sat(sinf(phase)),10)*smooth(-.12f,.07f,d)*(1-smooth(.15f,.9f,d));
 float swash=cover*(1-smooth(.02f,.23f,d))*smooth(-.25f,-.04f,d);
 float4 previous=shore[iy*512+ix];float wet=reset!=0?cover:fmaxf(cover,previous.x*expf(-dt*.055f));float foam=reset!=0?breaker:fmaxf(breaker+swash*.40f,previous.y*expf(-dt*1.25f));
 float highWater=reset!=0?level:fmaxf(level,previous.z-dt*.008f);
 shore[iy*512+ix]=make_float4(wet,sat(foam),highWater,cover);if(ix==0&&iy==0)shore[262144]=meta;
}
__device__ float4 shoreline(const float4 *shore,float x,float y,float h,float time,float seaLevel){
 float4 meta=shore[262144];if(fmaxf(fabsf(x-meta.x),fabsf(y-meta.y))>3066.0f)return make_float4(smooth(-.03f,.03f,seaLevel+.18f-h),0,waterline(x,y,h,time,seaLevel),0);
 float u=(x-meta.x)/12+256-.5f,v=(y-meta.y)/12+256-.5f;int ix=(int)floorf(u),iy=(int)floorf(v);float a=frac(u),b=frac(v);float4 p=shore[iy*512+ix],q=shore[iy*512+ix+1],r=shore[(iy+1)*512+ix],t=shore[(iy+1)*512+ix+1];
 return make_float4(lerp(lerp(p.x,q.x,a),lerp(r.x,t.x,a),b),lerp(lerp(p.y,q.y,a),lerp(r.y,t.y,a),b),lerp(lerp(p.z,q.z,a),lerp(r.z,t.z,a),b),lerp(lerp(p.w,q.w,a),lerp(r.w,t.w,a),b));
}
__device__ float beachWetness(float4 sh,float h,float level){
 // The current wash and remembered high-water level share the same bed contour.
 // Fully wet at the water, progressively drier inland, never a detached stripe.
 float end=fmaxf(level+.07f,sh.z+.10f);
 return (1-smooth(level-.025f,end,h))*(.9f+.1f*sh.x);
}
__global__ void shore_probe(const float4 *tiles,const float4 *shore,const float4 *points,float4 *output,int count,float time,float seaLevel){
 int i=blockIdx.x*64+threadIdx.y*8+threadIdx.x;if(i>=count)return;float4 p=points[i];float4 field=terrainField(tiles,p.x,p.y);float waterBase=seaLevel;float h=p.w>0?p.z:field.x,level=waterline(p.x,p.y,h,time,waterBase);float4 sh=shoreline(shore,p.x,p.y,h,time,waterBase);
 output[i]=make_float4(h,level,beachWetness(sh,h,level),smooth(-.025f,.025f,level-h));
}
__global__ void sample_probe(const float4 *tiles,const float4 *surface,const float4 *points,float4 *output,int count){int i=blockIdx.x*64+threadIdx.y*8+threadIdx.x;if(i>=count)return;float4 p=points[i],w=waves(surface,p.x,p.y,(int)p.z);output[i]=make_float4(ground(tiles,p.x,p.y),w.x,w.y,w.z);}
__device__ float focusDepth(int layer){return layer==0?.6f:layer==1?2.4f:8.0f;}
__global__ void caustic_clear(unsigned *photons){int x=blockIdx.x*8+threadIdx.x,y=blockIdx.y*8+threadIdx.y;if(x<256&&y<256)photons[blockIdx.z*65536+y*256+x]=0u;}
// Bilinear photon splatting: refraction redirects a uniform flux onto the bed.
__global__ void caustic_trace(const float4 *surface,unsigned *photons){int x=blockIdx.x*8+threadIdx.x,y=blockIdx.y*8+threadIdx.y;if(x>=256||y>=256)return;int layer=blockIdx.z,base=layer*65536;float wx=(float)x*9/256,wy=(float)y*9/256;float4 n=waves(surface,wx,wy,1);float travel=focusDepth(layer)*256/9*.30f;float u=(float)x-n.y*travel,v=(float)y-n.z*travel;int ix=(int)floorf(u),iy=(int)floorf(v);float a=frac(u),b=frac(v);atomicAdd(&photons[base+(iy&255)*256+(ix&255)],(unsigned)((1-a)*(1-b)*4096));atomicAdd(&photons[base+(iy&255)*256+((ix+1)&255)],(unsigned)(a*(1-b)*4096));atomicAdd(&photons[base+((iy+1)&255)*256+(ix&255)],(unsigned)((1-a)*b*4096));atomicAdd(&photons[base+((iy+1)&255)*256+((ix+1)&255)],(unsigned)(a*b*4096));}
__device__ float lightmap(const unsigned *p,float x,float y,int layer){float u=x*256/9,v=y*256/9;int ix=(int)floorf(u),iy=(int)floorf(v),base=layer*65536;float a=frac(u),b=frac(v);return lerp(lerp((float)p[base+(iy&255)*256+(ix&255)],(float)p[base+(iy&255)*256+((ix+1)&255)],a),lerp((float)p[base+((iy+1)&255)*256+(ix&255)],(float)p[base+((iy+1)&255)*256+((ix+1)&255)],a),b)/4096;}
__device__ float focusedLight(const unsigned *p,float x,float y,float depth){int layer=depth<2.4f?0:1;float t=smooth(focusDepth(layer),focusDepth(layer+1),depth);return lerp(lightmap(p,x,y,layer),lightmap(p,x,y,layer+1),t);}
__device__ float density(float x,float y,float z,float cover){float n=noise3(x*.046f,y*.046f,z*.095f)*.65f+noise3(x*.105f+9,y*.105f,z*.22f)*.25f+noise3(x*.23f,y*.23f,z*.45f)*.1f;return sat((n-(.72f-cover*.31f))*5)*smooth(0,4,z)*(1-smooth(13,24,z));}
// A real 3D density integral, cached over the world for cloud reflection/shadow.
__global__ void cloud_volume(float4 *clouds,float time,float cover,float daylight,float sunX,float sunY,float sunZ,float originX,float originY){
 int x=blockIdx.x*8+threadIdx.x,y=blockIdx.y*8+threadIdx.y;if(x>=192||y>=192)return;float wx=(float)x-96+originX/32+time*.65f,wy=(float)y-96+originY/32+time*.22f,trans=1,scatter=0;
 for(int i=0;i<12;i++){float z=(float)i*2+1,d=density(wx+z*.18f,wy+z*.08f,z,cover),sun=expf(-density(wx+sunX*6,wy+sunY*6,z+sunZ*6,cover)*2.4f),alpha=1-expf(-d*.44f);scatter+=trans*alpha*(.36f+.64f*sun);trans*=1-alpha;}
 clouds[y*192+x]=make_float4(scatter,trans,daylight,1);if(x==0&&y==0)clouds[36864]=make_float4(originX,originY,0,0);
}
__device__ float2 cloud(const float4 *s,float x,float y){float4 meta=s[36864];float u=fminf(190.999f,fmaxf(0,(x-meta.x)/32+96)),v=fminf(190.999f,fmaxf(0,(y-meta.y)/32+96));int ix=(int)floorf(u),iy=(int)floorf(v);float a=frac(u),b=frac(v);float4 p=s[iy*192+ix],q=s[iy*192+ix+1],r=s[(iy+1)*192+ix],t=s[(iy+1)*192+ix+1];return make_float2(lerp(lerp(p.x,q.x,a),lerp(r.x,t.x,a),b),lerp(lerp(p.y,q.y,a),lerp(r.y,t.y,a),b));}
// Hand-selected pixel-art palette: deep blues, cyan shoals, sand, grass,
// wet sand, cloud/foam and warm reflected light. No post-render blur.
__device__ float3 palette(int i){
 if(i==0)return rgb(.035f,.125f,.22f);if(i==1)return rgb(.047f,.20f,.30f);
 if(i==2)return rgb(.055f,.28f,.37f);if(i==3)return rgb(.065f,.36f,.43f);
 if(i==4)return rgb(.085f,.43f,.49f);if(i==5)return rgb(.11f,.51f,.55f);
 if(i==6)return rgb(.18f,.59f,.59f);if(i==7)return rgb(.29f,.67f,.63f);
 if(i==8)return rgb(.43f,.74f,.68f);if(i==9)return rgb(.59f,.81f,.73f);
 if(i==10)return rgb(.77f,.88f,.78f);if(i==11)return rgb(.93f,.96f,.85f);
 if(i==12)return rgb(.38f,.40f,.27f);if(i==13)return rgb(.52f,.52f,.36f);
 if(i==14)return rgb(.64f,.62f,.43f);if(i==15)return rgb(.73f,.70f,.49f);
 if(i==16)return rgb(.82f,.77f,.54f);if(i==17)return rgb(.91f,.84f,.61f);
 if(i==18)return rgb(.97f,.90f,.70f);if(i==19)return rgb(.22f,.34f,.17f);
 if(i==20)return rgb(.28f,.42f,.21f);if(i==21)return rgb(.36f,.49f,.25f);
 if(i==22)return rgb(.45f,.57f,.29f);if(i==23)return rgb(.55f,.65f,.35f);
 if(i==24)return rgb(.80f,.53f,.31f);if(i==25)return rgb(.93f,.68f,.39f);
 if(i==26)return rgb(1,.81f,.52f);return rgb(.42f,.53f,.56f);
}
__device__ float3 pixelPalette(float3 color,int x,int y){
 float3 best=rgb(0,0,0);float error=100;
 // Tiny ordered variation breaks colour bands without making a noise texture.
 float d=((float)((x&1)*2+(y&1)) -1.5f)*.002f;
 for(int i=0;i<28;i++){float3 p=palette(i);float r=color.x+d-p.x,g=color.y+d-p.y,b=color.z+d-p.z,e=r*r+g*g*1.2f+b*b;if(e<error){error=e;best=p;}}
 return best;
}
__global__ void render_coast(const float4 *tiles,const float4 *surface,const unsigned *photons,const float4 *clouds,const float4 *ripples,const float4 *shore,float4 *image,int width,int height,float cameraX,float cameraY,float scale,float time,float rain,float daylight,float sunset,float caustics,float reflections,float cloudShadows,float clarity,float seaLevel,float sunX,float sunY,float sunZ,float sunStrength){
 int ix=blockIdx.x*8+threadIdx.x,iy=blockIdx.y*8+threadIdx.y;if(ix>=width||iy>=height)return;
 // Actual 2D isometric map projection. Every tile is on the same plane;
 // depth never changes screen position, tile size or silhouette perspective.
 float screenX=((float)ix+.5f-(float)width*.5f)*scale,screenY=((float)iy+.5f-(float)height*.5f)*scale;
 float x=(screenX+screenY/.5f)*.70710678f+cameraX,y=(screenY/.5f-screenX)*.70710678f+cameraY;
 float4 field=terrainField(tiles,x,y);float waterBase=seaLevel;
 float h=field.x,depth=fmaxf(0,waterBase-h),grain=noise(x*22,y*22),n=fbm(x*.008f,y*.008f);
 float4 sh=shoreline(shore,x,y,h,time,waterBase);float level=waterline(x,y,h,time,waterBase);
 float water=smooth(-.025f,.025f,level-h);
 float sandRipple=sinf(x*5+y*2+noise(x*.3f,y*.3f)*8)*.008f;
 float3 sand=rgb(.88f+grain*.04f+sandRipple,.81f+grain*.04f+sandRipple,.59f+grain*.035f+sandRipple);
 float3 color=sand;float4 w=waves(surface,x,y,0),w2=waves(surface,x,y,1);float sx=w.y+w2.y,sy=w.z+w2.z;
 // Refraction slows the incoming fronts over the shoal. The same phase drives
 // the moving waterline, breaking foam, run-up and persistent wetness.
 float gx=(ground(tiles,x+.2f,y)-ground(tiles,x-.2f,y))*2.5f,gy=(ground(tiles,x,y+.2f)-ground(tiles,x,y-.2f)) *2.5f;
 float slopeLength=fmaxf(.025f,length2(gx,gy)),shoal=expf(-depth*1.9f)*smooth(-.25f,0,waterBase-h);
 float surge=cosf(shorePhase(x,y,h,time,waterBase))*.055f*shoal;
 sx=sx*(.52f+.48f*smooth(0,1.2f,depth))+gx/slopeLength*surge;sy=sy*(.52f+.48f*smooth(0,1.2f,depth))+gy/slopeLength*surge;
 for(int i=0;i<8;i++){float4 r=ripples[i];float age=time-r.z;if(age>0&&age<5&&r.w>0){float rx=x-r.x,ry=y-r.y,d=length2(rx,ry),front=d-age*3.4f,amp=expf(-front*front*1.8f)*expf(-age*.65f)*r.w;float slope=cosf(front*9)*amp*.19f;sx+=rx/fmaxf(.1f,d)*slope;sy+=ry/fmaxf(.1f,d)*slope;}}
 if(rain>.02f){float rx=frac(x*.8f)-.5f,ry=frac(y*.8f)-.5f,phase=frac(time*1.5f+cell((int)floorf(x*.8f),(int)floorf(y*.8f))),rd=length2(rx,ry),wave=expf(-powf((rd-phase*.6f)*20,2))*(1-phase)*rain*.03f;sx+=wave*rx;sy+=wave*ry;}
 float2 cl=cloud(clouds,x+sunX*18/fmaxf(.2f,sunZ),y+sunY*18/fmaxf(.2f,sunZ));
 float sunlight=(1-(1-cl.y)*cloudShadows*.65f)*(1-rain*.55f),light=lerp(.32f,1,daylight);
 float vx=.6123724f,vy=.6123724f,vz=.5f;
 float3 sunColor=blend(rgb(1,.98f,.88f),rgb(1,.67f,.32f),sunset);
 // Dry land is evaluated even at the edge of a wash, avoiding a material pop.
 float wet=beachWetness(sh,h,level);
 float3 land=mul(sand,1-wet*.27f);
 float grass=smooth(.90f,1.07f,h+(n-.5f)*.40f);float3 meadow=blend(rgb(.30f,.45f,.22f),rgb(.44f,.56f,.28f),smooth(.34f,.66f,n));
 float turf=cell((int)floorf(x*3),(int)floorf(y*3));meadow=mul(meadow,.94f+smooth(.72f,.92f,turf)*.14f);land=blend(land,meadow,grass);
 if(water>0){
 float invNormal=rsqrtf(1+sx*sx+sy*sy),nx=-sx*invNormal,ny=-sy*invNormal,nz=invNormal;
 float cosView=sat(nx*vx+ny*vy+nz*vz),eta=.7501875f,k=1-eta*eta*(1-cosView*cosView),r=eta*cosView-sqrtf(fmaxf(.001f,k));
 float rx=-vx*eta+r*nx,ry=-vy*eta+r*ny,rz=-vz*eta+r*nz;
 float surfaceLevel=lerp(level,waterBase,smooth(.4f,1.2f,depth));
 float rayDepth=fmaxf(0,surfaceLevel-h),refrX=x,refrY=y;
 for(int step=0;step<3;step++){refrX=x+rx*rayDepth/fmaxf(.2f,-rz);refrY=y+ry*rayDepth/fmaxf(.2f,-rz);rayDepth=lerp(rayDepth,fmaxf(0,surfaceLevel-ground(tiles,refrX,refrY)),.6f);}
 float path=rayDepth/fmaxf(.2f,-rz),ca=focusedLight(photons,refrX-sunX*rayDepth*.75f,refrY-sunY*rayDepth*.75f,rayDepth);
 ca=fminf(4,ca);float bottomTexture=fbm(refrX*.55f,refrY*.55f),ripplePhase=refrX*6.5f+refrY*2.8f+noise(refrX*.27f,refrY*.27f)*5;
 float ridges=powf(.5f+.5f*sinf(ripplePhase),3)*.065f,trough=powf(.5f+.5f*sinf(ripplePhase+.65f),5)*.05f;
 float3 bed=mul(rgb(.82f,.80f,.66f),.92f+bottomTexture*.10f+ridges-trough);
 bed=mul(bed,1+caustics*(ca-1)*.72f*expf(-rayDepth*.35f)*sunlight);
 float optical=(path+rayDepth/fmaxf(.4f,sunZ)*.60f)/fmaxf(.2f,clarity);
 float3 absorption=rgb(expf(-optical*.83f),expf(-optical*.24f),expf(-optical*.15f)),deep=rgb(.025f,.245f,.31f);
 color=rgb(bed.x*absorption.x+deep.x*(1-absorption.x),bed.y*absorption.y+deep.y*(1-absorption.y),bed.z*absorption.z+deep.z*(1-absorption.z));
 // The first thin sheet of water sits on the same wet sand material. Without
 // this, bright seabed shading read as a dry stripe outside the wet beach.
 color=blend(mul(sand,.68f),color,smooth(.15f,.55f,rayDepth));
 // Reflect the actual view vector through the wave normal into the cloud layer.
 float refX=2*cosView*nx-vx,refY=2*cosView*ny-vy,refZ=fmaxf(.12f,2*cosView*nz-vz);
 float2 reflected=cloud(clouds,x+refX*34/refZ,y+refY*34/refZ);
 float3 sky=blend(rgb(.23f,.48f,.65f),rgb(.91f,.94f,.94f),sat(reflected.x*1.6f));sky=blend(sky,rgb(.94f,.62f,.40f),sunset*.5f);
 float fresnel=.0204f+.9796f*powf(1-cosView,5);color=blend(color,sky,fresnel*reflections);
 // Sparse pixel crest strokes keep deeper water readable without flattening
 // the depth colours or covering the shallows in white noise.
 float crestStroke=1-smooth(.008f,.028f,fabsf(w.x+w2.x*.4f-.06f));
 color=blend(color,rgb(.20f,.53f,.57f),crestStroke*.22f*smooth(.5f,2,depth));
 // GGX sun BRDF: the highlight follows the sun, camera, and spectral normals.
 float hx=vx+sunX,hy=vy+sunY,hz=vz+sunZ,ih=rsqrtf(hx*hx+hy*hy+hz*hz);hx*=ih;hy*=ih;hz*=ih;
 float nh=sat(nx*hx+ny*hy+nz*hz),nl=sat(nx*sunX+ny*sunY+nz*sunZ),vh=sat(vx*hx+vy*hy+vz*hz);
 float alpha=.025f+rain*.035f,a2=alpha*alpha,den=nh*nh*(a2-1)+1,D=a2/(3.14159265f*den*den);
 float F=.0204f+.9796f*powf(1-vh,5),G=(2*cosView/(cosView+sqrtf(a2+(1-a2)*cosView*cosView)))*(2*nl/(nl+sqrtf(a2+(1-a2)*nl*nl)+.0001f));
 // A camera-relative 2D sheen mask composes the sunlight across the flat map.
 // This is a lighting layer, not perspective or height displacement.
 float viewHeight=(float)height*scale;float sunU=(cameraX-cameraY)*.70710678f+(sunX-sunY)*70,sunV=(cameraX+cameraY)*.4384062f+(sunX+sunY+1)*75+5;
 float du=((x-y)*.70710678f-sunU)/fmaxf(12,viewHeight*.12f),dv=((x+y)*.4384062f-sunV)/fmaxf(48,viewHeight*.60f);
 float sheen=expf(-du*du-dv*dv);
 float glint=D*F*G/fmaxf(.08f,4*cosView)*sunStrength*sunlight*reflections*sheen;
 color=blend(color,sunColor,1-expf(-glint));
 float cells=noise(x*8+time*.35f,y*8)*.55f+noise(x*17,y*17-time*.4f)*.45f;
 float crest=powf(sat(sinf(shorePhase(x,y,h,time,waterBase))),14)*smooth(-.03f,.05f,depth)*(1-smooth(.20f,.72f,depth));
 float lace=1-smooth(.025f,.09f,fabsf(h-level));
 float foam=sat((sh.y*.42f+crest*.33f+lace*.22f)*smooth(.15f,.62f,cells));
 color=blend(color,rgb(.94f,.98f,.94f),foam);
 color=blend(land,color,water);
 }else color=land;
 // Thin films remain glossy as the foam retreats.
 float wetGlint=powf(sat(vz*sunZ-vx*sunX-vy*sunY),25)*wet*.13f*sunlight;
 color=add(color,mul(sunColor,wetGlint*sunStrength*.12f*(1-water)));
 color=mul(color,light*(.68f+sunlight*.32f));color=blend(color,mul(rgb(1,.67f,.43f),color.x*1.5f),sunset*.18f);
 if(rain>.02f){float streak=powf(sat(1-fabsf(frac(x*4+y*.9f)-.5f)*50),3)*powf(sat(sinf(y*4-time*25+x*7)),18);color=blend(color,rgb(.66f,.78f,.79f),streak*rain*.42f);color=blend(color,rgb(.37f,.47f,.48f),rain*.12f);}
 float vignette=sat(1-(((float)ix/(float)width-.5f)*((float)ix/(float)width-.5f)+((float)iy/(float)height-.5f)*((float)iy/(float)height-.5f))*.23f);color=mul(color,vignette);
 color=pixelPalette(color,ix,iy);
 image[iy*width+ix]=make_float4(color.x,color.y,color.z,1);
}




// One jittered candidate per 16 m world cell. Noise creates groves and clearings;
// coordinates and seed, never cache indices, determine species and position.
__global__ void vegetation_seed(const float4 *tiles,float4 *plants){
 int ix=blockIdx.x*8+threadIdx.x,iy=blockIdx.y*8+threadIdx.y;if(ix>=384||iy>=384)return;
 float4 meta=tiles[263169];int cx=(int)(meta.x/16)+ix-192,cy=(int)(meta.y/16)+iy-192;
 unsigned key=hash((unsigned)(cx*92837111)^(unsigned)(cy*689287499)^(unsigned)meta.z);
 float x=((float)cx+.18f+rnd(key+1u)*.64f)*16,y=((float)cy+.18f+rnd(key+2u)*.64f)*16;
 float h=ground(tiles,x,y),grove=noise(x*.014f+(float)((unsigned)meta.z&255u),y*.014f+73),chance=rnd(key+3u),species=rnd(key+4u);
 int id=-1;
 if(h>1.42f&&h<3.6f){
  float density=lerp(.08f,.72f,smooth(.30f,.72f,grove));
  float edge=fminf(fminf(ground(tiles,x-7,y),ground(tiles,x+7,y)),fminf(ground(tiles,x,y-7),ground(tiles,x,y+7)));
  if(chance<density&&edge>1.18f){
   if(h<2.0f)id=species<.68f?(int)(rnd(key+5u)*4):species<.90f?4:10;
   else id=species<.32f?(int)(rnd(key+5u)*4):species<.44f?4:species<.53f?5:6+(int)(rnd(key+6u)*6);
  }
 }
 float height=id<4?14:id==4?8:id==5?4:id<8?2.2f:id==8?1.4f:id==9?1.2f:id==10?.7f:.9f;
 height*=.86f+rnd(key+7u)*.28f;
 plants[iy*384+ix]=make_float4(x,y,height,(float)(id+1));if(ix==0&&iy==0)plants[147456]=meta;
}
__device__ float4 plantTexel(const unsigned *atlas,const float4 *metadata,int id,float s,float t,float height,int atlasWidth,float sway){
 float4 rect=metadata[id*2],info=metadata[id*2+1];float size=height*.8660254f/fmaxf(1,info.y);
 float fraction=sat(t/(height*.8660254f));s-=sway*fraction*fraction;
 int u=(int)floorf(info.x+s/size),v=(int)floorf(info.y-t/size);
 if(u<0||v<0||u>=(int)rect.z||v>=(int)rect.w)return make_float4(0,0,0,0);
 // Sample on a coarse native sprite grid instead of exposing generated fine detail.
 float stepX=rect.z/(id<6?40:24),stepY=rect.w/(id<6?48:20);
 u=(int)fminf(rect.z-1,(floorf((float)u/stepX)+.5f)*stepX);v=(int)fminf(rect.w-1,(floorf((float)v/stepY)+.5f)*stepY);
 unsigned packed=atlas[((int)rect.y+v)*atlasWidth+(int)rect.x+u];
 return make_float4((float)(packed&255u)/255,(float)((packed>>8)&255u)/255,(float)((packed>>16)&255u)/255,(float)((packed>>24)&255u)/255);
}
// Flat-map sprite compositing. The upright silhouette has an estimated height
// per texel; project it along -sun/sunZ onto the 2D ground. This is an affine
// sprite shadow, not a 3D mesh or a fixed screen-space drop shadow.
__global__ void render_vegetation(const float4 *tiles,const float4 *plants,const unsigned *atlas,const float4 *metadata,const float4 *clouds,float4 *image,int width,int height,float cameraX,float cameraY,float scale,float time,float wind,float sunX,float sunY,float sunZ,float daylight,float rain,float sunset,int atlasWidth,int enabled,int castShadows){
 int ix=blockIdx.x*8+threadIdx.x,iy=blockIdx.y*8+threadIdx.y;if(ix>=width||iy>=height||enabled==0)return;
 float u=((float)ix+.5f-(float)width*.5f)*scale,v=((float)iy+.5f-(float)height*.5f)*scale;
 float x=(u+v*2)*.70710678f+cameraX,y=(v*2-u)*.70710678f+cameraY;
 float4 meta=plants[147456];int cellX=(int)floorf((x-meta.x)/16)+192,cellY=(int)floorf((y-meta.y)/16)+192;
 float shadow=0,bestDepth=-1000000000;float4 selected=make_float4(0,0,0,0);float selectedX=x,selectedY=y;
 float au=-(sunX-sunY)*.70710678f/fmaxf(.2f,sunZ)/.8660254f,bv=-(sunX+sunY)*.35355339f/fmaxf(.2f,sunZ)/.8660254f;
 for(int j=-3;j<=3;j++)for(int i=-3;i<=3;i++){
  int px=cellX+i,py=cellY+j;if(px<0||py<0||px>=384||py>=384)continue;
  float4 p=plants[py*384+px];if(p.w<.5f||p.z*.8660254f<scale*.65f)continue;int id=(int)p.w-1;
  float du=(x-p.x-y+p.y)*.70710678f,dv=(x-p.x+y-p.y)*.35355339f;
  float sway=sinf(time*(1.1f+wind*.025f)+p.x*.13f+p.y*.07f)*fminf(1.0f,wind*.045f)*(id<6?1:.15f);
  // Painter order by the root's projected world depth; independent of cells.
  float depth=(p.x+p.y)*.35355339f;
  if(depth>bestDepth&&dv<=scale&&dv>-p.z){
   float4 tex=plantTexel(atlas,metadata,id,du,-dv,p.z,atlasWidth,sway);
   if(tex.w>=.5f){selected=tex;bestDepth=depth;selectedX=p.x;selectedY=p.y;}
  }
  if(castShadows!=0&&fabsf(bv)>.015f){
   float t=dv/bv;
   if(t>=0&&t<=p.z*.87f){float4 mask=plantTexel(atlas,metadata,id,du-au*t,t,p.z,atlasWidth,sway);if(mask.w>=.5f)shadow=fmaxf(shadow,.27f);}
  }
  // Small contact shadow is grounded even when the solar silhouette is thin.
  if(castShadows!=0&&du*du/(p.z*.075f+1)+dv*dv/(p.z*.018f+.12f)<1)shadow=fmaxf(shadow,.20f);
 }
 int index=iy*width+ix;float4 original=image[index];float3 color=rgb(original.x,original.y,original.z);
 float2 cl=cloud(clouds,x,y);float sunlight=(.35f+.65f*cl.y)*(1-rain*.72f);
 if(shadow>0){float dry=smooth(-.05f,.2f,ground(tiles,x,y));color=mul(color,1-shadow*sunlight*dry);}
 if(selected.w>=.5f){
  float2 foliageCloud=cloud(clouds,selectedX,selectedY);float light=lerp(.32f,1,daylight)*(.80f+.20f*foliageCloud.y)*(1-rain*.20f);
  // Reuse the terrain's muted olive and sand ramps: no black leaf outlines
  // or bright yellow-green highlights from the high-resolution source.
  float3 foliage=selected.y<.30f?rgb(.28f,.42f,.21f):selected.y<.49f?rgb(.36f,.49f,.25f):rgb(.45f,.57f,.29f);
  float3 trunk=selected.x<.40f?rgb(.52f,.52f,.36f):selected.x<.62f?rgb(.64f,.62f,.43f):rgb(.73f,.70f,.49f);
  color=mul(selected.y>selected.x*1.03f?foliage:trunk,light);
  color=blend(color,mul(rgb(1,.77f,.50f),color.x*1.45f),sunset*.20f);
 }
 color=pixelPalette(color,ix,iy);image[index]=make_float4(color.x,color.y,color.z,1);
}
