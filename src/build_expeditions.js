// Balance the crew-rover expeditions: safe routes between lander and real sample sites,
// costed with the shared rover model (energy, time), then exhaustive search for the best plan
// under the battery and daylight limits. Output public/data/expeditions.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { findRoute } from '../public/js/route.js';
import { ROVER, pathCost } from '../public/js/rovermodel.js';

const OUT = '/Users/matvey/mars-jezero/public/data';
const meta = JSON.parse(readFileSync(`${OUT}/terrain_meta.json`, 'utf8'));
const S = JSON.parse(readFileSync(`${OUT}/samples.json`, 'utf8')).samples;
const WP = JSON.parse(readFileSync(`${OUT}/waypoints_local.json`, 'utf8')).waypoints;
const f32 = (p) => { const b = readFileSync(p); return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4); };
const elev = f32(`${OUT}/elevation.f32`), therm = f32(`${OUT}/thermal_grid.f32`);
const GW = meta.grid.width, GH = meta.grid.height, MPX = meta.meters_per_px.x, MPY = meta.meters_per_px.y;
const wpAtSol = (s) => { let w = WP[0]; for (const x of WP) { if (x.sol <= s) w = x; else break; } return w; };
const STOP_H = ROVER.stopMin / 60;

const VALUE = (s) => {
  const r = (s.rock_type || '').toLowerCase();
  if (s.name === 'Sapphire Canyon') return 40;
  if (r.includes('serpentinite') || r.includes('carbonate')) return 25;
  if (r.includes('impactite')) return 20;
  if (r.includes('sedimentary')) return 15;
  if (s.location.includes('Séítah')) return 15;
  return 10;
};
// rock class the player must identify from the data (answer from NASA's table)
const CLASS = (s) => {
  const r = (s.rock_type || '').toLowerCase();
  if (r.includes('carbonate') || r.includes('serpentinite')) return 'altered';
  if (r.includes('sedimentary')) return 'sedimentary';
  return 'igneous';
};

const DEF = [
  { id: 'floor', title: 'Shakedown on the crater floor', region: 'Crater floor · Séítah', level: 1,
    lander: { sol: 13, name: 'Octavia E. Butler Landing' }, sites: [8, 2, 4, 6, 7] },
  { id: 'delta', title: 'Crossing to the ancient delta', region: 'Crater floor → delta front → upper fan', level: 2,
    lander: { sol: 13, name: 'Octavia E. Butler Landing' }, sites: [4, 10, 12, 14, 16, 19] },
  { id: 'rim', title: 'Expedition to the crater rim', region: 'Margin unit · Neretva Vallis · Witch Hazel Hill', level: 3,
    lander: { sol: 470, name: 'Delta front base camp' }, sites: [19, 24, 25, 26, 27, 28] },
];

function legCost(a, b) {
  const r = findRoute(elev, GW, GH, MPX, MPY, { x: a.u * (GW - 1), y: a.v * (GH - 1) }, { x: b.u * (GW - 1), y: b.v * (GH - 1) }, { maxSlopeDeg: ROVER.maxSlopeDeg, slopeWeight: 6 });
  return r.found ? pathCost(r.path, elev, therm, GW, MPX, MPY) : null;
}

const out = [];
for (const d of DEF) {
  const lw = wpAtSol(d.lander.sol);
  const nodes = [{ kind: 'lander', name: d.lander.name, u: lw.u, v: lw.v }].concat(d.sites.map(n => {
    const s = S.find(x => x.no === n);
    return { kind: 'site', no: n, name: s.name, feature: s.feature, rock: s.rock_type, type: s.sample_type, sol: s.sol, date: s.date, location: s.location, u: s.u, v: s.v, value: VALUE(s), cls: CLASS(s) };
  }));
  const N = nodes.length, C = Array.from({ length: N }, () => Array(N).fill(null));
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (i !== j) C[i][j] = legCost(nodes[i], nodes[j]);
  const best = (bat, win) => {
    let b = { score: 0, order: [], kwh: 0, h: 0 };
    const rec = (cur, rest, kwh, h, score) => {
      const last = cur.length ? cur[cur.length - 1] : 0, back = cur.length ? C[last][0] : { kwh: 0, h: 0 };
      if (back && kwh + back.kwh <= bat && h + back.h <= win && score > b.score) b = { score, order: [...cur], kwh: kwh + back.kwh, h: h + back.h };
      for (const k of rest) { const L = C[last][k]; if (!L) continue;
        const nk = kwh + L.kwh + ROVER.hotelKW * STOP_H, nh = h + L.h + STOP_H;
        if (nk > bat || nh > win) continue;
        rec([...cur, k], rest.filter(x => x !== k), nk, nh, score + Math.round(nodes[k].value * 1.5)); }
    };
    rec([], nodes.map((_, i) => i).slice(1), 0, 0, 0); return b;
  };
  console.log(`\n== ${d.title}`);
  for (let i = 1; i < N; i++) console.log(`  #${nodes[i].no} ${nodes[i].name.padEnd(16)} ${nodes[i].cls.padEnd(11)} ${nodes[i].value}pt  lander->: ${C[0][i] ? `${C[0][i].km.toFixed(2)} km ${C[0][i].kwh.toFixed(2)} kWh ${(C[0][i].h * 60).toFixed(0)} min` : 'NO ROUTE'}`);
  const max = nodes.slice(1).reduce((a, n) => a + Math.round(n.value * 1.5), 0);
  if (process.env.SWEEP) for (const bat of [8, 9, 10, 12, 14, 16, 18, 20, 24]) { const b = best(bat, 99); console.log(`  battery ${bat} kWh -> ${b.score}/${max} (${b.order.length} sites, ${b.h.toFixed(2)} h)`); }
  out.push({ d, nodes, max, best });
}

// chosen limits (from the sweep): battery kWh and daylight window h
const LIMITS = { floor: { battery: 6, window: 6 }, delta: { battery: 9, window: 6 }, rim: { battery: 16, window: 7 } };
const expeditions = out.map(({ d, nodes, max, best }) => {
  const L = LIMITS[d.id], b = best(L.battery, L.window);
  console.log(`[${d.id}] battery ${L.battery} kWh, window ${L.window} h -> best ${b.score}/${max} via ${b.order.map(i => '#' + nodes[i].no).join(' > ')} (${b.kwh.toFixed(2)} kWh, ${b.h.toFixed(2)} h)`);
  return { ...d, nodes, maxScore: max, battery: L.battery, window: L.window, best: { score: b.score, order: b.order.map(i => nodes[i].no), kwh: b.kwh, h: b.h } };
});
writeFileSync(`${OUT}/expeditions.json`, JSON.stringify({ rover: ROVER, expeditions }, null, 2));
