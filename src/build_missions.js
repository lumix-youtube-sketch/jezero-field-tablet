// Design & balance EVA missions on real sample sites. For each mission: compute safe
// routes between lander and targets (same A* as the app), walking times (Tobler x suit pace),
// then brute-force the best plan under the time budget. Output public/data/missions.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { findRoute } from '../public/js/route.js';

const OUT = '/Users/matvey/mars-jezero/public/data';
const meta = JSON.parse(readFileSync(`${OUT}/terrain_meta.json`, 'utf8'));
const S = JSON.parse(readFileSync(`${OUT}/samples.json`, 'utf8')).samples;
const WP = JSON.parse(readFileSync(`${OUT}/waypoints_local.json`, 'utf8')).waypoints;
const b = readFileSync(`${OUT}/elevation.f32`); const elev = new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
const GW = meta.grid.width, GH = meta.grid.height, MPX = meta.meters_per_px.x, MPY = meta.meters_per_px.y;
const PACE = 0.6, SAMPLE_H = 20 / 60, LIMIT = 25;
const tobler = (s) => 6 * Math.exp(-3.5 * Math.abs(s + 0.05));
const wpAtSol = (s) => { let w = WP[0]; for (const x of WP) { if (x.sol <= s) w = x; else break; } return w; };

const VALUE = (s) => {
  const r = (s.rock_type || '').toLowerCase();
  if (s.name === 'Sapphire Canyon') return 40;           // potential biosignature
  if (r.includes('serpentinite') || r.includes('carbonate')) return 25;
  if (r.includes('impactite')) return 20;
  if (s.sample_type === 'Regolith') return 8;
  if (s.sample_type === 'Atmospheric') return 5;
  if (r.includes('sedimentary')) return 15;
  if (s.location.includes('Séítah')) return 15;          // olivine cumulate from a magma chamber
  return 10;                                             // other igneous
};

function leg(a, bb) {
  const r = findRoute(elev, GW, GH, MPX, MPY, { x: a.u * (GW - 1), y: a.v * (GH - 1) }, { x: bb.u * (GW - 1), y: bb.v * (GH - 1) }, { maxSlopeDeg: LIMIT, slopeWeight: 6 });
  if (!r.found) return null;
  let tf = 0, tb = 0, km = 0, up = 0, down = 0;
  for (let i = 1; i < r.path.length; i++) {
    const p = r.path[i - 1], q = r.path[i], h = Math.hypot((q.x - p.x) * MPX, (q.y - p.y) * MPY), dz = elev[q.y * GW + q.x] - elev[p.y * GW + p.x];
    tf += h / 1000 / (tobler(dz / h) * PACE); tb += h / 1000 / (tobler(-dz / h) * PACE); km += h / 1000; dz > 0 ? up += dz : down -= dz;
  }
  return { tf, tb, km, up, down };
}

const DEF = [
  { id: 'floor', title: 'First steps on the crater floor', region: 'Crater floor · Séítah', level: 1,
    lander: { sol: 13, name: 'Octavia E. Butler Landing' }, targets: [8, 2, 4, 6, 1], budget: 2 },
  { id: 'delta', title: 'Reading the ancient lake', region: 'Delta front', level: 2,
    lander: { sol: 470, name: 'Lander (hypothetical, delta front)' }, targets: [10, 12, 14, 16, 17, 19], budget: 2 },
  { id: 'rim', title: 'Life and the crater rim', region: 'Neretva Vallis · Witch Hazel Hill', level: 3,
    lander: { sol: 1300, name: 'Lander (hypothetical, Neretva Vallis)' }, targets: [25, 26, 27, 28, 24], budget: 4 },
];

const missions = [];
for (const d of DEF) {
  const lw = wpAtSol(d.lander.sol);
  const nodes = [{ kind: 'lander', name: d.lander.name, u: lw.u, v: lw.v }].concat(d.targets.map(n => {
    const s = S.find(x => x.no === n); return { kind: 'target', no: n, name: s.name, rock: s.rock_type, type: s.sample_type, sol: s.sol, location: s.location, u: s.u, v: s.v, value: VALUE(s) };
  }));
  const N = nodes.length, T = Array.from({ length: N }, () => Array(N).fill(null));
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
    const L = leg(nodes[i], nodes[j]); if (!L) continue;
    T[i][j] = { t: L.tf, km: L.km }; T[j][i] = { t: L.tb, km: L.km };
  }
  // brute force best plan: permutations of subsets of targets
  let best = { score: 0, order: [], time: 0 };
  const idx = nodes.map((_, i) => i).slice(1);
  const perm = (cur, rest, time, score) => {
    const back = cur.length ? T[cur[cur.length - 1]][0] : { t: 0 };
    if (back) { const total = time + back.t; if (total <= d.budget && (score > best.score || (score === best.score && total < best.time))) best = { score, order: [...cur], time: total }; }
    for (const k of rest) {
      const from = cur.length ? cur[cur.length - 1] : 0, L = T[from][k]; if (!L) continue;
      const nt = time + L.t + SAMPLE_H; if (nt > d.budget) continue;
      perm([...cur, k], rest.filter(x => x !== k), nt, score + nodes[k].value);
    }
  };
  if (process.env.SWEEP) for (const B of [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]) {
    const save = d.budget; d.budget = B; best = { score: 0, order: [], time: 0 }; perm([], idx, 0, 0);
    console.log(`  [${d.id}] budget ${B} h -> ${best.score} pts (${best.order.length} samples)`); d.budget = save;
  }
  best = { score: 0, order: [], time: 0 };
  perm([], idx, 0, 0);
  const all = nodes.slice(1).reduce((a, n) => a + n.value, 0);
  console.log(`\n== ${d.title} (budget ${d.budget} h)`);
  for (let i = 1; i < N; i++) console.log(`  #${nodes[i].no} ${nodes[i].name.padEnd(16)} ${String(nodes[i].value).padStart(2)} pts  lander->: ${T[0][i] ? T[0][i].t.toFixed(2) + ' h ' + T[0][i].km.toFixed(2) + ' km' : 'NO ROUTE'}`);
  console.log(`  best: ${best.score}/${all} pts via ${best.order.map(i => '#' + nodes[i].no).join(' > ')} in ${best.time.toFixed(2)} h`);
  missions.push({ ...d, nodes, best: { score: best.score, order: best.order.map(i => nodes[i].no), hours: best.time }, maxScore: all, sampleMinutes: 20, pace: PACE, slopeLimit: LIMIT });
}
writeFileSync(`${OUT}/missions.json`, JSON.stringify({ missions }, null, 2));
