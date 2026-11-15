// THEMIS (Mars Odyssey) night-time infrared layer for Jezero, from NASA Mars Trek WMTS
// (THEMIS_NightIR_ControlledMosaics_100m_v2_oct2018). Night IR brightness is relative,
// not calibrated temperature: warmer at night = higher thermal inertia (rock/bedrock),
// cooler = loose sand and dust. Outputs thermal_detail.jpg, thermal_context.jpg, thermal_meta.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';

const OUT = '/Users/matvey/mars-jezero/public/data';
const LAYER = 'THEMIS_NightIR_ControlledMosaics_100m_v2_oct2018';
const Z = 9, TILE_DEG = 180 / 2 ** Z, PX = 256, DEG_PX = TILE_DEG / PX;
const R = 3396190, COS = Math.cos(18.4663 * Math.PI / 180);
const lonOf = (E) => (E / (R * COS)) * 180 / Math.PI, latOf = (N) => (N / R) * 180 / Math.PI;

const ctx = JSON.parse(readFileSync(`${OUT}/context_meta.json`, 'utf8')).bbox_crs;
const det = JSON.parse(readFileSync(`${OUT}/terrain_meta.json`, 'utf8')).bbox_crs;
const lonMin = lonOf(ctx.minX), lonMax = lonOf(ctx.maxX), latMin = latOf(ctx.minY), latMax = latOf(ctx.maxY);
const c0 = Math.floor((lonMin + 180) / TILE_DEG), c1 = Math.floor((lonMax + 180) / TILE_DEG);
const r0 = Math.floor((90 - latMax) / TILE_DEG), r1 = Math.floor((90 - latMin) / TILE_DEG);
const MW = (c1 - c0 + 1) * PX, MH = (r1 - r0 + 1) * PX;
const mosaic = new Float32Array(MW * MH);
let ok = 0;
for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
  const url = `https://trek.nasa.gov/tiles/Mars/EQ/${LAYER}/1.0.0//default/default028mm/${Z}/${r}/${c}.png`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (research)' } });
  if (!res.ok) { console.log('tile fail', r, c, res.status); continue; }
  const png = PNG.sync.read(Buffer.from(await res.arrayBuffer()));
  for (let y = 0; y < PX; y++) for (let x = 0; x < PX; x++)
    mosaic[((r - r0) * PX + y) * MW + (c - c0) * PX + x] = png.data[(y * PX + x) * 4];
  ok++;
}
console.log(`tiles ${ok}/${(r1 - r0 + 1) * (c1 - c0 + 1)}, mosaic ${MW}x${MH}`);
const lon0 = c0 * TILE_DEG - 180, lat0 = 90 - r0 * TILE_DEG;
const sample = (lon, lat) => {           // bilinear in the mosaic
  const x = (lon - lon0) / DEG_PX - 0.5, y = (lat0 - lat) / DEG_PX - 0.5;
  const x0 = Math.max(0, Math.min(MW - 2, Math.floor(x))), y0 = Math.max(0, Math.min(MH - 2, Math.floor(y))), fx = x - x0, fy = y - y0;
  const m = (a, b) => mosaic[b * MW + a];
  return (m(x0, y0) * (1 - fx) + m(x0 + 1, y0) * fx) * (1 - fy) + (m(x0, y0 + 1) * (1 - fx) + m(x0 + 1, y0 + 1) * fx) * fy;
};
// thermal palette: cold (dust/sand) -> warm (rock)
const PAL = [[12, 8, 40], [70, 18, 110], [170, 40, 95], [235, 100, 40], [252, 200, 70], [255, 250, 220]];
const pal = (t) => { t = Math.min(Math.max(t, 0), 1) * (PAL.length - 1); const i = Math.min(Math.floor(t), PAL.length - 2), f = t - i; return PAL[i].map((a, k) => a + (PAL[i + 1][k] - a) * f); };

function grid(bb, w, h) {
  const v = new Float32Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const E = bb.minX + (i + 0.5) / w * (bb.maxX - bb.minX), N = bb.maxY - (j + 0.5) / h * (bb.maxY - bb.minY);
    v[j * w + i] = sample(lonOf(E), latOf(N));
  }
  return v;
}
let STRETCH = null;   // one stretch for both areas, so colours match across the zone border
function render(bb, outW, name) {
  const aspect = (bb.maxY - bb.minY) / (bb.maxX - bb.minX), w = outW, h = Math.round(outW * aspect);
  const v = grid(bb, w, h);
  if (!STRETCH) { const s = Float32Array.from(v).sort(); STRETCH = { lo: s[Math.floor(s.length * 0.02)], hi: s[Math.floor(s.length * 0.98)] }; }
  const { lo, hi } = STRETCH;
  const buf = Buffer.alloc(w * h * 4);
  for (let k = 0; k < w * h; k++) { const c = pal((v[k] - lo) / (hi - lo || 1)); buf[k * 4] = c[0]; buf[k * 4 + 1] = c[1]; buf[k * 4 + 2] = c[2]; buf[k * 4 + 3] = 255; }
  writeFileSync(`${OUT}/${name}`, jpeg.encode({ data: buf, width: w, height: h }, 88).data);
  console.log(`${name} ${w}x${h} stretch ${lo}..${hi}`);
  return { lo, hi };
}
const sc = render(ctx, 1536, 'thermal_context.jpg');
render(det, 1024, 'thermal_detail.jpg');
// normalized thermal value on the route-planner grid (0 = coolest/loose, 1 = warmest/rock)
const tm = JSON.parse(readFileSync(`${OUT}/terrain_meta.json`, 'utf8'));
const g = grid(det, tm.grid.width, tm.grid.height);
const f = new Float32Array(g.length);
for (let k = 0; k < g.length; k++) f[k] = Math.min(Math.max((g[k] - sc.lo) / (sc.hi - sc.lo), 0), 1);
writeFileSync(`${OUT}/thermal_grid.f32`, Buffer.from(f.buffer));
writeFileSync(`${OUT}/thermal_meta.json`, JSON.stringify({ layer: LAYER, source: 'NASA Mars Trek WMTS · Mars Odyssey THEMIS night IR controlled mosaic, 100 m/px (ASU/USGS)', zoom: Z, stretch: sc, grid: tm.grid, note: 'Relative brightness, one 2-98% stretch over the whole crater; not calibrated temperature.' }, null, 2));
console.log('thermal_grid.f32', tm.grid.width, 'x', tm.grid.height);
