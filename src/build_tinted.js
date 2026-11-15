// Pre-render Mars-tinted + grayscale JPEG textures (fast load in the browser).
// The source data is grayscale CTX; the tint is cosmetic and labeled as such in the app.
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';
const OUT = '/Users/matvey/mars-jezero/public/data';
const PAL = [[26,15,11],[88,46,29],[158,90,56],[211,147,99],[247,218,184]];
const lerp = (t) => { t = Math.min(Math.max(t,0),1)*(PAL.length-1); const i=Math.min(Math.floor(t),PAL.length-2), f=t-i; return PAL[i].map((a,k)=>a+(PAL[i+1][k]-a)*f); };
const LUT = Array.from({length:256},(_,g)=>lerp(Math.pow(g/255,0.9)));
for (const [src, base] of [['ortho.png','detail'],['context_ortho.png','context']]) {
  const p = PNG.sync.read(readFileSync(`${OUT}/${src}`)); const n = p.width*p.height;
  const mars = Buffer.alloc(n*4), gray = Buffer.alloc(n*4);
  for (let i=0;i<n;i++){ const g=p.data[i*4], L=LUT[g]; mars[i*4]=L[0]; mars[i*4+1]=L[1]; mars[i*4+2]=L[2]; mars[i*4+3]=255; gray[i*4]=gray[i*4+1]=gray[i*4+2]=g; gray[i*4+3]=255; }
  for (const [buf,suf] of [[mars,'mars'],[gray,'gray']]) {
    const j = jpeg.encode({ data: buf, width: p.width, height: p.height }, 86);
    writeFileSync(`${OUT}/${base}_${suf}.jpg`, j.data); console.log(`${base}_${suf}.jpg ${(j.data.length/1e6).toFixed(2)} MB`);
  }
}
