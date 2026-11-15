// Safe-route finder over a Mars elevation grid.
// A* least-cost path on an 8-connected grid: forbids slopes above a limit
// (impassable terrain / obstacles) and penalises steepness. Pure ESM, runs in
// Node and the browser. Elevations in metres, row-major (length = W*H).
//
// findRoute(elev, W, H, mppxX, mppxY, start, goal, opts) -> result

class MinHeap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(item) {
    const a = this.a; a.push(item); let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (a[p].f <= a[i].f) break;[a[p], a[i]] = [a[i], a[p]]; i = p; }
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) { a[0] = last; let i = 0; const n = a.length;
      for (;;) { let l = 2*i+1, r = 2*i+2, s = i;
        if (l < n && a[l].f < a[s].f) s = l; if (r < n && a[r].f < a[s].f) s = r;
        if (s === i) break;[a[s], a[i]] = [a[i], a[s]]; i = s; } }
    return top;
  }
}

const NB = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];

export function findRoute(elev, W, H, mppxX, mppxY, start, goal, opts = {}) {
  const maxSlopeDeg = opts.maxSlopeDeg ?? 25;   // above this = impassable
  const slopeWeight = opts.slopeWeight ?? 6;    // steepness penalty strength
  const pen = opts.cellPenalty || null;         // Float32Array(W*H) of extra cost factors >= 0
  const maxTan = Math.tan(maxSlopeDeg * Math.PI / 180);
  const diagMpp = Math.hypot(mppxX, mppxY);
  const sx = Math.max(0, Math.min(W-1, Math.round(start.x)));
  const sy = Math.max(0, Math.min(H-1, Math.round(start.y)));
  const gx = Math.max(0, Math.min(W-1, Math.round(goal.x)));
  const gy = Math.max(0, Math.min(H-1, Math.round(goal.y)));
  const minMpp = Math.min(mppxX, mppxY);
  const idx = (x, y) => y * W + x;
  const hcost = (x, y) => Math.hypot((x-gx)*mppxX, (y-gy)*mppxY); // admissible

  const g = new Float64Array(W*H).fill(Infinity);
  const came = new Int32Array(W*H).fill(-1);
  const closed = new Uint8Array(W*H);
  const open = new MinHeap();
  const s = idx(sx, sy);
  g[s] = 0; open.push({ i: s, x: sx, y: sy, f: hcost(sx, sy) });

  let found = false;
  while (open.size) {
    const cur = open.pop();
    if (closed[cur.i]) continue;
    closed[cur.i] = 1;
    if (cur.x === gx && cur.y === gy) { found = true; break; }
    const ze = elev[cur.i];
    for (const [dx, dy] of NB) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const ni = idx(nx, ny); if (closed[ni]) continue;
      const horiz = (dx && dy) ? diagMpp : (dx ? mppxX : mppxY);
      const dz = Math.abs(elev[ni] - ze);
      const tan = dz / horiz;
      if (tan > maxTan) continue;                 // impassable slope
      const slopeFrac = tan / maxTan;             // 0..1
      let step = horiz * (1 + slopeWeight * slopeFrac * slopeFrac);
      if (pen) step *= 1 + pen[ni];                // optional per-cell penalty (e.g. loose sand); keeps heuristic admissible
      const ng = g[cur.i] + step;
      if (ng < g[ni]) {
        g[ni] = ng; came[ni] = cur.i;
        open.push({ i: ni, x: nx, y: ny, f: ng + hcost(nx, ny) });
      }
    }
  }

  if (!found) return { found: false, reason: 'no passable path within slope limit' };

  // reconstruct
  const path = [];
  let ci = idx(gx, gy);
  while (ci !== -1) { path.push({ x: ci % W, y: (ci / W) | 0 }); ci = came[ci]; }
  path.reverse();

  // stats
  let lengthM = 0, maxSlope = 0, slopeSum = 0, segs = 0;
  for (let k = 1; k < path.length; k++) {
    const a = path[k-1], b = path[k];
    const horiz = Math.hypot((b.x-a.x)*mppxX, (b.y-a.y)*mppxY);
    const dz = Math.abs(elev[idx(b.x,b.y)] - elev[idx(a.x,a.y)]);
    lengthM += Math.hypot(horiz, dz);
    const sl = Math.atan2(dz, horiz) * 180/Math.PI;
    maxSlope = Math.max(maxSlope, sl); slopeSum += sl; segs++;
  }
  return {
    found: true,
    path,
    cells: path.length,
    lengthM,
    cost: g[idx(gx, gy)],
    maxSlopeDeg: maxSlope,
    avgSlopeDeg: segs ? slopeSum / segs : 0,
    start: { x: sx, y: sy }, goal: { x: gx, y: gy },
    params: { maxSlopeDeg, slopeWeight },
  };
}

// straight-line (great-for-contrast) distance between two grid cells, metres
export function straightLine(elev, W, mppxX, mppxY, start, goal) {
  const horiz = Math.hypot((goal.x-start.x)*mppxX, (goal.y-start.y)*mppxY);
  const dz = Math.abs(elev[goal.y*W+goal.x] - elev[start.y*W+start.x]);
  return Math.hypot(horiz, dz);
}
