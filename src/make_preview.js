// Sanity-preview: draw the real rover traverse (cyan) and our computed safe
// route (red) over the real CTX orthoimage. Output public/data/preview.png.
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const OUT = '/Users/matvey/mars-jezero/public/data';
const ortho = PNG.sync.read(readFileSync(`${OUT}/ortho.png`));
const W = ortho.width, H = ortho.height;
const wpf = JSON.parse(readFileSync(`${OUT}/waypoints_local.json`, 'utf8'));
const route = JSON.parse(readFileSync(`${OUT}/route_demo.json`, 'utf8'));

const put = (x, y, r, g, b, rad = 0) => {
  for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
    const px = x+dx|0, py = y+dy|0; if (px<0||py<0||px>=W||py>=H) continue;
    const o = (py*W+px)*4; ortho.data[o]=r; ortho.data[o+1]=g; ortho.data[o+2]=b; ortho.data[o+3]=255;
  }
};
const line = (x0,y0,x1,y1,r,g,b,rad=1) => {
  const n = Math.max(1, Math.hypot(x1-x0,y1-y0)|0);
  for (let i=0;i<=n;i++){ const t=i/n; put(x0+(x1-x0)*t, y0+(y1-y0)*t, r,g,b, rad); }
};

// real rover traverse (cyan)
const wps = wpf.waypoints;
for (let i=1;i<wps.length;i++) line(wps[i-1].u*W, wps[i-1].v*H, wps[i].u*W, wps[i].v*H, 0,200,255, 0);
// our computed safe route (red)
const p = route.path;
for (let i=1;i<p.length;i++) line(p[i-1].u*W, p[i-1].v*H, p[i].u*W, p[i].v*H, 255,40,40, 1);
// start (green) / goal (magenta)
put(p[0].u*W, p[0].v*H, 40,255,80, 4);
put(p[p.length-1].u*W, p[p.length-1].v*H, 255,40,220, 4);

writeFileSync(`${OUT}/preview.png`, PNG.sync.write(ortho));
console.log(`wrote preview.png (${W}x${H}): cyan=rover traverse, red=safe route, green=start, magenta=goal`);
