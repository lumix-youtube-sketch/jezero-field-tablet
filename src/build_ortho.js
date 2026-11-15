// Clip the CTX 5 m orthoimage to the same AOI as the heightmap and downsample
// to a texture. Output: public/data/ortho.png (8-bit grayscale).
import { fromFile } from 'geotiff';
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const DATA = '/Users/matvey/mars-jezero/data';
const OUT  = '/Users/matvey/mars-jezero/public/data';
const ORTHO = `${DATA}/M20_JezeroCrater_CTXortho_5m.tif`;
const OUT_W = 4096;

const meta = JSON.parse(readFileSync(`${OUT}/terrain_meta.json`, 'utf8'));
const { minX, minY, maxX, maxY } = meta.bbox_crs;

const tiff = await fromFile(ORTHO);
const img = await tiff.getImage();
const [ox, oyTop] = img.getOrigin();
const [rx, ryNeg] = img.getResolution();
const ry = Math.abs(ryNeg);
const W = img.getWidth(), H = img.getHeight();
console.log('ortho:', W, 'x', H, 'res', rx, 'origin', ox.toFixed(0), oyTop.toFixed(0));

const left   = Math.max(0, Math.floor((minX - ox) / rx));
const right  = Math.min(W, Math.ceil((maxX - ox) / rx));
const top    = Math.max(0, Math.floor((oyTop - maxY) / ry));
const bottom = Math.min(H, Math.ceil((oyTop - minY) / ry));
const aspect = (bottom - top) / (right - left);
const outW = OUT_W, outH = Math.round(OUT_W * aspect);
console.log(`ortho AOI px: x[${left}..${right}] y[${top}..${bottom}] -> ${outW}x${outH}`);

const rasters = await img.readRasters({
  window: [left, top, right, bottom],
  width: outW, height: outH,
  resampleMethod: 'bilinear',
});
const band = rasters[0];

const png = new PNG({ width: outW, height: outH });   // pngjs buffer is always RGBA
for (let i = 0; i < band.length; i++) {
  const v = band[i];
  const g = (v === undefined || Number.isNaN(v)) ? 0 : Math.max(0, Math.min(255, v));
  const o = i * 4;
  png.data[o] = png.data[o+1] = png.data[o+2] = g; png.data[o+3] = 255;
}
writeFileSync(`${OUT}/ortho.png`, PNG.sync.write(png));
console.log(`wrote ortho.png (${outW}x${outH})`);
