// Demo/test: compute a safe route across the real Jezero terrain between two
// real rover waypoints, and save it for the 3D app.
import { readFileSync, writeFileSync } from 'node:fs';
import { findRoute, straightLine } from '../public/js/route.js';

const OUT = '/Users/matvey/mars-jezero/public/data';
const meta = JSON.parse(readFileSync(`${OUT}/terrain_meta.json`, 'utf8'));
const wpf = JSON.parse(readFileSync(`${OUT}/waypoints_local.json`, 'utf8'));
const buf = readFileSync(`${OUT}/elevation.f32`);
const elev = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);

const W = meta.grid.width, H = meta.grid.height;
const mppxX = meta.meters_per_px.x, mppxY = meta.meters_per_px.y;

const wps = wpf.waypoints;
const A = wps[0], B = wps[wps.length - 1];
const start = { x: Math.round(A.gx), y: Math.round(A.gy) };
const goal  = { x: Math.round(B.gx), y: Math.round(B.gy) };

console.log(`Grid ${W}x${H}, ${mppxX.toFixed(1)}x${mppxY.toFixed(1)} m/px`);
console.log(`START sol ${A.sol} (${start.x},${start.y})  ->  GOAL sol ${B.sol} (${goal.x},${goal.y})`);

const t0 = Date.now();
const r = findRoute(elev, W, H, mppxX, mppxY, start, goal, { maxSlopeDeg: 25, slopeWeight: 6 });
const ms = Date.now() - t0;

if (!r.found) { console.log('NO ROUTE:', r.reason); process.exit(1); }
const sl = straightLine(elev, W, mppxX, mppxY, start, goal);
console.log(`\nSAFE ROUTE found in ${ms} ms`);
console.log(`  cells:        ${r.cells}`);
console.log(`  length:       ${(r.lengthM/1000).toFixed(2)} km`);
console.log(`  straight line:${(sl/1000).toFixed(2)} km (detour +${((r.lengthM/sl-1)*100).toFixed(0)}% to stay safe)`);
console.log(`  max slope:    ${r.maxSlopeDeg.toFixed(1)}° (limit ${r.params.maxSlopeDeg}°)`);
console.log(`  avg slope:    ${r.avgSlopeDeg.toFixed(1)}°`);

// save for 3D (path in grid + normalized uv)
const path = r.path.map(p => ({ x: p.x, y: p.y, u: p.x/(W-1), v: p.y/(H-1), elev_m: elev[p.y*W+p.x] }));
writeFileSync(`${OUT}/route_demo.json`, JSON.stringify({
  start_sol: A.sol, goal_sol: B.sol,
  length_km: r.lengthM/1000, straight_km: sl/1000,
  max_slope_deg: r.maxSlopeDeg, avg_slope_deg: r.avgSlopeDeg,
  params: r.params, cells: r.cells, path,
}, null, 2));
console.log(`\nwrote route_demo.json (${path.length} pts)`);
