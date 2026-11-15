// Build a three.js-ready heightmap from the CTX DEM, clipped to the rover's
// traverse area (+margin). Outputs:
//   public/data/heightmap.png        16-bit grayscale elevation
//   public/data/terrain_meta.json    bbox, elev range, grid dims, scale
//   public/data/waypoints_local.json rover path mapped to the grid
//
// Real data only. CRS: Equirectangular on Mars 2000 Sphere (R=3396190 m), 20 m/px.
import { fromFile } from 'geotiff';
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const DATA = '/Users/matvey/mars-jezero/data';
const OUT  = '/Users/matvey/mars-jezero/public/data';
const DEM  = `${DATA}/M20_JezeroCrater_CTXDEM_20m.tif`;
const WP   = `${DATA}/M20_waypoints.json`;
const MARGIN_M = 2000;     // margin around traverse, metres
const OUT_W = 1024;        // output heightmap width (px); height derived from aspect
const NODATA_LO = -1e6;    // anything below this is treated as nodata

const tiff = await fromFile(DEM);
const img = await tiff.getImage();
const [ox, oyTop] = img.getOrigin();     // top-left corner (easting, northing)
const [rx, ryNeg] = img.getResolution(); // 20, -20
const ry = Math.abs(ryNeg);
const W = img.getWidth(), H = img.getHeight();

// --- AOI from waypoints + margin ---
const wp = JSON.parse(readFileSync(WP, 'utf8')).features;
const E = wp.map(f => f.properties.easting), N = wp.map(f => f.properties.northing);
let minX = Math.min(...E) - MARGIN_M, maxX = Math.max(...E) + MARGIN_M;
let minY = Math.min(...N) - MARGIN_M, maxY = Math.max(...N) + MARGIN_M;
// clamp to DEM extent
minX = Math.max(minX, ox);            maxX = Math.min(maxX, ox + W * rx);
maxY = Math.min(maxY, oyTop);         minY = Math.max(minY, oyTop - H * ry);

// AOI in DEM pixel window [left, top, right, bottom]
const left   = Math.floor((minX - ox) / rx);
const right  = Math.ceil((maxX - ox) / rx);
const top    = Math.floor((oyTop - maxY) / ry);
const bottom = Math.ceil((oyTop - minY) / ry);
const aspect = (bottom - top) / (right - left);
const outW = OUT_W, outH = Math.round(OUT_W * aspect);

console.log(`AOI window px: x[${left}..${right}] y[${top}..${bottom}] -> out ${outW}x${outH}`);

// read + resample the window
const rasters = await img.readRasters({
  window: [left, top, right, bottom],
  width: outW, height: outH,
  resampleMethod: 'bilinear',
});
const band = rasters[0];

// elevation stats over valid pixels
let eMin = Infinity, eMax = -Infinity, nod = 0;
for (const v of band) {
  if (v === undefined || Number.isNaN(v) || v < NODATA_LO) { nod++; continue; }
  if (v < eMin) eMin = v; if (v > eMax) eMax = v;
}
const range = eMax - eMin || 1;
console.log(`elev AOI: ${eMin.toFixed(1)} .. ${eMax.toFixed(1)} m  (nodata px: ${nod})`);

// write 8-bit grayscale preview PNG (pngjs buffer is always RGBA).
// NOTE: elevation.f32 below is the authoritative height source; this PNG is a preview.
const png = new PNG({ width: outW, height: outH });
for (let i = 0; i < band.length; i++) {
  const v = band[i];
  const g = (v === undefined || Number.isNaN(v) || v < NODATA_LO) ? 0
          : Math.max(0, Math.min(255, Math.round(((v - eMin) / range) * 255)));
  const o = i * 4;
  png.data[o] = png.data[o+1] = png.data[o+2] = g; png.data[o+3] = 255;
}
writeFileSync(`${OUT}/heightmap.png`, PNG.sync.write(png));

// raw Float32 elevations (row-major, metres; nodata -> eMin) for the algorithm + 3D mesh
const f32 = new Float32Array(band.length);
for (let i = 0; i < band.length; i++) {
  const v = band[i];
  f32[i] = (v === undefined || Number.isNaN(v) || v < NODATA_LO) ? eMin : v;
}
writeFileSync(`${OUT}/elevation.f32`, Buffer.from(f32.buffer));

// metadata so 3D can reconstruct TRUE elevation and world scale
const meta = {
  crs: 'Equirectangular / Mars_2000_Sphere (R=3396190 m)',
  source: 'USGS M20 CTX DEM 20 m/px (planetarymaps.usgs.gov)',
  bbox_crs: { minX, minY, maxX, maxY },         // metres (easting/northing)
  width_m: maxX - minX, height_m: maxY - minY,
  grid: { width: outW, height: outH },
  meters_per_px: { x: (maxX - minX) / outW, y: (maxY - minY) / outH },
  elev_min_m: eMin, elev_max_m: eMax,
  heightmap: 'heightmap.png (16-bit grayscale; elev = elev_min + gray/65535 * (elev_max-elev_min))',
  elevation_f32: 'elevation.f32 (raw Float32 LE, row-major, metres; use for mesh + routing)',
  nodata_px: nod,
};
writeFileSync(`${OUT}/terrain_meta.json`, JSON.stringify(meta, null, 2));

// map waypoints onto the grid (u,v in [0,1]; gx,gy in grid px; v=0 is top/north)
const local = wp.map(f => {
  const p = f.properties;
  const u = (p.easting - minX) / (maxX - minX);
  const v = (maxY - p.northing) / (maxY - minY);
  return {
    sol: p.sol, site: p.site, drive: p.drive, rmc: p.RMC,
    u, v, gx: u * (outW - 1), gy: v * (outH - 1),
    elev_m: p.elev_geoid,
    dist_total_m: p.dist_total_m,
    lon: p.lon, lat: p.lat,
    note: p.Note || '',
  };
});
writeFileSync(`${OUT}/waypoints_local.json`, JSON.stringify({
  count: local.length,
  sol_range: [local[0].sol, local[local.length - 1].sol],
  traverse_km: Math.max(...local.map(w => w.dist_total_m)) / 1000,
  bbox_crs: { minX, minY, maxX, maxY },
  grid: { width: outW, height: outH },
  waypoints: local,
}, null, 2));

console.log(`wrote heightmap.png (${outW}x${outH}), terrain_meta.json, waypoints_local.json (${local.length} wp)`);
