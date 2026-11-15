// Whole-crater context terrain: downsample the full CTX DEM + CTX ortho over their
// common extent. Outputs public/data/context_elev.f32, context_ortho.png, context_meta.json.
import { fromFile } from 'geotiff';
import { writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const DATA = '/Users/matvey/mars-jezero/data', OUT = '/Users/matvey/mars-jezero/public/data';
const GRID_W = 512;      // context mesh/elevation grid width
const TEX_W = 3072;      // context texture width

const dem = await (await fromFile(`${DATA}/M20_JezeroCrater_CTXDEM_20m.tif`)).getImage();
const ort = await (await fromFile(`${DATA}/M20_JezeroCrater_CTXortho_5m.tif`)).getImage();
const ext = (img) => { const [ox, oy] = img.getOrigin(); const [rx, ry] = img.getResolution();
  return { ox, oy, rx, ry: Math.abs(ry), minX: ox, maxX: ox + img.getWidth() * rx, maxY: oy, minY: oy - img.getHeight() * Math.abs(ry) }; };
const D = ext(dem), O = ext(ort);
const minX = Math.max(D.minX, O.minX) + 100, maxX = Math.min(D.maxX, O.maxX) - 100;
const minY = Math.max(D.minY, O.minY) + 100, maxY = Math.min(D.maxY, O.maxY) - 100;
const win = (E) => [Math.floor((minX - E.ox) / E.rx), Math.floor((E.oy - maxY) / E.ry), Math.ceil((maxX - E.ox) / E.rx), Math.ceil((E.oy - minY) / E.ry)];
const aspect = (maxY - minY) / (maxX - minX);

// elevation
const gw = GRID_W, gh = Math.round(GRID_W * aspect);
const el = (await dem.readRasters({ window: win(D), width: gw, height: gh, resampleMethod: 'bilinear' }))[0];
let mn = Infinity, mx = -Infinity;
for (const v of el) if (v > -1e6 && v < 1e6) { mn = Math.min(mn, v); mx = Math.max(mx, v); }
const f = new Float32Array(el.length);
for (let i = 0; i < el.length; i++) f[i] = (el[i] > -1e6 && el[i] < 1e6) ? el[i] : mn;
writeFileSync(`${OUT}/context_elev.f32`, Buffer.from(f.buffer));

// texture (8-bit grayscale PNG)
const tw = TEX_W, th = Math.round(TEX_W * aspect);
const im = (await ort.readRasters({ window: win(O), width: tw, height: th, resampleMethod: 'bilinear' }))[0];
const png = new PNG({ width: tw, height: th });
for (let i = 0; i < im.length; i++) { const g = Math.max(0, Math.min(255, im[i] || 0)), o = i * 4;
  png.data[o] = png.data[o + 1] = png.data[o + 2] = g; png.data[o + 3] = 255; }
writeFileSync(`${OUT}/context_ortho.png`, PNG.sync.write(png, { colorType: 0 }));

const meta = { bbox_crs: { minX, minY, maxX, maxY }, width_m: maxX - minX, height_m: maxY - minY,
  grid: { width: gw, height: gh }, elev_min_m: mn, elev_max_m: mx, texture: { width: tw, height: th },
  source: 'USGS M20 CTX DEM 20 m + CTX ortho 5 m, downsampled' };
writeFileSync(`${OUT}/context_meta.json`, JSON.stringify(meta, null, 2));
console.log(`context: ${(meta.width_m/1000).toFixed(1)} x ${(meta.height_m/1000).toFixed(1)} km, grid ${gw}x${gh}, tex ${tw}x${th}, elev ${mn.toFixed(0)}..${mx.toFixed(0)} m`);
