// Jezero Field Tablet — Perseverance's real mission on real NASA terrain.
// Whole-crater context terrain + high-res zone, rover replay, guided tour, samples
// with real rover photos, safe-route planner and slope challenges.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { findRoute, straightLine } from './route.js';
import { createDrive } from './drive.js';
import { createHiRes } from './hirise.js';
import { loadModel } from './models.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const $ = (id) => document.getElementById(id);
const loadMsg = (t) => { $('loadMsg').textContent = t; };

// ================= DATA =================
loadMsg('Loading terrain data…');
const J = (u) => fetch(u).then(r => r.json()), B = (u) => fetch(u).then(r => r.arrayBuffer());
const [meta, cmeta, wpf, smp, mediaF, eBuf, cBuf] = await Promise.all([
  J('data/terrain_meta.json'), J('data/context_meta.json'), J('data/waypoints_local.json'),
  J('data/samples.json'), J('data/media.json'), B('data/elevation.f32'), B('data/context_elev.f32')]);
const elev = new Float32Array(eBuf), celev = new Float32Array(cBuf);
const GW = meta.grid.width, GH = meta.grid.height, WM = meta.width_m, HM = meta.height_m;
const MPX = meta.meters_per_px.x, MPY = meta.meters_per_px.y;
const CGW = cmeta.grid.width, CGH = cmeta.grid.height, CWM = cmeta.width_m, CHM = cmeta.height_m;
const DB = meta.bbox_crs, CB = cmeta.bbox_crs;
const EC = (DB.minX + DB.maxX) / 2, NC = (DB.minY + DB.maxY) / 2;     // world origin = centre of high-res zone
const S = 1 / 20;                                                       // 1 unit = 20 m
const E_MID = (meta.elev_min_m + meta.elev_max_m) / 2;
const EL_LO = cmeta.elev_min_m, EL_HI = cmeta.elev_max_m;
let EXAG = 2;
const WP = wpf.waypoints, SAMPLES = smp.samples, PLACED = SAMPLES.filter(s => s.placed), MEDIA = mediaF.media;
const SOL_MIN = WP[0].sol, SOL_MAX = WP[WP.length - 1].sol;
const R_MARS = 3396190, LAT_TS = 18.4663 * Math.PI / 180;
const ODO = []; { let m = 0; for (const w of WP) { m = Math.max(m, w.dist_total_m || 0); ODO.push(m / 1000); } }

// ================= GEO HELPERS =================
const uvToEN = (u, v) => ({ E: DB.minX + u * WM, N: DB.maxY - v * HM });
const enToUV = (E, N) => ({ u: (E - DB.minX) / WM, v: (DB.maxY - N) / HM });
const inZone = (E, N) => E >= DB.minX && E <= DB.maxX && N >= DB.minY && N <= DB.maxY;
const inCtx = (E, N) => E >= CB.minX && E <= CB.maxX && N >= CB.minY && N <= CB.maxY;
function bil(arr, w, h, fx, fy) {
  const x = Math.min(Math.max(fx, 0), 1) * (w - 1), y = Math.min(Math.max(fy, 0), 1) * (h - 1);
  const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(x0 + 1, w - 1), y1 = Math.min(y0 + 1, h - 1), a = x - x0, b = y - y0;
  return (arr[y0 * w + x0] * (1 - a) + arr[y0 * w + x1] * a) * (1 - b) + (arr[y1 * w + x0] * (1 - a) + arr[y1 * w + x1] * a) * b;
}
const elevUV = (u, v) => bil(elev, GW, GH, u, v);
function elevEN(E, N) {
  if (inZone(E, N)) { const { u, v } = enToUV(E, N); return elevUV(u, v); }
  return bil(celev, CGW, CGH, (E - CB.minX) / CWM, (CB.maxY - N) / CHM);
}
const yOf = (e) => (e - E_MID) * S * EXAG;
const wEN = (E, N, lift = 0, e = elevEN(E, N)) => new THREE.Vector3((E - EC) * S, yOf(e) + lift, (NC - N) * S);
const wUV = (u, v, lift = 0) => { const { E, N } = uvToEN(u, v); return wEN(E, N, lift); };
const toEN = (p) => ({ E: p.x / S + EC, N: NC - p.z / S });
function latLon(E, N) { return { lat: (N / R_MARS) * 180 / Math.PI, lon: (E / (R_MARS * Math.cos(LAT_TS))) * 180 / Math.PI }; }
const SLOPE = new Float32Array(GW * GH);
for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
  const xm = Math.max(0, x - 1), xp = Math.min(GW - 1, x + 1), ym = Math.max(0, y - 1), yp = Math.min(GH - 1, y + 1);
  const dx = (elev[y * GW + xp] - elev[y * GW + xm]) / ((xp - xm) * MPX), dy = (elev[yp * GW + x] - elev[ym * GW + x]) / ((yp - ym) * MPY);
  SLOPE[y * GW + x] = Math.atan(Math.hypot(dx, dy)) * 180 / Math.PI;
}
const slopeUV = (u, v) => SLOPE[Math.round(v * (GH - 1)) * GW + Math.round(u * (GW - 1))];
const earthDate = (sol) => new Date(Date.UTC(2021, 1, 18, 20, 55) + sol * 88775244).toISOString().slice(0, 10);
function wpIndexAtSol(s) { let i = 0; while (i + 1 < WP.length && WP[i + 1].sol <= s) i++; return i; }
const wpAtSol = (s) => WP[wpIndexAtSol(s)];
const odoAtSol = (s) => ODO[wpIndexAtSol(s)];

// ================= CONTENT =================
function rockColor(s) {
  const r = (s.rock_type || '').toLowerCase();
  if (s.sample_type === 'Atmospheric' || s.sample_type === 'Regolith') return '#a9b0ba';
  if (r.includes('carbonate')) return '#3ddcb0';
  if (s.location.startsWith('Crater Rim')) return '#c08bff';
  if (r.includes('igneous')) return '#ff7a59';
  return '#58a6ff';
}
const CAMPAIGNS = [
  { to: 9, name: 'Crater floor', blurb: 'The floor of Jezero is igneous rock — cooled magma. In Séítah the rover found olivine crystals 1–3 mm across that settled in a thick body of magma and were later altered by water. These rocks help date the crater and tell when water was present.' },
  { to: 18, name: 'Delta front', blurb: 'Layered sedimentary rock laid down where the river entered the lake. Fine lake sediments are among the best places to preserve chemical traces of past life — which is why the team sampled here so heavily.' },
  { to: 21, name: 'Upper fan', blurb: 'Sediments the river carried onto the top of the delta. Their grains come from far outside the crater, so they sample the wider watershed.' },
  { to: 24, name: 'Margin unit', blurb: 'Carbonate-rich rocks along the inner edge of the crater, possibly an ancient shoreline. On Earth, carbonates can preserve signs of microbial life. Comet Geyser is a silica-cemented carbonate.' },
  { to: 25, name: 'Neretva Vallis', blurb: 'The ancient river valley that fed the lake. Here the rover found Cheyava Falls, a rock with "leopard spot" patterns. In 2025 NASA called them a potential biosignature: microbes could have made them, but non-biological processes are still possible.' },
  { to: 30, name: 'Crater rim', blurb: 'Rocks from deep below the surface, thrown up by the impact that made Jezero. Samples include impact-altered rocks and serpentinite, which forms when water reacts with rock — a reaction that can release energy microbes could use.' },
];
const campaignOf = (no) => CAMPAIGNS.find(c => no <= c.to);
const sampleNo = (n) => PLACED.find(s => s.no === n);
const GUIDE = [
  { t: 'Touchdown', sol: 13, media: 13, where: 'Octavia E. Butler Landing',
    text: 'Perseverance landed here on February 18, 2021. To land safely it used Terrain-Relative Navigation: during descent it matched its camera views against an orbital CTX map of Jezero — the same kind of CTX data this map is built from.',
    look: 'Zoom in: the rover sits on flat crater floor, east of the delta it came to explore.' },
  { t: 'First flight on another planet', sol: 58, media: 58, where: 'Near the landing site',
    text: 'On April 19, 2021 (sol 58), the Ingenuity helicopter, carried to Mars by Perseverance, made the first powered, controlled flight on another planet nearby, while the rover watched from an overlook. Ingenuity went on to fly 72 times before a damaged rotor blade ended its mission in January 2024.',
    look: 'The photos are what the rover\'s cameras recorded around that sol.' },
  { t: 'Séítah: rocks from a magma chamber', sol: 262, media: 262, where: 'South Séítah', sample: 4,
    text: 'Séítah turned out to be igneous rock rich in olivine crystals 1–3 mm across, packed together as they settled in a thick body of magma. Later, water altered them. The team sealed four cores here.',
    look: 'Switch to the Slope or Thermal layer to see how rough and sandy Séítah is.' },
  { t: 'The delta front', sol: 490, media: 490, where: 'Delta front (Skinner Ridge)', sample: 10,
    text: 'The rover reached the base of the ancient river delta. These layered sedimentary rocks were deposited in a lake — exactly the kind of place where traces of past life could be preserved.',
    look: 'Elevation layer: watch the terrain rise from the old lake floor (blue) onto the delta.' },
  { t: 'A depot for Earth', sol: 654, media: 654, where: 'Three Forks sample depot',
    text: 'Between December 2022 and January 2023 the rover set 10 tubes down on the ground here — 9 rock, regolith and atmosphere samples plus 1 witness tube — as a backup cache for a future sample-return mission.',
    look: 'Open the Samples marked "Sample Depot" in NASA\'s table: #1, 2, 5, 7, 9, 11, 13, 15 and 18.' },
  { t: 'On top of the delta', sol: 749, media: 749, where: 'Upper fan', sample: 19,
    text: 'Perseverance climbed onto the top of the delta, where the river dropped sand and boulders carried from far outside the crater. Each grain is a sample of the wider watershed.',
    look: 'Compare the rover\'s height now with sol 13 in the mission clock.' },
  { t: 'Carbonates on the old shoreline', sol: 1088, media: 1088, where: 'Margin unit (Bunsen Peak)', sample: 24,
    text: 'Along the inner edge of the crater the rover studied carbonate-rich rocks that may mark an ancient shoreline. The "Comet Geyser" core is a silica-cemented carbonate — a rock type that can preserve signs of life on Earth.',
    look: '' },
  { t: 'Cheyava Falls: leopard spots', sol: 1212, media: 1212, where: 'Neretva Vallis', sample: 25,
    text: 'In July 2024 the rover found a rock with small "leopard spots" in an ancient river valley. In 2025 NASA said these features are a potential biosignature: they could have been made by microbes, but non-biological chemistry has not been ruled out. The core is called Sapphire Canyon.',
    look: 'Open sample #25 to see the CacheCam photo of the core inside its tube.' },
  { t: 'Climbing the crater rim', sol: 1401, media: 1401, where: 'Witch Hazel Hill', sample: 26,
    text: 'The rover drove up the crater rim to rocks that came from deep underground and were thrown up by the impact that made Jezero. Here it sealed serpentinite — rock formed when water reacts with olivine, a reaction that can release energy microbes could use.',
    look: 'Drive here yourself in Expeditions → “Expedition to the crater rim”.' },
  { t: 'Beyond the rim, today', sol: 2022, media: 2022, where: 'Outside Jezero crater',
    text: 'At the latest data point (sol 2022) Perseverance has driven 45 km and is exploring outside the crater rim. Since February 2026 it can pinpoint its own position on Mars to about 25 cm using onboard Mars Global Localization.',
    look: 'Press play on the timeline to replay the whole 45 km drive.' },
];
for (const g of GUIDE) { const s = g.sample ? sampleNo(g.sample) : null; const w = wpAtSol(g.sol); g.u = s ? s.u : w.u; g.v = s ? s.v : w.v; }
const EXPED = await J('data/expeditions.json');
const store = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } } };
const PLAY_SVG = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>', PAUSE_SVG = '<svg viewBox="0 0 24 24"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>';

// ================= RENDERER / SCENE =================
loadMsg('Building 3D scene…');
const host = $('scene');
const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.3;
host.appendChild(renderer.domElement);
const labels = new CSS2DRenderer();
labels.setSize(innerWidth, innerHeight);
Object.assign(labels.domElement.style, { position: 'absolute', top: '0', left: '0', pointerEvents: 'none' });
labels.domElement.className = 'labels-layer';
host.appendChild(labels.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x9a6448, 0.000045);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.5, 80000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.08; controls.maxPolarAngle = 1.48;
controls.minDistance = 4; controls.maxDistance = 9000; controls.zoomSpeed = 1.2;

// sky dome: Mars daytime gradient
{
  const sky = new THREE.Mesh(new THREE.SphereGeometry(40000, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x2a1714) }, mid: { value: new THREE.Color(0x8c4f36) }, hor: { value: new THREE.Color(0xd99a68) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 hor; varying vec3 vP; void main(){ float h = clamp(vP.y,0.0,1.0); vec3 c = mix(hor, mid, smoothstep(0.0,0.18,h)); c = mix(c, top, smoothstep(0.18,0.75,h)); gl_FragColor = vec4(c,1.0); }',
  }));
  scene.add(sky);
}
scene.add(new THREE.HemisphereLight(0xffdcc0, 0x3a2418, 0.75));
// soft image-based light so NASA's PBR models (metal, glass, solar cells) read correctly
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const sun = new THREE.DirectionalLight(0xfff0dc, 2.4); sun.position.set(-3000, 2200, -1200); scene.add(sun, sun.target);
const SUN0 = sun.position.clone(), SUN_DIR = SUN0.clone().normalize();
sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// ================= TEXTURES =================
loadMsg('Loading orbital imagery…');
const PAL = [[26, 15, 11], [88, 46, 29], [158, 90, 56], [211, 147, 99], [247, 218, 184]];
const lerpPal = (pal, t) => { t = Math.min(Math.max(t, 0), 1) * (pal.length - 1); const i = Math.min(Math.floor(t), pal.length - 2), f = t - i; return pal[i].map((a, k) => a + (pal[i + 1][k] - a) * f); };
const TL = new THREE.TextureLoader();
const texOpts = (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return t; };
// Mars tint is pre-rendered from the grayscale CTX data (build_tinted.js); gray versions load on demand.
function lazyGray(base, holder) { return () => holder.gray || (holder.gray = texOpts(TL.load(`data/${base}_gray.jpg`, () => { applyLayer(); }))); }
const [dMars, cMars] = await Promise.all([TL.loadAsync('data/detail_mars.jpg'), TL.loadAsync('data/context_mars.jpg')]);
const detailTex = { mars: texOpts(dMars) }, ctxTex = { mars: texOpts(cMars) };
let thermalTex = null;   // THEMIS night IR, loaded on first use
const getThermal = () => thermalTex || (thermalTex = { d: texOpts(TL.load('data/thermal_detail.jpg', () => applyLayer())), c: texOpts(TL.load('data/thermal_context.jpg', () => applyLayer())) });
const dGray = lazyGray('detail', detailTex), cGray = lazyGray('context', ctxTex);
Object.defineProperty(detailTex, 'grayT', { get: dGray }); Object.defineProperty(ctxTex, 'grayT', { get: cGray });
function canvasTex(w, h, fill) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'), im = x.createImageData(w, h);
  for (let i = 0; i < w * h; i++) { const [r, g, b] = fill(i); im.data[i * 4] = r; im.data[i * 4 + 1] = g; im.data[i * 4 + 2] = b; im.data[i * 4 + 3] = 255; }
  x.putImageData(im, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
const RAMP = [[30, 40, 92], [36, 110, 150], [92, 170, 130], [214, 196, 112], [222, 120, 70], [250, 240, 230]];
const elevColor = (e) => lerpPal(RAMP, (e - EL_LO) / (EL_HI - EL_LO));
const detailElevTex = canvasTex(GW, GH, i => elevColor(elev[i]));
const ctxElevTex = canvasTex(CGW, CGH, i => elevColor(celev[i]));
let slopeLimit = 25;
const SLOPE_CLASSES = () => [[5, [46, 140, 70], '<5°'], [10, [150, 205, 95], '5–10°'], [15, [250, 214, 60], '10–15°'], [slopeLimit, [250, 135, 30], `15–${slopeLimit}°`], [999, [225, 45, 45], `>${slopeLimit}° no-go`]];
function makeSlopeTex() { const C = SLOPE_CLASSES(); return canvasTex(GW, GH, i => { const s = SLOPE[i]; for (const [lim, col] of C) if (s < lim) return col; return C[C.length - 1][1]; }); }
let slopeTex = makeSlopeTex();

// ================= TERRAIN MESHES =================
function gridMesh(nx, ny, enAt, uvAt) {
  const g = new THREE.BufferGeometry(), p = new Float32Array(nx * ny * 3), uv = new Float32Array(nx * ny * 2), idx = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i, a = i / (nx - 1), b = j / (ny - 1), { E, N } = enAt(a, b);
    p[k * 3] = (E - EC) * S; p[k * 3 + 2] = (NC - N) * S; uv[k * 2] = a; uv[k * 2 + 1] = 1 - b;
    if (i < nx - 1 && j < ny - 1) idx.push(k, k + nx, k + 1, k + 1, k + nx, k + nx + 1);
  }
  g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx);
  g.userData = { nx, ny, enAt }; return g;
}
const detailGeo = gridMesh(GW, GH, (a, b) => uvToEN(a, b));
const ctxGeo = gridMesh(CGW, CGH, (a, b) => ({ E: CB.minX + a * CWM, N: CB.maxY - b * CHM }));
const SHRINK = 2.2 * CWM / (CGW - 1);
function updateHeights() {
  for (const [g, isCtx] of [[detailGeo, false], [ctxGeo, true]]) {
    const { nx, ny, enAt } = g.userData, p = g.attributes.position.array;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i, { E, N } = enAt(i / (nx - 1), j / (ny - 1));
      let y = isCtx ? yOf(celev[j * nx + i]) : yOf(elevEN(E, N));
      if (isCtx && E > DB.minX + SHRINK && E < DB.maxX - SHRINK && N > DB.minY + SHRINK && N < DB.maxY - SHRINK) y -= 30;
      p[k * 3 + 1] = y;
    }
    g.attributes.position.needsUpdate = true; g.computeVertexNormals(); g.computeBoundingSphere();
  }
}
updateHeights();
const detailMat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0, envMapIntensity: 0.15, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
const ctxMat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0, envMapIntensity: 0.15 });
const detailMesh = new THREE.Mesh(detailGeo, detailMat), ctxMesh = new THREE.Mesh(ctxGeo, ctxMat);
scene.add(ctxMesh, detailMesh);
// HiRISE 1 m tiles streamed around the rover / camera focus (cuts the CTX surface out underneath)
const hi = createHiRes({ THREE, scene, S, EC, NC, renderer, detailMat, yOf: (e) => yOf(e) });
// endless dusty ground under the data tiles, so the map does not float in the sky (drawn first, no depth write)
const ground = new THREE.Mesh(new THREE.PlaneGeometry(400000, 400000), new THREE.MeshStandardMaterial({ color: 0x6b4129, roughness: 1, envMapIntensity: 0.1, depthWrite: false }));
ground.rotation.x = -Math.PI / 2; ground.position.y = -260; ground.renderOrder = -1; scene.add(ground);

let layer = 'imagery', tint = true;
const NOTES = {
  imagery: 'MRO CTX orbital image (5 m/px). The data is grayscale; the Mars color tint is cosmetic and can be turned off.',
  elevation: `Height from the CTX DEM, ${EL_LO.toFixed(0)} m (deep blue, old lake floor) to ${EL_HI.toFixed(0)} m (white, rim peaks). Mars has no sea level — heights are relative to the areoid.`,
  slope: 'Slope computed from the 20 m DEM inside the high-res zone. Red = steeper than the planner limit: no-go for the route planner.',
  thermal: 'Mars Odyssey THEMIS night-time infrared (100 m/px). Solid rock stays warm after sunset; loose sand and dust cool fast. Bright = rocky, firm ground. Dark = sand or dust, where wheels and boots can sink. Relative brightness, not calibrated temperature.',
};
function applyLayer() {
  if (layer === 'imagery') { detailMat.map = tint ? detailTex.mars : detailTex.grayT; ctxMat.map = tint ? ctxTex.mars : ctxTex.grayT; ctxMat.color.set(0xffffff); }
  if (layer === 'elevation') { detailMat.map = detailElevTex; ctxMat.map = ctxElevTex; ctxMat.color.set(0xffffff); }
  if (layer === 'slope') { detailMat.map = slopeTex; ctxMat.map = ctxTex.mars; ctxMat.color.set(0x5a5a5a); }
  if (layer === 'thermal') { const th = getThermal(); detailMat.map = th.d; ctxMat.map = th.c; ctxMat.color.set(0xffffff); }
  detailMat.needsUpdate = ctxMat.needsUpdate = true;
  $('layerNote').textContent = NOTES[layer];
  document.querySelectorAll('#layerSeg button').forEach(b => b.classList.toggle('on', b.dataset.layer === layer));
  const L = $('legend');
  if (layer === 'slope') L.innerHTML = SLOPE_CLASSES().map(([, c, t]) => `<span><i style="background:rgb(${c})"></i>${t}</span>`).join('');
  else if (layer === 'thermal') L.innerHTML = `<span style="flex:1"><i style="width:100%;height:8px;border-radius:4px;background:linear-gradient(90deg,#0c0828,#46126e,#aa285f,#eb6428,#fcc846,#fffadc)"></i></span><span style="width:100%;justify-content:space-between;display:flex"><span>cool: sand / dust</span><span>warm: rock</span></span>`;
  else if (layer === 'elevation') L.innerHTML = [EL_LO, -2500, -2000, -1500, -1000, EL_HI].map(e => `<span><i style="background:rgb(${elevColor(e).map(Math.round)})"></i>${e.toFixed(0)} m</span>`).join('');
  else L.innerHTML = ['#ff7a59 Igneous', '#58a6ff Sedimentary', '#3ddcb0 Carbonate', '#c08bff Crater rim', '#a9b0ba Atmos./regolith'].map(x => { const [c, ...t] = x.split(' '); return `<span><i style="background:${c};border-radius:50%"></i>${t.join(' ')}</span>`; }).join('');
}
applyLayer();

// ================= LINES =================
const lineMats = [];
const lineMat = (o) => { const m = new LineMaterial({ linewidth: 3, ...o }); m.toneMapped = false; m.resolution.set(innerWidth, innerHeight); lineMats.push(m); return m; };
function makeLine(pts, mat, colors) { const g = new LineGeometry(); g.setPositions(pts.flatMap(p => [p.x, p.y, p.z])); if (colors) g.setColors(colors); const l = new Line2(g, mat); l.computeLineDistances(); return l; }

// high-res zone frame
let frameLine = null; const frameMat = lineMat({ color: 0xff8a4c, linewidth: 2, dashed: true, dashSize: 12, gapSize: 8 });
const zoneTagEl = document.createElement('div'); zoneTagEl.className = 'zone'; zoneTagEl.textContent = `HIGH-RES ZONE · ${(WM / 1000).toFixed(1)} × ${(HM / 1000).toFixed(1)} km`;
const zoneTag = new CSS2DObject(zoneTagEl); scene.add(zoneTag);
function buildFrame() {
  if (frameLine) scene.remove(frameLine);
  const pts = [], n = 120;
  for (let i = 0; i <= n; i++) pts.push(wUV(i / n, 0, 2));
  for (let i = 0; i <= n / 2; i++) pts.push(wUV(1, i / (n / 2), 2));
  for (let i = n; i >= 0; i--) pts.push(wUV(i / n, 1, 2));
  for (let i = n / 2; i >= 0; i--) pts.push(wUV(0, i / (n / 2), 2));
  frameLine = makeLine(pts, frameMat); scene.add(frameLine);
  zoneTag.position.copy(wUV(0.02, 0, 12));
}

// rover track
const TRACK = [];
for (let i = 0; i < WP.length; i++) {
  const a = WP[Math.max(0, i - 1)], b = WP[i], cells = Math.hypot((b.u - a.u) * (GW - 1), (b.v - a.v) * (GH - 1));
  const steps = i === 0 ? 1 : Math.max(1, Math.ceil(cells));
  for (let k = 1; k <= steps; k++) { const t = k / steps; TRACK.push({ u: a.u + (b.u - a.u) * t, v: a.v + (b.v - a.v) * t, sol: b.sol }); }
}
let TW = [];  // world positions
const trackMat = lineMat({ vertexColors: true, linewidth: 3.5 });
let trackLine = null;
function buildTrack() {
  if (trackLine) { scene.remove(trackLine); trackLine.geometry.dispose(); }
  TW = TRACK.map(t => wUV(t.u, t.v, 0));
  trackLine = makeLine(TRACK.map(t => wUV(t.u, t.v, 0.9)), trackMat, TRACK.map(() => [0, 0, 0]).flat());
  trackLine.visible = $('chkTrack').checked; scene.add(trackLine); lastColorSol = -1; colorTrack(curSol);
}
let lastColorSol = -1;
function colorTrack(sol) {
  if (!trackLine || sol === lastColorSol) return; lastColorSol = sol; const c = [];
  for (const t of TRACK) t.sol <= sol ? c.push(0.15, 0.85, 1) : c.push(0.42, 0.26, 0.17);
  trackLine.geometry.setColors(c);
}

// ================= ROVER MODEL =================
function buildRover() {
  const g = new THREE.Group();
  const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.2, ...o });
  const white = M(0xf4f0e8, { emissive: 0x3a3632 }), alu = M(0xb9bec6, { metalness: 0.75, roughness: 0.35 }), dark = M(0x23262c), gold = M(0xc9a24e, { metalness: 0.85, roughness: 0.3 }), grey = M(0x6c7178);
  const box = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); g.add(o); return o; };
  const cyl = (r1, r2, h, m, x, y, z, seg = 16) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), m); o.position.set(x, y, z); g.add(o); return o; };
  box(2.0, 0.55, 1.45, white, 0, 1.05, 0);            // body
  box(1.9, 0.06, 1.38, dark, 0, 1.36, 0);             // deck
  box(0.6, 0.12, 0.5, gold, -0.35, 1.44, 0.35);        // deck electronics
  box(1.0, 0.25, 0.08, grey, 0, 0.95, 0.75);           // side panels
  box(1.0, 0.25, 0.08, grey, 0, 0.95, -0.75);
  const wheels = [];
  for (const x of [-0.95, 0, 0.95]) for (const z of [-1.18, 1.18]) {
    const w = new THREE.Group(); w.position.set(x, 0.27, z);
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.4, 20), alu); tire.rotation.x = Math.PI / 2; w.add(tire);
    for (let k = 0; k < 6; k++) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.42, 0.06), grey); c.rotation.z = (k / 6) * Math.PI; c.position.z = z > 0 ? 0.21 : -0.21; w.add(c); }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.44, 12), dark); hub.rotation.x = Math.PI / 2; w.add(hub);
    g.add(w); wheels.push(w);
  }
  for (const z of [-1.0, 1.0]) {                        // rocker-bogie
    const r1 = box(1.25, 0.08, 0.08, white, 0.45, 0.62, z); r1.rotation.z = -0.35;
    const r2 = box(1.25, 0.08, 0.08, white, -0.48, 0.62, z); r2.rotation.z = 0.35;
    box(0.08, 0.5, 0.08, white, 0, 0.5, z); box(0.08, 0.5, 0.08, white, 0.95, 0.5, z); box(0.08, 0.5, 0.08, white, -0.95, 0.5, z);
  }
  const rtg = cyl(0.26, 0.26, 0.72, dark, -1.22, 1.25, 0); rtg.rotation.z = Math.PI / 2 - 0.55;   // RTG
  for (let k = 0; k < 8; k++) { const f = box(0.62, 0.02, 0.62, grey, -1.22, 1.25, 0); f.rotation.z = Math.PI / 2 - 0.55; f.rotation.x = (k / 8) * Math.PI; }
  cyl(0.06, 0.07, 1.25, white, 0.78, 1.95, 0.48);       // mast
  box(0.22, 0.26, 0.6, white, 0.82, 2.66, 0.48);        // mast head
  box(0.3, 0.2, 0.3, M(0xd9d4ca), 0.78, 2.9, 0.48);     // SuperCam
  for (const z of [0.3, 0.66]) { const l = cyl(0.05, 0.05, 0.08, dark, 0.95, 2.66, z, 12); l.rotation.z = Math.PI / 2; }
  const hga = cyl(0.32, 0.32, 0.05, M(0xdcd6cc), -0.35, 1.55, -0.45, 6); hga.rotation.x = 0.5;   // high-gain antenna
  cyl(0.02, 0.02, 0.6, grey, 0.4, 1.7, -0.55, 6);       // UHF
  const arm1 = box(0.85, 0.09, 0.09, white, 1.35, 1.0, -0.25); arm1.rotation.z = -0.2;   // robotic arm
  const arm2 = box(0.55, 0.08, 0.08, white, 1.78, 0.78, -0.25); arm2.rotation.z = 0.7;
  box(0.32, 0.32, 0.32, grey, 1.95, 0.55, -0.25);       // turret
  g.userData.wheels = wheels;
  return g;
}
const rover = new THREE.Group(); scene.add(rover);
const roverModel = buildRover(); rover.add(roverModel);
// official NASA/JPL Perseverance model (NASA 3D Resources) replaces the procedural one once loaded
loadModel('models/perseverance.glb', { length: 3.0 }).then(m => { for (const c of roverModel.children) c.visible = false; roverModel.add(m); }).catch(() => {});
const beacon = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0x4fd8ff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
rover.add(beacon);
const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 48), new THREE.MeshBasicMaterial({ color: 0x4fd8ff, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false, fog: false }));
ring.rotation.x = -Math.PI / 2; rover.add(ring);
const roverTagEl = document.createElement('div'); roverTagEl.className = 'tag'; roverTagEl.style.pointerEvents = 'auto'; roverTagEl.style.cursor = 'pointer';
roverTagEl.onclick = () => flyTo(rover.position.clone(), 60);
const roverTag = new CSS2DObject(roverTagEl); rover.add(roverTag);
let roverScale = 1, wheelSpin = 0;

// ================= SAMPLE PINS & GUIDE STOPS =================
const pinGroup = new THREE.Group(); scene.add(pinGroup);
const pins = []; const spot = {};
for (const s of PLACED) {
  const n = (spot[s.wp_sol] = (spot[s.wp_sol] || 0) + 1) - 1, col = rockColor(s);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1, 6), new THREE.MeshBasicMaterial({ color: col }));
  pinGroup.add(beam);
  const el = document.createElement('div'); el.className = 'pin'; el.style.background = col;
  el.innerHTML = `${s.no}<span class="nm">${s.name} · sol ${s.sol}</span>`;
  el.addEventListener('click', e => { e.stopPropagation(); openSample(s, true); });
  const label = new CSS2DObject(el); pinGroup.add(label);
  pins.push({ s, beam, label, el, off: n });
}
const stopGroup = new THREE.Group(); scene.add(stopGroup);
const stops = GUIDE.map((g, i) => {
  const el = document.createElement('div'); el.className = 'poi'; el.innerHTML = `<b>${i + 1}</b><span class="tt">${g.t}</span>`; el.title = g.t;
  el.addEventListener('click', e => { e.stopPropagation(); openGuide(i); });
  const label = new CSS2DObject(el); stopGroup.add(label);
  const r = new THREE.Mesh(new THREE.RingGeometry(0.75, 1, 40), new THREE.MeshBasicMaterial({ color: 0xff8a4c, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
  r.rotation.x = -Math.PI / 2; stopGroup.add(r);
  return { g, el, label, r };
});
function placeMarkers() {
  for (const p of pins) { const w = wUV(p.s.u, p.s.v); p.beam.scale.y = 16; p.beam.position.set(w.x, w.y + 8, w.z); p.beam.userData.y = w.y; p.label.position.set(w.x + p.off * 6, w.y + 18 + p.off * 5, w.z); }
  stops.forEach((s, i) => { const w = wUV(s.g.u, s.g.v); s.r.position.set(w.x, w.y + 1.5, w.z); s.label.position.set(w.x, w.y + 34 + (i % 3) * 16, w.z); });
}

// timeline ticks
for (const s of PLACED) { const t = document.createElement('span'); t.style.left = `${((s.sol - SOL_MIN) / (SOL_MAX - SOL_MIN)) * 100}%`; t.style.background = rockColor(s); t.title = `Sample #${s.no} ${s.name} — sol ${s.sol}`; t.onclick = () => openSample(s, true); $('ticks').appendChild(t); }
GUIDE.forEach((g, i) => { const t = document.createElement('span'); t.className = 'stop'; t.textContent = i + 1; t.style.left = `${((g.sol - SOL_MIN) / (SOL_MAX - SOL_MIN)) * 100}%`; t.title = `Stop ${i + 1}: ${g.t}`; t.onclick = () => openGuide(i); $('ticks').appendChild(t); });

// ================= MISSION STATE =================
let curSol = SOL_MIN, trackPos = 0, playing = false;
const trackIndexForSol = (s) => { let i = 0; while (i + 1 < TRACK.length && TRACK[i + 1].sol <= s) i++; return i; };
function setTrackPos(p, fromSlider = false) {
  trackPos = Math.max(0, Math.min(TRACK.length - 1, p));
  const i = Math.floor(trackPos), sol = TRACK[i].sol;
  if (sol !== curSol) onSolChange(curSol, sol);
  curSol = sol; if (!fromSlider) $('sol').value = sol;
  updateClock(); colorTrack(sol); placeRover();
}
function onSolChange(prev, now) {
  if (!playing) return;
  for (const s of PLACED) if (s.sol > prev && s.sol <= now) {
    toast(`Sample sealed · <b>${s.name}</b>`);
    const p = pins.find(x => x.s === s); p.el.classList.remove('pop'); void p.el.offsetWidth; p.el.classList.add('pop');
  }
  GUIDE.forEach((g, i) => { if (g.sol > prev && g.sol <= now) toast(`Stop ${i + 1} · <b>${g.t}</b>`); });
}
function updateClock() {
  const i = wpIndexAtSol(curSol);
  $('solNum').textContent = `Sol ${curSol}`; $('earthDate').textContent = earthDate(curSol);
  $('odo').textContent = `${ODO[i].toFixed(1)} km`; $('elevNow').textContent = `${WP[i].elev_m.toFixed(0)} m`;
  const sealed = SAMPLES.filter(s => s.sol != null && s.sol <= curSol);
  $('sampleCount').textContent = `${sealed.length} / 30`;
  const last = sealed[sealed.length - 1];
  $('campaign').textContent = last ? `Campaign: ${campaignOf(last.no).name} · last sample: ${last.name}` : 'Landing site · Octavia E. Butler Landing';
  for (const p of pins) p.el.classList.toggle('future', p.s.sol > curSol);
  roverTagEl.textContent = `PERSEVERANCE · SOL ${curSol}`;
}
function placeRover() {
  const i = Math.floor(trackPos), f = trackPos - i, a = TW[i], b = TW[Math.min(i + 1, TW.length - 1)];
  rover.position.lerpVectors(a, b, f);
  // heading from a point ~100 m ahead: stable at stops where consecutive points coincide (no spinning)
  let j = i; while (j < TW.length - 1 && j - i < 80 && Math.hypot(TW[j].x - a.x, TW[j].z - a.z) < 5) j++;
  const dx = TW[j].x - a.x, dz = TW[j].z - a.z;
  if (Math.hypot(dx, dz) > 1.5) {
    const target = Math.atan2(-dz, dx); let d = target - roverModel.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
    roverModel.rotation.y += d * (playing ? 0.08 : 1);
  }
}

// ================= DETAIL VIEW (guide stop / sample) =================
const CAM = { MCZ_LEFT: 'Mastcam-Z', NAVCAM_LEFT: 'Navcam', CACHECAM: 'CacheCam · core in its tube', FRONT_HAZCAM_LEFT_A: 'Front Hazcam' };
const CREDIT = (cam) => cam === 'MCZ_LEFT' ? 'NASA/JPL-Caltech/ASU' : 'NASA/JPL-Caltech';
function renderPhotos(sol) {
  const ORDER = { NAVCAM_LEFT: 0, FRONT_HAZCAM_LEFT_A: 1, MCZ_LEFT: 2, CACHECAM: 3 };
  const list = (MEDIA[sol] || []).slice().sort((a, b) => (ORDER[a.cam] ?? 9) - (ORDER[b.cam] ?? 9));
  const box = $('dPhotos'); box.innerHTML = '';
  if (!list.length) { box.innerHTML = '<div class="none">No raw images found for this sol.</div>'; return; }
  for (const m of list) {
    const f = document.createElement('figure');
    f.innerHTML = `<img loading="lazy" src="${m.url}" alt="${CAM[m.cam] || m.cam}, sol ${m.sol}"><figcaption>${CAM[m.cam] || m.cam} · sol ${m.sol}</figcaption>`;
    f.onclick = () => { $('lbImg').src = m.full || m.url; $('lbCap').textContent = `${CAM[m.cam] || m.cam} · sol ${m.sol} · ${m.date} — ${m.caption} Credit: ${CREDIT(m.cam)}`; $('lightbox').classList.remove('hidden'); };
    box.appendChild(f);
  }
}
let curGuide = -1, curSample = null;
const doneGuide = new Set();
function showDetail() { $('guideView').classList.add('hidden'); $('detailView').classList.remove('hidden'); $('left').scrollTop = 0; }
function openGuide(i) {
  stopPlay(); curGuide = i; curSample = null; doneGuide.add(i); renderGuideList();
  const g = GUIDE[i]; showDetail();
  $('dKicker').textContent = `STOP ${i + 1} OF ${GUIDE.length} · SOL ${g.sol} · ${earthDate(g.sol)}`;
  $('dTitle').textContent = g.t; $('dMeta').textContent = g.where; $('dText').textContent = g.text; $('dLook').textContent = g.look || '';
  renderPhotos(g.media);
  $('btnPrev').disabled = i === 0; $('btnNext').textContent = i === GUIDE.length - 1 ? 'All stops' : 'Next stop';
  $('dSrc').textContent = 'Photos · NASA Mars 2020 raw images'; $('dSrc').href = 'https://mars.nasa.gov/mars2020/multimedia/raw-images/';
  stops.forEach((s, k) => s.el.classList.toggle('on', k === i)); for (const p of pins) p.el.classList.remove('sel');
  setTrackPos(trackIndexForSol(g.sol)); curSol = g.sol; $('sol').value = g.sol; updateClock();
  flyTo(wUV(g.u, g.v), i === GUIDE.length - 1 ? 260 : 170);
}
function openSample(s, fly) {
  stopPlay(); curSample = s; curGuide = -1; showDetail();
  const c = campaignOf(s.no);
  $('dKicker').textContent = `SAMPLE #${s.no} OF 30 · SOL ${s.sol} · ${s.date}`;
  $('dTitle').textContent = s.name; $('dMeta').textContent = `Rock "${s.feature}" · ${s.location} · ${s.rock_type}`;
  $('dText').textContent = c.blurb;
  $('dLook').textContent = `Sealed by the team on sol ${s.sol}. ${s.sample_type}${s.height_cm ? `, ${s.height_cm} cm long` : ''}.`;
  renderPhotos(s.sol);
  const k = PLACED.indexOf(s); $('btnPrev').disabled = k === 0; $('btnNext').textContent = k === PLACED.length - 1 ? 'All stops' : 'Next sample';
  $('dSrc').textContent = 'Source · NASA sample table'; $('dSrc').href = smp.source;
  for (const p of pins) p.el.classList.toggle('sel', p.s === s); stops.forEach(st => st.el.classList.remove('on'));
  setTrackPos(trackIndexForSol(s.sol)); curSol = s.sol; $('sol').value = s.sol; updateClock();
  if (fly) flyTo(wUV(s.u, s.v), 90);
}
function backToGuide() { curGuide = -1; curSample = null; $('detailView').classList.add('hidden'); $('guideView').classList.remove('hidden'); }
$('btnBack').onclick = backToGuide;
$('btnPrev').onclick = () => { if (curGuide > 0) openGuide(curGuide - 1); else if (curSample) { const k = PLACED.indexOf(curSample); if (k > 0) openSample(PLACED[k - 1], true); } };
$('btnNext').onclick = () => {
  if (curGuide >= 0) return curGuide < GUIDE.length - 1 ? openGuide(curGuide + 1) : backToGuide();
  if (curSample) { const k = PLACED.indexOf(curSample); return k < PLACED.length - 1 ? openSample(PLACED[k + 1], true) : backToGuide(); }
};
function renderGuideList() {
  $('guideList').innerHTML = '';
  GUIDE.forEach((g, i) => {
    const li = document.createElement('li'); li.className = (i === curGuide ? 'on ' : '') + (doneGuide.has(i) ? 'done' : '');
    const th = (MEDIA[g.media] || []).find(m => m.cam === 'NAVCAM_LEFT') || (MEDIA[g.media] || [])[0];
    li.innerHTML = `<div class="gthumb" style="${th ? `background-image:url('${th.url}')` : ''}"><span>${i + 1}</span></div><div><div class="gt">${g.t}</div><div class="gs">Sol ${g.sol} · ${earthDate(g.sol)} · ${g.where}</div></div>`;
    li.onclick = () => openGuide(i); $('guideList').appendChild(li);
  });
}
renderGuideList();
$('lightbox').onclick = () => $('lightbox').classList.add('hidden');

// ================= CAMERA =================
let fly = null;
function flyTo(target, dist, fromDir) {
  const dir = (fromDir || camera.position.clone().sub(controls.target)).normalize();
  if (dir.y < 0.35) { dir.y = 0.35; dir.normalize(); }
  fly = { t: 0, fT: controls.target.clone(), tT: target.clone(), fP: camera.position.clone(), tP: target.clone().add(dir.multiplyScalar(dist)) };
}
const CTR = wEN((CB.minX + CB.maxX) / 2, (CB.minY + CB.maxY) / 2);
const overview = () => flyTo(new THREE.Vector3(CTR.x, 0, CTR.z), 5200, new THREE.Vector3(0.15, 0.85, 0.75));
camera.position.set(CTR.x + 600, 4400, CTR.z + 3600); controls.target.set(CTR.x, 0, CTR.z);
$('btnOverview').onclick = overview;
$('btnRover').onclick = () => flyTo(rover.position.clone(), 70);

// ================= PICKING (heightfield ray-march) =================
const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
function pick(ev) {
  const r = renderer.domElement.getBoundingClientRect();
  mouse.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(mouse, camera);
  const o = ray.ray.origin, d = ray.ray.direction;
  let t = 0, step = Math.max(0.5, camera.position.distanceTo(controls.target) * 0.004), prevT = 0;
  for (let k = 0; k < 3000; k++) {
    const p = o.clone().addScaledVector(d, t), { E, N } = toEN(p);
    if (!inCtx(E, N) && t > 200000) return null;
    if (inCtx(E, N) && p.y < yOf(elevEN(E, N))) {
      let lo = prevT, hi = t;
      for (let b = 0; b < 14; b++) { const m = (lo + hi) / 2, q = o.clone().addScaledVector(d, m), en = toEN(q); if (q.y < yOf(elevEN(en.E, en.N))) hi = m; else lo = m; }
      const q = o.clone().addScaledVector(d, hi); return { ...toEN(q), p: q };
    }
    prevT = t; t += step; step *= 1.004;
  }
  return null;
}

// ================= ROUTE PLANNER =================
let planMode = 0, pA = null, pB = null, routeLine = null, compare = null;
const routeMat = lineMat({ color: 0xffffff, linewidth: 4.5 });
const mk = (c) => { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: c })); m.visible = false; scene.add(m); return m; };
const markA = mk(0x5bd48a), markB = mk(0xff4fd8);
function drawRoute(path) {
  if (routeLine) { scene.remove(routeLine); routeLine.geometry.dispose(); routeLine = null; }
  if (path) { routeLine = makeLine(path.map(c => wUV(c.x / (GW - 1), c.y / (GH - 1), 1.6)), routeMat); scene.add(routeLine); }
}
function placeMarks() {
  for (const [m, p] of [[markA, pA], [markB, pB]]) { m.visible = !!p; if (p) m.position.copy(wUV(p.u, p.v, 2)); }
}
// THEMIS night-IR on the planner grid: 0 = coolest (loose sand/dust) .. 1 = warmest (rock)
let THERM = null, SAND_PEN = null;
fetch('data/thermal_grid.f32').then(r => r.arrayBuffer()).then(b => {
  THERM = new Float32Array(b); SAND_PEN = new Float32Array(THERM.length);
  for (let i = 0; i < THERM.length; i++) { const d = Math.max(0, (0.5 - THERM[i]) / 0.5); SAND_PEN[i] = 3 * d * d; }
});
const LOOSE = 0.3;   // below this normalized night-IR value we call ground "loose"
function routeFor(limit) {
  const s = { x: pA.u * (GW - 1), y: pA.v * (GH - 1) }, g = { x: pB.u * (GW - 1), y: pB.v * (GH - 1) };
  const avoid = $('chkSand').checked && SAND_PEN;
  return findRoute(elev, GW, GH, MPX, MPY, s, g, { maxSlopeDeg: limit, slopeWeight: 6, cellPenalty: avoid ? SAND_PEN : null });
}
const looseShare = (path) => THERM ? path.filter(c => THERM[c.y * GW + c.x] < LOOSE).length / path.length : null;
const st = (k, v, o = {}) => `<div class="st${o.full ? ' full' : ''}"><div class="k">${k}</div><div class="v${o.cls ? ' ' + o.cls : ''}">${v}</div></div>`;
const stMsg = (t, cls = '') => `<div class="st full"><div class="msg ${cls}">${t}</div></div>`;
function setOut(html) { const o = $('routeOut'); o.className = html ? 'statgrid' : 'statgrid empty'; o.innerHTML = html || 'No route yet'; }
function runRoute() {
  placeMarks(); if (!pA || !pB) return null;
  const t0 = performance.now(), r = routeFor(slopeLimit), ms = performance.now() - t0;
  if (!r.found) { drawRoute(null); clearEVA(); setOut(stMsg(`No passable route under ${slopeLimit}°. The terrain is too steep — raise the slope limit.`, 'bad')); return r; }
  drawRoute(r.path);
  const sl = straightLine(elev, GW, MPX, MPY, r.start, r.goal), ls = looseShare(r.path);
  let html = st('Safe route', `${(r.lengthM / 1000).toFixed(2)} km`)
    + st('Straight line', `${(sl / 1000).toFixed(2)} km<small>+${Math.max(0, (r.lengthM / sl - 1) * 100).toFixed(0)}%</small>`)
    + st('Max slope', `${r.maxSlopeDeg.toFixed(1)}°<small>limit ${slopeLimit}°</small>`)
    + st('Avg slope', `${r.avgSlopeDeg.toFixed(1)}°`);
  if (ls != null) html += st('Loose ground', `${(ls * 100).toFixed(0)}%<small>${$('chkSand').checked ? 'avoiding' : 'thermal'}</small>`);
  html += st('Solved in', `${ms.toFixed(0)} ms<small>${(GW * GH / 1000).toFixed(0)}k cells</small>`);
  if (compare) { const km = Math.abs(odoAtSol(compare.b.sol) - odoAtSol(compare.a.sol));
    html += stMsg(`Perseverance drove <b>${km.toFixed(2)} km</b> between these samples (sol ${compare.a.sol}–${compare.b.sol}). Its path is longer: it stopped for science and avoided rocks a 20 m grid can't see.`); }
  setOut(html); updateEVA(r);
  return r;
}
function setPlan(on) { planMode = on ? 1 : 0; $('btnPlan').classList.toggle('active', on); $('btnPlan').textContent = on ? 'Click the start point…' : 'Pick two points on the map'; renderer.domElement.style.cursor = on ? 'crosshair' : ''; }
for (const sel of [$('fromSample'), $('toSample')]) for (const s of PLACED) { const o = document.createElement('option'); o.value = s.no; o.textContent = `#${s.no} ${s.name} (sol ${s.sol})`; sel.appendChild(o); }
$('fromSample').value = 25; $('toSample').value = 28;
$('btnPlan').onclick = () => { stopPlay(); setPlan(!planMode); };
$('btnClear').onclick = () => { pA = pB = null; compare = null; drawRoute(null); placeMarks(); setPlan(false); clearEVA(); setOut(''); };
$('btnCompare').onclick = () => {
  const a = sampleNo(+$('fromSample').value), b = sampleNo(+$('toSample').value);
  if (a === b) return toast('Pick two different samples');
  pA = { u: a.u, v: a.v }; pB = { u: b.u, v: b.v }; compare = { a, b }; setPlan(false); runRoute();
  const m = wUV((a.u + b.u) / 2, (a.v + b.v) / 2); flyTo(m, Math.max(140, Math.hypot((a.u - b.u) * WM, (a.v - b.v) * HM) * S * 1.2));
};
function setSlope(v, rerun = true) {
  slopeLimit = v; $('slopeLim').value = v; $('slopeLimV').textContent = `${v}°`;
  slopeTex.dispose(); slopeTex = makeSlopeTex(); applyLayer();
  if (rerun && pA && pB) runRoute();
}
$('slopeLim').oninput = e => { $('slopeLimV').textContent = `${e.target.value}°`; };
$('chkSand').onchange = e => { if (e.target.checked) { layer = 'thermal'; applyLayer(); } if (pA && pB) runRoute(); };
$('slopeLim').onchange = e => setSlope(+e.target.value);

// ================= MARSWALK (CREW EVA) =================
let evaRoute = null, walk = null;
const astro = (() => {
  const g = new THREE.Group();
  const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.1, ...o });
  const suit = M(0xf3efe8, { emissive: 0x3a3632 }), orange = M(0xff7a3c, { emissive: 0x401a08 }), visor = M(0xd8a640, { metalness: 0.9, roughness: 0.2 });
  const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); g.add(o); return o; };
  const legL = add(new THREE.CylinderGeometry(0.12, 0.11, 0.85, 10), suit, 0, 0.45, 0.13);
  const legR = add(new THREE.CylinderGeometry(0.12, 0.11, 0.85, 10), suit, 0, 0.45, -0.13);
  add(new THREE.BoxGeometry(0.34, 0.64, 0.52), suit, 0, 1.18, 0);              // torso
  add(new THREE.BoxGeometry(0.28, 0.56, 0.46), M(0xdedad2), -0.3, 1.22, 0);     // life-support pack
  add(new THREE.BoxGeometry(0.35, 0.08, 0.53), orange, 0.005, 1.05, 0);         // suit stripe
  for (const z of [-0.34, 0.34]) add(new THREE.CylinderGeometry(0.08, 0.07, 0.62, 8), suit, 0, 1.18, z);
  add(new THREE.SphereGeometry(0.21, 18, 14), suit, 0.02, 1.68, 0);              // helmet
  add(new THREE.SphereGeometry(0.18, 16, 12, Math.PI - 0.9, 1.8, 1.0, 0.9), visor, 0.06, 1.68, 0);
  g.userData.legs = [legL, legR]; return g;
})();
const astroWrap = new THREE.Group(); astroWrap.add(astro); astroWrap.visible = false; scene.add(astroWrap);
const astroTagEl = document.createElement('div'); astroTagEl.className = 'tag'; astroTagEl.style.background = '#ffb27a';
const astroTag = new CSS2DObject(astroTagEl); astroWrap.add(astroTag);
const turnMark = mk(0xffd23f);
const hm = (h) => { const m = Math.round(h * 60); return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`; };
const tobler = (slope) => 6 * Math.exp(-3.5 * Math.abs(slope + 0.05));   // km/h on foot (Earth)
function evaPlan(path) {
  const pace = +$('pace').value, n = path.length, E = path.map(c => elev[c.y * GW + c.x]);
  const F = [0], D = [0], Bk = [0], seg = [];
  for (let i = 1; i < n; i++) {
    const h = Math.hypot((path[i].x - path[i - 1].x) * MPX, (path[i].y - path[i - 1].y) * MPY), dz = E[i] - E[i - 1];
    const tf = h / 1000 / (tobler(dz / h) * pace), tb = h / 1000 / (tobler(-dz / h) * pace);
    seg.push({ dz }); F.push(F[i - 1] + tf); D.push(D[i - 1] + h / 1000); Bk.push(Bk[i - 1] + tb);
  }
  let gain = 0, loss = 0; for (const s of seg) s.dz > 0 ? gain += s.dz : loss -= s.dz;
  const out = F[n - 1], back = Bk[n - 1], budget = +$('evaBudget').value;
  let turn = n - 1; if (out + back > budget) { turn = 0; for (let i = 0; i < n; i++) if (F[i] + Bk[i] <= budget) turn = i; }
  return { E, F, D, Bk, out, back, gain, loss, budget, turn, n, km: D[n - 1] };
}
function updateEVA(r) {
  evaRoute = r; const p = evaPlan(r.path); r.plan = p; $('eva').classList.remove('hidden');
  const total = p.out + p.back, dose = 0.64 * total / 24, fits = total <= p.budget;
  $('evaOut').innerHTML = st('Outbound', hm(p.out)) + st('Return', hm(p.back))
    + st('Round trip', `${hm(total)}<small>${(p.km * 2).toFixed(1)} km</small>`) + st('Climb', `+${p.gain.toFixed(0)} m<small>−${p.loss.toFixed(0)} m</small>`)
    + st('Dose', `~${(dose * 1000).toFixed(0)} µSv`) + st('Budget', fits ? 'Fits' : 'Over', { cls: fits ? 'ok' : 'bad' })
    + stMsg(fits ? `${hm(p.budget - total)} left for science at the target.` : `Over by ${hm(total - p.budget)}. Turn back after ${p.D[p.turn].toFixed(2)} km (yellow marker), or drive the crew by rover.`);
  turnMark.visible = total > p.budget;
  if (turnMark.visible) { const c = r.path[p.turn]; turnMark.position.copy(wUV(c.x / (GW - 1), c.y / (GH - 1), 2.5)); turnMark.scale.setScalar(1.6); }
  drawProfile(p);
}
function drawProfile(p) {
  const W = 300, H = 100, lo = Math.min(...p.E), hi = Math.max(...p.E), rg = Math.max(hi - lo, 1);
  const X = (d) => (d / p.km) * W, Y = (e) => H - 8 - ((e - lo) / rg) * (H - 16);
  const pts = p.E.map((e, i) => `${X(p.D[i]).toFixed(1)},${Y(e).toFixed(1)}`).join(' ');
  const tx = X(p.D[p.turn]);
  $('profile').innerHTML = `<defs><linearGradient id="pg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff8a4c" stop-opacity=".55"/><stop offset="1" stop-color="#ff8a4c" stop-opacity="0"/></linearGradient></defs>`
    + `<polygon points="0,${H} ${pts} ${W},${H}" fill="url(#pg)"/><polyline points="${pts}" fill="none" stroke="#ffb27a" stroke-width="1.8" vector-effect="non-scaling-stroke"/>`
    + (p.turn < p.n - 1 ? `<line x1="${tx}" y1="0" x2="${tx}" y2="${H}" stroke="#ffd23f" stroke-width="1.5" stroke-dasharray="4 3" vector-effect="non-scaling-stroke"/>` : '')
    + `<line id="profDot" x1="0" y1="0" x2="0" y2="${H}" stroke="#fff" stroke-width="1.5" vector-effect="non-scaling-stroke" opacity="0"/>`;
  $('profLbl').innerHTML = `<span>elevation ${lo.toFixed(0)} … ${hi.toFixed(0)} m</span><span>${p.km.toFixed(2)} km →</span>`;
  evaRoute.profX = X;
}
function clearEVA() { $('eva').classList.add('hidden'); evaRoute = null; walk = null; astroWrap.visible = false; turnMark.visible = false; }
$('evaBudget').oninput = e => { $('evaBudgetV').textContent = `${e.target.value} h`; if (evaRoute) updateEVA(evaRoute); };
$('pace').oninput = e => { $('paceV').textContent = `${Math.round(e.target.value * 100)}%`; if (evaRoute) updateEVA(evaRoute); };
$('btnWalk').onclick = () => {
  if (!evaRoute) return; stopPlay();
  const p = evaRoute.plan; walk = { i: 0, end: p.turn, speed: Math.max(0.35, p.n / 900) };
  astroWrap.visible = true; const c = evaRoute.path[0]; layer = 'imagery'; applyLayer();
  flyTo(wUV(c.x / (GW - 1), c.y / (GH - 1)), 60);
  toast('EVA started');
};

// ================= CREW-ROVER EXPEDITIONS =================
const hhmm = (h) => { const m = Math.round(h * 60); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };
function sceneForMission(on) {
  showPins(!on && $('chkSamples').checked); showStops(!on && $('chkStops').checked);
  if (trackLine) trackLine.visible = !on && $('chkTrack').checked;
  rover.visible = !on; roverTag.visible = !on;
  if (on) { pA = pB = null; compare = null; drawRoute(null); placeMarks(); clearEVA(); setOut(''); }
}
const drive = createDrive({ THREE, scene, camera, controls, CSS2DObject, $, toast, store, wUV, elevUV, GW, GH, MPX, MPY, WM, HM, S, findRoute, lineMat, makeLine, MEDIA, CAM,
  EXPED, SLOPE, elev, therm: () => THERM, exag: () => EXAG,
  latLonUV: (u, v) => { const { E, N } = uvToEN(u, v); return latLon(E, N); },
  blurbFor: (no) => (campaignOf(no).blurb.match(/^[^.]*\./) || [''])[0],
  sceneMode: sceneForMission, setLayer: (l) => { layer = l; applyLayer(); },
  groundY: (x, z) => { const E = x / S + EC, N = NC - z / S, h = hi.heightAt(E, N); return yOf(h ?? elevEN(E, N)); },
  canvas: renderer.domElement,
  shadows: (on) => {
    renderer.shadowMap.enabled = on; sun.castShadow = on; detailMesh.receiveShadow = on; ctxMesh.receiveShadow = on;
    detailMat.needsUpdate = ctxMat.needsUpdate = true;
    if (!on) { sun.position.copy(SUN0); sun.target.position.set(0, 0, 0); sun.target.updateMatrixWorld(); }
  },
  sunFollow: (p, d) => {
    sun.position.copy(p).addScaledVector(SUN_DIR, 400); sun.target.position.copy(p); sun.target.updateMatrixWorld();
    const c = sun.shadow.camera, r = Math.max(10, d * 2.4);
    if (Math.abs(c.right - r) > 0.5) { c.left = -r; c.right = r; c.top = r; c.bottom = -r; c.near = 1; c.far = 1200; c.updateProjectionMatrix(); }
  },
  onExit: () => selectTab('missions'),
});
function exitMission() { drive.exit(); }

// ================= MODES, INTRO, COACH MARKS =================
let mode = null;
let curTab = 'layers';
function selectTab(name) {
  curTab = name;
  document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x.dataset.tab === name));
  document.querySelectorAll('[data-pane]').forEach(p => p.classList.toggle('hidden', p.dataset.pane !== name));
  if (name === 'route') { layer = 'slope'; applyLayer(); }
}
function setViewOffset() {
  if (document.body.classList.contains('intro-on') && innerWidth > 900) camera.setViewOffset(innerWidth, innerHeight, -innerWidth * 0.2, 0, innerWidth, innerHeight);
  else camera.clearViewOffset();
}
function setMode(m) {
  mode = m; document.body.classList.remove('intro-on'); $('intro').classList.add('hidden'); controls.autoRotate = false; setViewOffset();
  document.body.classList.toggle('mode-drive', m === 'drive');
  document.querySelectorAll('#modes button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
  if (m !== 'drive') exitMission();
  if (m === 'tour') { selectTab('layers'); layer = 'imagery'; applyLayer(); openGuide(curGuide >= 0 ? curGuide : 0); }
  if (m === 'drive') { stopPlay(); selectTab('missions'); flyTo(wUV(0.5, 0.5), 900, new THREE.Vector3(0.1, 0.8, 0.6)); }
  if (m === 'explore') { selectTab('layers'); backToGuide(); if (!store.get('jft-coach')) setTimeout(() => startCoach(MAIN_COACH, 'jft-coach'), 700); }
}
function goHome() {
  exitMission(); stopPlay(); mode = null;
  document.body.classList.add('intro-on'); document.body.classList.remove('mode-drive'); $('intro').classList.remove('hidden'); $('introMain').classList.remove('hidden');
  controls.autoRotate = true; setViewOffset(); overview();
}
document.querySelectorAll('.mc').forEach(b => b.onclick = () => setMode(b.dataset.go));
document.querySelectorAll('#modes button').forEach(b => b.onclick = () => setMode(b.dataset.mode));
$('btnHome').onclick = goHome;

const MAIN_COACH = [
  { sel: '#left', title: 'Mission tour', text: 'Ten real stops, from landing to today. Open one: the camera flies there and you see what the rover saw.' },
  { sel: '#right', title: 'Data layers and tools', text: 'Switch between imagery, elevation, slope and thermal data. Plan safe routes and start EVA missions.' },
  { sel: '#timeline', title: 'Replay the drive', text: 'Press play to watch Perseverance cover 45 km, sol by sol.' },
  { sel: '#modes', title: 'Three modes', text: 'Jump between the tour, EVA missions and free exploration at any time.' },
];
let coach = null;
function startCoach(steps, key) { coach = { steps, key, i: 0 }; $('coach').classList.remove('hidden'); showCoach(); }
function showCoach() {
  const c = coach.steps[coach.i], el = document.querySelector(c.sel);
  const r = el ? el.getBoundingClientRect() : null;           // fixed panels have no offsetParent, so test real size
  if (!r || (!r.width && !r.height)) return nextCoach();
  const pad = 6, sp = $('coachSpot'), tip = $('coachTip');
  Object.assign(sp.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
  $('coachStep').textContent = `${coach.i + 1} / ${coach.steps.length}`; $('coachTitle').textContent = c.title; $('coachText').textContent = c.text;
  $('coachNext').textContent = coach.i === coach.steps.length - 1 ? 'Got it' : 'Next';
  const tw = 290, th = tip.offsetHeight || 160; let x, y;
  if (r.top > innerHeight * 0.72) { x = r.left + r.width / 2 - tw / 2; y = r.top - th - 20; }
  else if (r.left > innerWidth * 0.55) { x = r.left - tw - 20; y = r.top + 12; }
  else if (r.width > innerWidth * 0.3 || r.bottom < 120) { x = r.left + r.width / 2 - tw / 2; y = r.bottom + 20; }
  else { x = r.right + 20; y = r.top + 12; }
  Object.assign(tip.style, { left: `${Math.max(14, Math.min(innerWidth - tw - 14, x))}px`, top: `${Math.max(14, Math.min(innerHeight - th - 14, y))}px` });
}
function nextCoach() { if (!coach) return; coach.i++; if (coach.i >= coach.steps.length) return endCoach(); showCoach(); }
function endCoach() { if (coach) store.set(coach.key, 1); coach = null; $('coach').classList.add('hidden'); }
$('coachNext').onclick = nextCoach; $('coachSkip').onclick = endCoach;
$('btnHelp').onclick = () => { if (drive.active()) drive.showKeys(); else startCoach(MAIN_COACH, 'jft-coach'); };

// ================= UI WIRING =================
document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => selectTab(b.dataset.tab));
document.querySelectorAll('#layerSeg button').forEach(b => b.onclick = () => { layer = b.dataset.layer; applyLayer(); });
$('chkTint').onchange = e => { tint = e.target.checked; applyLayer(); };
$('chkTrack').onchange = e => { if (trackLine) trackLine.visible = e.target.checked; };
// CSS2DRenderer sets each label's display from object.visible every frame, so toggle the objects
function showPins(v) { pinGroup.visible = v; for (const p of pins) p.label.visible = v; }
function showStops(v) { stopGroup.visible = v; for (const s of stops) s.label.visible = v; }
$('chkSamples').onchange = e => showPins(e.target.checked && !drive.active());
$('chkStops').onchange = e => showStops(e.target.checked && !drive.active());
$('exag').oninput = e => {
  EXAG = +e.target.value; $('exagV').textContent = `×${EXAG}`; rebuildAll(); if (pA && pB) runRoute();
  drive.onExag(); hi.rebuild();
};
$('sol').oninput = e => { stopPlay(); setTrackPos(trackIndexForSol(+e.target.value), true); };
function stopPlay() { playing = false; $('btnPlay').innerHTML = PLAY_SVG; }
function startPlay() { if (trackPos >= TRACK.length - 2) setTrackPos(0); playing = true; $('btnPlay').innerHTML = PAUSE_SVG; if ($('chkFollow').checked) { fly = null; const off = camera.position.clone().sub(controls.target); if (off.length() > 400 || off.length() < 60) off.setLength(220); controls.target.copy(rover.position); camera.position.copy(rover.position).add(off); } }
$('btnPlay').onclick = () => playing ? stopPlay() : startPlay();
addEventListener('keydown', e => {
  if (e.key === 'Escape') { setPlan(false); $('lightbox').classList.add('hidden'); endCoach(); }
  if (e.key === ' ' && e.target === document.body && !drive.active() && mode) { e.preventDefault(); playing ? stopPlay() : startPlay(); }
});

let down = null;
renderer.domElement.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; });
renderer.domElement.addEventListener('pointerup', e => {
  if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5 || !planMode) return;
  const h = pick(e); if (!h) return;
  if (!inZone(h.E, h.N)) return toast('Pick a point inside the dashed frame');
  const p = enToUV(h.E, h.N); compare = null;
  if (planMode === 1) { pA = p; pB = null; drawRoute(null); placeMarks(); planMode = 2; $('btnPlan').textContent = 'Now click the end point…'; setOut(stMsg('Start set. Click the end point.')); }
  else { pB = p; setPlan(false); runRoute(); }
});
let lastMove = 0;
renderer.domElement.addEventListener('pointermove', e => {
  const now = performance.now(); if (now - lastMove < 90) return; lastMove = now;
  const h = pick(e); if (!h) { $('cursor').textContent = ''; return; }
  const ll = latLon(h.E, h.N), z = inZone(h.E, h.N), uv = enToUV(h.E, h.N);
  $('cursor').textContent = `${ll.lat.toFixed(4)}°N  ${ll.lon.toFixed(4)}°E  ·  ${elevEN(h.E, h.N).toFixed(0)} m` + (z ? `  ·  ${slopeUV(uv.u, uv.v).toFixed(1)}°` : '');
});

function toast(html, ms = 2400) {
  const d = document.createElement('div'); d.className = 'toast'; d.innerHTML = `<i></i><span>${html}</span>`;
  $('toasts').appendChild(d); setTimeout(() => d.remove(), ms);
  while ($('toasts').children.length > 2) $('toasts').firstChild.remove();
}

function rebuildAll() { updateHeights(); buildTrack(); buildFrame(); placeMarkers(); placeRover(); placeMarks(); if (pA && pB && routeLine) { /* redrawn by runRoute */ } }
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); labels.setSize(innerWidth, innerHeight);
  for (const m of lineMats) m.resolution.set(innerWidth, innerHeight);
  setViewOffset(); if (coach) showCoach();
});

// ================= LOOP =================
const clock = new THREE.Clock();
let lastFar = null, lastT = 0;
function stepAstro(path, fi, t) {
  const i = Math.floor(fi), f = fi - i, a = path[i], b = path[Math.min(i + 1, path.length - 1)];
  const pa = wUV(a.x / (GW - 1), a.y / (GH - 1)), pb = wUV(b.x / (GW - 1), b.y / (GH - 1));
  astroWrap.position.lerpVectors(pa, pb, f);
  const dx = pb.x - pa.x, dz = pb.z - pa.z; if (Math.hypot(dx, dz) > 1e-4) astro.rotation.y = Math.atan2(-dz, dx);
  const d = astroWrap.position.clone().sub(controls.target).multiplyScalar(0.08); controls.target.add(d); camera.position.add(d);
  const sw = Math.sin(t * 9) * 0.45; astro.userData.legs[0].rotation.z = sw; astro.userData.legs[1].rotation.z = -sw;
  return i;
}
function loop() {
  requestAnimationFrame(loop);
  const t = clock.getElapsedTime(), dt = Math.min(0.1, t - lastT); lastT = t;
  if (playing) {
    setTrackPos(trackPos + +$('speed').value * dt * 60);   // frame-rate independent
    if ($('chkFollow').checked && !fly) { const d = rover.position.clone().sub(controls.target).multiplyScalar(0.12); controls.target.add(d); camera.position.add(d); }
    if (trackPos >= TRACK.length - 1) { stopPlay(); toast('Drive complete · <b>45.2 km</b>'); }
  }
  const driving = drive.active(), intro = document.body.classList.contains('intro-on');
  if (driving) { fly = null; drive.update(dt, t); }
  hi.update(driving ? drive.roverPos() : (!intro && !playing && camera.position.distanceTo(controls.target) < 160 ? controls.target : null), layer === 'imagery' && !intro);   // no tile streaming during replay
  rover.visible = !intro && !driving;
  stopGroup.visible = !intro && !driving && $('chkStops').checked;
  pinGroup.visible = !intro && !driving && $('chkSamples').checked;
  if (fly) {
    fly.t = Math.min(1, fly.t + (fly.speed || 0.018)); const k = fly.t * fly.t * (3 - 2 * fly.t);
    controls.target.lerpVectors(fly.fT, fly.tT, k); camera.position.lerpVectors(fly.fP, fly.tP, k);
    if (fly.t >= 1) fly = null;
  }
  if (walk && evaRoute && !fly) {
    const path = evaRoute.path, p = evaRoute.plan;
    walk.i = Math.min(walk.i + walk.speed, walk.end);
    const i = stepAstro(path, walk.i, t), f = walk.i - i;
    const j = Math.min(i + 1, p.n - 1), tH = p.F[i] + (p.F[j] - p.F[i]) * f;
    astroTagEl.textContent = `EVA ${hhmm(tH)} h · ${p.D[i].toFixed(2)} km`;
    const dot = document.getElementById('profDot'); if (dot) { const x = evaRoute.profX(p.D[i]); dot.setAttribute('x1', x); dot.setAttribute('x2', x); dot.setAttribute('opacity', 1); }
    if (walk.i >= walk.end) { toast(walk.end < p.n - 1 ? `Turnaround point · <b>${hm(p.F[walk.end])}</b>` : `Target reached · <b>${hm(p.out)}</b>`); walk = null; }
  }
  astroTag.visible = astroWrap.visible;
  if (astroWrap.visible) { const dA = camera.position.distanceTo(astroWrap.position), k = Math.min(Math.max(dA * 0.5, 1), 450); astro.scale.setScalar(S * k); astroTag.position.set(0, S * k * 2.3 + 1, 0); }
  // rover readable at any zoom (label says not to scale)
  const dist = camera.position.distanceTo(rover.position);
  roverScale = Math.min(Math.max(dist * 0.45, 1), 450);
  roverModel.scale.setScalar(S * roverScale);
  const bh = dist * 0.09; beacon.scale.set(dist * 0.0012, bh, dist * 0.0012); beacon.position.y = bh / 2;
  beacon.material.opacity = Math.min(Math.max((dist - 120) / 600, 0), 0.4); beacon.visible = beacon.material.opacity > 0.01;
  const rr = S * roverScale * (2.6 + Math.sin(t * 3) * 0.3); ring.scale.set(rr, rr, rr);
  roverTag.position.set(0, S * roverScale * 3.2 + 2, 0);
  roverTagEl.textContent = `PERSEVERANCE · SOL ${curSol}${roverScale > 2 ? ' · not to scale' : ''}`;
  const camD = camera.position.distanceTo(controls.target), far = camD > 1100;
  if (far !== lastFar) { lastFar = far; for (const s of stops) s.el.classList.toggle('far', far); for (const p of pins) p.el.style.visibility = far ? 'hidden' : ''; zoneTagEl.style.visibility = far ? 'hidden' : ''; }
  if (!far) { const pk = Math.min(Math.max(camD / 260, 0.12), 1); for (const p of pins) { const b = p.beam; const baseY = b.userData.y ?? (b.userData.y = b.position.y - 8); b.scale.set(pk, 16 * pk, pk); b.position.y = baseY + 8 * pk; } }
  for (const s of stops) { const k = 1 + 0.25 * Math.sin(t * 2.4); const sc = camera.position.distanceTo(s.r.position) * 0.012 * k; s.r.scale.set(sc, sc, sc); }
  if (!driving) controls.update();
  renderer.render(scene, camera); labels.render(scene, camera);
}
buildTrack(); buildFrame(); placeMarkers(); setTrackPos(0); stopPlay(); setOut('');

// ---------- cinematic intro: descent from orbit into Jezero with captions ----------
const INTRO_END = new THREE.Vector3(CTR.x + 2600, 2300, CTR.z + 3200);
const CAPS = [
  ['Mars · 18.4° N, 77.6° E', 'Jezero crater.<br>45 kilometres across.'],
  ['3.5 billion years ago', 'A river ran into it<br>and filled it with a lake.'],
  ['February 2021 → today', 'NASA’s Perseverance has driven<br>45 km here, looking for ancient life.'],
  ['Real terrain · real samples · real photos', 'Now it’s your turn.'],
];
let introDone = false, introTimer = null;
function finishIntro() {
  if (introDone) return; introDone = true; clearTimeout(introTimer);
  $('captions').innerHTML = ''; $('introMain').classList.remove('hidden'); $('btnSkipIntro').classList.add('hidden');
  controls.autoRotate = true;
}
function playIntro() {
  controls.target.set(CTR.x, -40, CTR.z);
  camera.position.set(CTR.x + 9000, 28000, CTR.z + 15000);
  fly = { t: 0, fT: controls.target.clone(), tT: controls.target.clone(), fP: camera.position.clone(), tP: INTRO_END.clone(), speed: 0.0016 };
  let i = 0;
  const next = () => {
    if (introDone) return; if (i >= CAPS.length) return finishIntro();
    $('captions').innerHTML = `<div class="cap"><small>${CAPS[i][0]}</small>${CAPS[i][1]}</div>`; i++;
    introTimer = setTimeout(next, 3000);
  };
  introTimer = setTimeout(next, 600);
}
$('btnSkipIntro').onclick = () => { fly = null; camera.position.copy(INTRO_END); finishIntro(); };
controls.autoRotateSpeed = 0.35; setViewOffset();
// ---------- persistence: a page reload continues where the user was ----------
const SAVE_KEY = 'jft-state-v1';
function saveState() {
  if (document.body.classList.contains('intro-on') || !mode) { store.set(SAVE_KEY, null); return; }
  store.set(SAVE_KEY, { mode, trackPos, guide: curGuide, sample: curSample ? curSample.no : null, layer, tab: curTab,
    cam: camera.position.toArray(), tgt: controls.target.toArray(), exag: EXAG, drive: drive.serialize(), t: Date.now() });
}
setInterval(saveState, 1500); addEventListener('beforeunload', saveState);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveState(); });
function restoreState() {
  const s = store.get(SAVE_KEY);
  if (!s || !s.mode || Date.now() - s.t > 7 * 864e5) return false;
  introDone = true; $('captions').innerHTML = ''; $('btnSkipIntro').classList.add('hidden'); $('introMain').classList.remove('hidden');
  store.set('jft-coach', 1);
  if (s.exag && s.exag !== EXAG) { EXAG = s.exag; $('exag').value = EXAG; $('exagV').textContent = `×${EXAG}`; rebuildAll(); }
  setMode(s.mode);
  if (s.drive && s.mode === 'drive' && drive.restore(s.drive)) return true;
  selectTab(s.tab || 'layers'); layer = s.layer || 'imagery'; applyLayer();
  setTrackPos(s.trackPos || 0);
  if (s.mode === 'tour' && s.guide >= 0) openGuide(s.guide);
  else if (s.sample) { const p = PLACED.find(x => x.no === s.sample); if (p) openSample(p, false); }
  else if (s.mode !== 'tour') backToGuide();
  fly = null; camera.position.fromArray(s.cam); controls.target.fromArray(s.tgt); controls.update();
  return true;
}
if (!restoreState()) playIntro();
loop();
$('loading').classList.add('hidden');
window.__app = { openGuide, openSample, setTrackPos, setMode, drive, hi, EXPED, PLACED, camera, controls };
