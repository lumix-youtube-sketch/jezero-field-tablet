// High-resolution tiles from the USGS Mars 2020 HiRISE mosaics (MRO HiRISE):
//   ortho 0.25 m/px  -> 1 m/px tiles (1 km x 1 km, 1000x1000 JPEG, Mars tint like CTX)
//   DTM   1 m/px     -> 4 m height grids (251x251, uint16 + per-tile scale)
// Reads only the needed byte ranges over HTTP (uncompressed, 1 row per strip, contiguous rows).
// HiRISE files are Equirectangular latTs=0; our CTX zone uses latTs=18.4663 -> E_h = E_ctx / cos(18.4663°).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import jpeg from 'jpeg-js';

const OUT = '/Users/matvey/mars-jezero/public/data', TD = `${OUT}/hirise`; mkdirSync(TD, { recursive: true });
const BASE = 'https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/HiRISE/';
const DTM = { url: BASE + 'JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40.tif', first: 172609, rowBytes: 85600, ox: 4577366, oy: 1106618, res: 1, w: 21400, h: 21488, bpp: 4 };
const ORT = { url: BASE + 'JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first.tif', first: 1032257, rowBytes: 85600, ox: 4577366, oy: 1106618, res: 0.25, w: 85600, h: 85952, bpp: 1 };
const COS = Math.cos(18.4663 * Math.PI / 180);
const meta = JSON.parse(readFileSync(`${OUT}/terrain_meta.json`, 'utf8'));
const DB = meta.bbox_crs, TILE = 1000, NX = Math.ceil(meta.width_m / TILE), NY = Math.ceil(meta.height_m / TILE);
const DN = 251, DSTEP = TILE / (DN - 1), OPX = 1000;
const cb = readFileSync(`${OUT}/elevation.f32`), CTX = new Float32Array(cb.buffer, cb.byteOffset, cb.byteLength / 4);
const GW = meta.grid.width, GH = meta.grid.height;
const ctxElev = (E, N) => { // bilinear on the CTX grid
  const fx = Math.min(Math.max((E - DB.minX) / meta.width_m, 0), 1) * (GW - 1), fy = Math.min(Math.max((DB.maxY - N) / meta.height_m, 0), 1) * (GH - 1);
  const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(x0 + 1, GW - 1), y1 = Math.min(y0 + 1, GH - 1), a = fx - x0, b = fy - y0;
  return (CTX[y0 * GW + x0] * (1 - a) + CTX[y0 * GW + x1] * a) * (1 - b) + (CTX[y1 * GW + x0] * (1 - a) + CTX[y1 * GW + x1] * a) * b;
};

async function fetchRange(url, a, b, tries = 4) {
  for (let t = 0; t < tries; t++) {
    try { const r = await fetch(url, { headers: { Range: `bytes=${a}-${b}`, 'User-Agent': 'Mozilla/5.0 (research)' } }); if (r.status !== 206 && r.status !== 200) throw new Error(r.status); return Buffer.from(await r.arrayBuffer()); }
    catch (e) { if (t === tries - 1) throw e; await new Promise(s => setTimeout(s, 500 * (t + 1))); }
  }
}
async function pool(items, n, fn) { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } })); }
const colOf = (src, Ec) => Math.floor((Ec / COS - src.ox) / src.res), rowOf = (src, N) => Math.floor((src.oy - N) / src.res);
// column span of the whole tile grid
const E0 = DB.minX, E1 = DB.minX + NX * TILE;
const span = (src) => [Math.max(0, colOf(src, E0) - 2), Math.min(src.w - 1, colOf(src, E1) + 2)];

// ---------- DTM: rows at 4 m spacing ----------
const [dc0, dc1] = span(DTM), dRows = new Map();
const needD = new Set();
for (let ty = 0; ty < NY; ty++) for (let j = 0; j < DN; j++) { const r = rowOf(DTM, DB.maxY - ty * TILE - j * DSTEP); if (r >= 0 && r < DTM.h) needD.add(r); }
console.log(`DTM: ${needD.size} rows x ${dc1 - dc0 + 1} cols (${((needD.size * (dc1 - dc0 + 1) * 4) / 1e6).toFixed(0)} MB)`);
let t0 = Date.now(), done = 0;
await pool([...needD], 24, async (r) => {
  const off = DTM.first + r * DTM.rowBytes, buf = await fetchRange(DTM.url, off + dc0 * 4, off + dc1 * 4 + 3);
  dRows.set(r, new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4)); if (++done % 300 === 0) console.log(`  dtm ${done}/${needD.size}  ${((Date.now() - t0) / 1000).toFixed(0)} s`);
});
const dtmAt = (E, N) => { const r = rowOf(DTM, N), c = colOf(DTM, E) - dc0, row = dRows.get(r); if (!row || c < 0 || c >= row.length) return NaN; const v = row[c]; return v < -1e30 || v > 1e6 ? NaN : v; };
// datum offset HiRISE vs CTX (median over valid samples)
const diffs = []; for (let ty = 0; ty < NY; ty += 1) for (let tx = 0; tx < NX; tx += 1) for (let k = 0; k < 40; k++) {
  const E = DB.minX + (tx + Math.random()) * TILE, N = DB.maxY - (ty + Math.random()) * TILE, h = dtmAt(E, N); if (!isNaN(h)) diffs.push(h - ctxElev(E, N)); }
diffs.sort((a, b) => a - b); const OFFSET = diffs.length ? diffs[diffs.length >> 1] : 0;
console.log(`datum offset HiRISE-CTX: ${OFFSET.toFixed(2)} m (from ${diffs.length} samples)`);

// ---------- ortho: stretch from sparse rows, then band by band at 1 m ----------
const [oc0, oc1] = span(ORT);
const sampleRows = []; for (let k = 0; k < 40; k++) sampleRows.push(rowOf(ORT, DB.maxY - (k + 0.5) / 40 * NY * TILE));
const hist = new Uint32Array(256);
await pool(sampleRows, 12, async (r) => { const off = ORT.first + r * ORT.rowBytes, b = await fetchRange(ORT.url, off + oc0, off + oc1); for (let i = 0; i < b.length; i += 7) if (b[i]) hist[b[i]]++; });
const tot = hist.reduce((a, b) => a + b, 0); let acc = 0, LO = 0, HI = 255;
for (let g = 0; g < 256; g++) { acc += hist[g]; if (acc < tot * 0.01) LO = g; if (acc < tot * 0.995) HI = g; }
console.log(`ortho stretch ${LO}..${HI}`);
const PAL = [[26, 15, 11], [88, 46, 29], [158, 90, 56], [211, 147, 99], [247, 218, 184]];
const lerp = (t) => { t = Math.min(Math.max(t, 0), 1) * (PAL.length - 1); const i = Math.min(Math.floor(t), PAL.length - 2), f = t - i; return PAL[i].map((a, k) => a + (PAL[i + 1][k] - a) * f); };
const LUT = Array.from({ length: 256 }, (_, g) => lerp(Math.pow(Math.min(Math.max((g - LO) / (HI - LO), 0), 1), 0.9)));

const tiles = [];
for (let ty = 0; ty < NY; ty++) {
  const yTop = DB.maxY - ty * TILE, oRows = new Map(), need = [];
  for (let j = 0; j < OPX; j++) { const r = rowOf(ORT, yTop - (j + 0.5) * TILE / OPX); if (r >= 0 && r < ORT.h) need.push(r); }
  t0 = Date.now();
  await pool(need, 32, async (r) => { const off = ORT.first + r * ORT.rowBytes; oRows.set(r, await fetchRange(ORT.url, off + oc0, off + oc1)); });
  console.log(`band ${ty + 1}/${NY}: ${need.length} ortho rows in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  for (let tx = 0; tx < NX; tx++) {
    const xL = DB.minX + tx * TILE;
    // ortho
    const rgba = Buffer.alloc(OPX * OPX * 4); let valid = 0, sum = 0;
    const gray = new Uint8Array(OPX * OPX);
    for (let j = 0; j < OPX; j++) {
      const row = oRows.get(rowOf(ORT, yTop - (j + 0.5) * TILE / OPX));
      for (let i = 0; i < OPX; i++) { const c = colOf(ORT, xL + (i + 0.5) * TILE / OPX) - oc0, g = row && c >= 0 && c < row.length ? row[c] : 0; gray[j * OPX + i] = g; if (g) { valid++; sum += g; } }
    }
    const cover = valid / (OPX * OPX);
    // DTM
    const h = new Float32Array(DN * DN); let dval = 0;
    for (let j = 0; j < DN; j++) for (let i = 0; i < DN; i++) {
      const E = xL + i * DSTEP, N = yTop - j * DSTEP, v = dtmAt(E, N);
      if (!isNaN(v)) { h[j * DN + i] = v - OFFSET; dval++; } else h[j * DN + i] = ctxElev(E, N);
    }
    const dcover = dval / (DN * DN);
    const ok = cover > 0.9 && dcover > 0.9;
    tiles.push({ tx, ty, ok, cover: +cover.toFixed(3), dcover: +dcover.toFixed(3) });
    if (!ok) continue;
    const mean = Math.round(sum / Math.max(valid, 1));
    for (let p = 0; p < OPX * OPX; p++) { const L = LUT[gray[p] || mean]; rgba[p * 4] = L[0]; rgba[p * 4 + 1] = L[1]; rgba[p * 4 + 2] = L[2]; rgba[p * 4 + 3] = 255; }
    writeFileSync(`${TD}/t_${tx}_${ty}.jpg`, jpeg.encode({ data: rgba, width: OPX, height: OPX }, 84).data);
    let mn = Infinity, mx = -Infinity; for (const v of h) { if (v < mn) mn = v; if (v > mx) mx = v; }
    const sc = (mx - mn) / 65535 || 1e-6, u16 = new Uint16Array(DN * DN); for (let p = 0; p < h.length; p++) u16[p] = Math.round((h[p] - mn) / sc);
    writeFileSync(`${TD}/t_${tx}_${ty}.u16`, Buffer.from(u16.buffer));
    tiles[tiles.length - 1].min = mn; tiles[tiles.length - 1].scale = sc;
  }
  oRows.clear();
}
writeFileSync(`${TD}/manifest.json`, JSON.stringify({ source: 'USGS Astrogeology Mars 2020 TRN HiRISE ortho (0.25 m) + DTM (1 m), MRO HiRISE', tile_m: TILE, nx: NX, ny: NY, dtm_n: DN, ortho_px: OPX,
  origin: { minX: DB.minX, maxY: DB.maxY }, datum_offset_m: OFFSET, stretch: [LO, HI], tiles }, null, 1));
console.log(`done: ${tiles.filter(t => t.ok).length}/${tiles.length} tiles with HiRISE coverage`);
