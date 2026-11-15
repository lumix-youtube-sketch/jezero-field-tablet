// Crew-rover expeditions: drive a concept pressurized rover across real Jezero terrain.
// Real data drives the physics and the science: CTX DEM slope/elevation, THEMIS night-IR ground
// type, NASA sample table, rover raw images. Vehicle numbers are assumptions (rovermodel.js).
import { ROVER, LOOSE_T, maxSpeed, powerKW, pathCost } from './rovermodel.js';
import { loadModel } from './models.js';

export function createDrive(ctx) {
  const { THREE, scene, camera, controls, CSS2DObject, $, toast, store, wUV, elevUV, GW, GH, MPX, MPY, WM, HM, S, findRoute, lineMat, makeLine, MEDIA, CAM } = ctx;
  const EXP = ctx.EXPED.expeditions;
  const TS = 7;                  // game seconds per real second while driving (a 2-3 km leg takes ~2 min)
  const VIS = 3;                 // minimum display scale of the rover (shown larger than life, labelled)
  const group = new THREE.Group(); scene.add(group);
  const routeMat = lineMat({ color: 0x5fd6ff, linewidth: 4 });
  const best = store.get('jft-xbest') || {};
  let X = null, keys = {}, marks = [], routeLine = null, frame = 0, camDist = 9, wheelSpin = 0;
  const hhmm = (h) => { const m = Math.max(0, Math.round(h * 60)); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };
  const st = (k, v, o = {}) => `<div class="st${o.full ? ' full' : ''}"><div class="k">${k}</div><div class="v${o.cls ? ' ' + o.cls : ''}">${v}</div></div>`;
  const cellOf = (u, v) => Math.round(Math.min(Math.max(v, 0), 1) * (GH - 1)) * GW + Math.round(Math.min(Math.max(u, 0), 1) * (GW - 1));
  const thermAt = (u, v) => { const T = ctx.therm(); return T ? T[cellOf(u, v)] : 0.5; };
  const slopeAt = (u, v) => ctx.SLOPE[cellOf(u, v)];
  const distM = (a, b) => Math.hypot((a.u - b.u) * WM, (a.v - b.v) * HM);

  // ---------- orbital base image (minimap + field-station chips) ----------
  const baseImg = new Image(); baseImg.src = 'data/detail_mars.jpg';
  const mm = $('minimap'), mmc = mm.getContext('2d'); let mmBase = null;
  baseImg.decode().then(() => { mmBase = document.createElement('canvas'); mmBase.width = mm.width; mmBase.height = mm.height; mmBase.getContext('2d').drawImage(baseImg, 0, 0, mm.width, mm.height); }).catch(() => {});

  // ---------- crew rover model (concept, metres; +x is forward) ----------
  function buildCrewRover() {
    const g = new THREE.Group();
    const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.15, ...o });
    const white = M(0xf3efe7, { emissive: 0x24211e }), offw = M(0xdcd6cc), dark = M(0x1c1f25, { roughness: 0.7 }), grey = M(0x5d636c, { metalness: 0.4 });
    const glass = M(0x0d1b26, { metalness: 0.7, roughness: 0.1, emissive: 0x0a2232 }), orange = M(0xff7a3c, { emissive: 0x3a1606 });
    const alu = M(0xb9bec6, { metalness: 0.75, roughness: 0.3 }), panel = M(0x1d2c48, { metalness: 0.55, roughness: 0.25, emissive: 0x050a14 }), gold = M(0xc9a24e, { metalness: 0.85, roughness: 0.3 });
    const lamp = M(0xfff7dc, { emissive: 0xfff0c0, emissiveIntensity: 1.4 }), rubber = M(0x3a3d42, { roughness: 0.95 }), mesh = M(0x8d939b, { metalness: 0.6, roughness: 0.45 });
    const add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0, parent = g) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); parent.add(o); return o; };
    // chassis + lockers + bumpers
    add(new THREE.BoxGeometry(5.6, 0.34, 2.0), dark, 0, 1.0, 0);
    for (const z of [-1.05, 1.05]) { add(new THREE.BoxGeometry(3.4, 0.42, 0.18), grey, -0.1, 1.08, z); for (const x of [-1.2, 0, 1.2]) add(new THREE.BoxGeometry(0.9, 0.3, 0.04), offw, x, 1.1, z * 1.09); }
    add(new THREE.BoxGeometry(0.25, 0.28, 2.3), grey, 2.85, 0.98, 0); add(new THREE.BoxGeometry(0.25, 0.28, 2.1), grey, -2.85, 0.98, 0);
    // pressurized cabin with structural ribs
    add(new THREE.CapsuleGeometry(1.12, 3.3, 10, 24), white, 0, 2.05, 0, 0, 0, Math.PI / 2);
    for (const x of [-1.3, -0.4, 0.5, 1.4]) add(new THREE.TorusGeometry(1.14, 0.035, 8, 40), grey, x, 2.05, 0, 0, Math.PI / 2, 0);
    add(new THREE.BoxGeometry(5.2, 0.13, 2.27), orange, 0, 1.55, 0);
    // cockpit glazing: wrap-around windscreen + side portholes
    add(new THREE.CylinderGeometry(1.0, 1.0, 1.9, 24, 1, true, -0.9, 1.8), glass, 2.05, 2.22, 0, Math.PI / 2, 0, 0);
    for (const z of [-1.1, 1.1]) for (const x of [-0.9, 0.0, 0.9]) add(new THREE.CylinderGeometry(0.17, 0.17, 0.06, 18), glass, x, 2.3, z, Math.PI / 2, 0, 0);
    // roof: solar wings, radiator, comms
    for (const z of [-0.72, 0.72]) { add(new THREE.BoxGeometry(2.6, 0.05, 1.05), panel, -0.35, 3.25, z, z > 0 ? -0.08 : 0.08, 0, 0);
      for (let k = -1; k <= 1; k++) add(new THREE.BoxGeometry(0.02, 0.06, 1.0), alu, -0.35 + k * 0.85, 3.26, z, z > 0 ? -0.08 : 0.08, 0, 0); }
    add(new THREE.BoxGeometry(0.3, 0.35, 0.3), grey, -0.35, 3.05, 0);
    add(new THREE.CylinderGeometry(0.035, 0.035, 1.3, 6), alu, -1.75, 3.6, 0.65);
    add(new THREE.SphereGeometry(0.38, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), offw, -1.75, 4.2, 0.65, Math.PI * 0.75, 0, 0.4);
    add(new THREE.CylinderGeometry(0.015, 0.015, 0.9, 4), alu, 1.2, 3.55, -0.75);
    add(new THREE.BoxGeometry(0.5, 0.12, 0.5), gold, 0.7, 3.15, 0);
    // lights
    for (const z of [-0.85, -0.55, 0.55, 0.85]) add(new THREE.BoxGeometry(0.06, 0.14, 0.22), lamp, 2.98, 1.25, z);
    for (const z of [-0.9, 0.9]) add(new THREE.BoxGeometry(0.04, 0.1, 0.12), M(0xff3020, { emissive: 0xff2010 }), -2.98, 1.3, z);
    // rear suitports with two docked EVA suits
    for (const z of [-0.55, 0.55]) {
      add(new THREE.CylinderGeometry(0.46, 0.46, 0.08, 24), grey, -2.86, 2.0, z, 0, 0, Math.PI / 2);
      add(new THREE.BoxGeometry(0.42, 0.75, 0.62), white, -3.15, 1.95, z);                 // life-support pack
      add(new THREE.SphereGeometry(0.2, 14, 10), white, -3.18, 2.5, z);                    // helmet
      add(new THREE.BoxGeometry(0.06, 0.3, 0.4), orange, -3.38, 1.95, z);
    }
    // six wheels on swing arms (pivot groups move up and down with the ground)
    const wheels = [], R = 0.62, Wd = 0.55;
    for (const x of [-1.95, 0, 1.95]) for (const z of [-1.42, 1.42]) {
      const pivot = new THREE.Group(); pivot.position.set(x, R, z); g.add(pivot);
      const spin = new THREE.Group(); pivot.add(spin);
      add(new THREE.CylinderGeometry(R, R, Wd, 32), mesh, 0, 0, 0, Math.PI / 2, 0, 0, spin);                 // woven-wire tyre
      add(new THREE.CylinderGeometry(R * 0.98, R * 0.98, Wd * 1.02, 32, 1, true), rubber, 0, 0, 0, Math.PI / 2, 0, 0, spin);
      for (let k = 0; k < 22; k++) {                                                                          // chevron grousers
        const a = (k / 22) * Math.PI * 2, gr = add(new THREE.BoxGeometry(0.07, 0.07, Wd * 1.04), alu, Math.cos(a) * R, Math.sin(a) * R, 0, 0, 0, a, spin);
        gr.rotation.y = 0.25;
      }
      add(new THREE.CylinderGeometry(0.27, 0.27, Wd + 0.08, 18), alu, 0, 0, 0, Math.PI / 2, 0, 0, spin);       // hub
      for (let k = 0; k < 5; k++) add(new THREE.BoxGeometry(0.06, R * 1.7, 0.05), grey, 0, 0, z > 0 ? Wd / 2 + 0.03 : -Wd / 2 - 0.03, 0, 0, (k / 5) * Math.PI, spin);
      add(new THREE.CylinderGeometry(0.12, 0.12, 0.12, 12), gold, 0, 0, z > 0 ? Wd / 2 + 0.08 : -Wd / 2 - 0.08, Math.PI / 2, 0, 0, spin);
      add(new THREE.CylinderGeometry(R + 0.12, R + 0.12, Wd + 0.1, 20, 1, true, 0, Math.PI), grey, 0, 0.05, 0, Math.PI / 2, 0, Math.PI / 2, pivot);   // fender
      const arm = add(new THREE.BoxGeometry(0.14, 0.14, 0.75), alu, 0, 0.22, z > 0 ? -0.4 : 0.4, 0, 0, 0, pivot);
      wheels.push({ pivot, spin, base: pivot.position.clone(), arm });
    }
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    g.userData.wheels = wheels; return g;
  }
  const rov = new THREE.Group(), model = buildCrewRover(); rov.add(model); rov.visible = false; scene.add(rov);
  // NASA Space Exploration Vehicle (NASA 3D Resources) replaces the procedural body once loaded;
  // the procedural wheel pivots stay (hidden) as ground-contact points for tracks and dust.
  loadModel('models/sev.glb', { length: 5.9 }).then(m => { for (const c of model.children) c.visible = false; model.add(m); }).catch(() => {});
  const tagEl = document.createElement('div'); tagEl.className = 'tag'; tagEl.style.background = '#ffb27a'; tagEl.textContent = 'CREW ROVER · concept · shown larger';
  const tag = new CSS2DObject(tagEl); tag.visible = false; rov.add(tag);
  // flat chevron that lies over the rover and points at the target (readable from the chase camera)
  const chev = new THREE.Shape(); chev.moveTo(1.6, 0); chev.lineTo(-0.9, 1.1); chev.lineTo(-0.35, 0); chev.lineTo(-0.9, -1.1); chev.closePath();
  const arrow = new THREE.Mesh(new THREE.ShapeGeometry(chev), new THREE.MeshBasicMaterial({ color: 0x5fd6ff, transparent: true, opacity: 0.85, depthTest: false, side: THREE.DoubleSide }));
  arrow.geometry.rotateX(-Math.PI / 2); arrow.renderOrder = 10; arrow.visible = false; scene.add(arrow);

  // ---------- wheel tracks (two ribbons pressed into the ground) ----------
  const TN = 4000, trackMat = new THREE.MeshBasicMaterial({ color: 0x24150d, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  function makeTrack() {
    const pos = new Float32Array(TN * 2 * 3), geo = new THREE.BufferGeometry(), idx = [];
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    for (let i = 0; i < TN - 1; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    geo.setIndex(idx); geo.setDrawRange(0, 0);
    const mesh = new THREE.Mesh(geo, trackMat); mesh.frustumCulled = false; mesh.visible = false; scene.add(mesh);
    return { geo, pos, n: 0, mesh };
  }
  const tracks = [makeTrack(), makeTrack()];
  function resetTracks() { for (const T of tracks) { T.n = 0; T.geo.setDrawRange(0, 0); } }
  function addTrackPoint(T, c, side, hw) {
    if (T.n >= TN) { T.pos.copyWithin(0, (TN / 2) * 6, TN * 6); T.n = TN / 2; }
    const o = T.n * 6;
    T.pos[o] = c.x + side.x * hw; T.pos[o + 1] = c.y; T.pos[o + 2] = c.z + side.z * hw;
    T.pos[o + 3] = c.x - side.x * hw; T.pos[o + 4] = c.y; T.pos[o + 5] = c.z - side.z * hw;
    T.n++; T.geo.attributes.position.needsUpdate = true; T.geo.setDrawRange(0, Math.max(0, (T.n - 1) * 6));
  }

  // ---------- dust kicked up by the wheels ----------
  const DN = 220, dPos = new Float32Array(DN * 3), dA = new Float32Array(DN), dS = new Float32Array(DN), dV = new Float32Array(DN * 3), dL = new Float32Array(DN);
  const dGeo = new THREE.BufferGeometry();
  dGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3)); dGeo.setAttribute('alpha', new THREE.BufferAttribute(dA, 1)); dGeo.setAttribute('size', new THREE.BufferAttribute(dS, 1));
  const dMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: { color: { value: new THREE.Color(0xc79466) }, scale: { value: innerHeight * 0.5 } },
    vertexShader: '#include <common>\n#include <logdepthbuf_pars_vertex>\nattribute float alpha; attribute float size; varying float vA; uniform float scale;\nvoid main(){ vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * scale / max(-mv.z, 0.1); gl_Position = projectionMatrix * mv;\n#include <logdepthbuf_vertex>\n}',
    fragmentShader: '#include <logdepthbuf_pars_fragment>\nuniform vec3 color; varying float vA;\nvoid main(){\n#include <logdepthbuf_fragment>\nvec2 c = gl_PointCoord - 0.5; float d = length(c); if (d > 0.5) discard; gl_FragColor = vec4(color, vA * (1.0 - d * 2.0)); }',
  });
  const dust = new THREE.Points(dGeo, dMat); dust.frustumCulled = false; dust.visible = false; scene.add(dust);
  let dNext = 0;
  function emitDust(p, back, k, amount) {
    for (let n = 0; n < amount; n++) {
      const i = dNext; dNext = (dNext + 1) % DN;
      dPos[i * 3] = p.x + (Math.random() - 0.5) * 0.4 * k * S; dPos[i * 3 + 1] = p.y + 0.1; dPos[i * 3 + 2] = p.z + (Math.random() - 0.5) * 0.4 * k * S;
      dV[i * 3] = back.x * (0.4 + Math.random() * 0.6) + (Math.random() - 0.5) * 0.4; dV[i * 3 + 1] = 0.25 + Math.random() * 0.5; dV[i * 3 + 2] = back.z * (0.4 + Math.random() * 0.6) + (Math.random() - 0.5) * 0.4;
      dL[i] = 1; dS[i] = 0.5 * k * S;
    }
  }
  function updateDust(dt) {
    for (let i = 0; i < DN; i++) {
      if (dL[i] <= 0) { dA[i] = 0; continue; }
      dL[i] -= dt * 0.7; dPos[i * 3] += dV[i * 3] * dt; dPos[i * 3 + 1] += dV[i * 3 + 1] * dt; dPos[i * 3 + 2] += dV[i * 3 + 2] * dt;
      dV[i * 3 + 1] -= dt * 0.35; dS[i] += dt * 1.6 * S * VIS; dA[i] = Math.max(0, dL[i]) * 0.5;
    }
    dGeo.attributes.position.needsUpdate = true; dGeo.attributes.alpha.needsUpdate = true; dGeo.attributes.size.needsUpdate = true;
  }

  // ---------- expedition list (right panel) ----------
  function renderList() {
    $('missionList').innerHTML = EXP.map((d, i) => {
      const b = best[d.id];
      return `<div class="mcard" data-i="${i}"><div class="lvl">${[1, 2, 3].map(k => `<i class="${k <= d.level ? 'on' : ''}"></i>`).join('')}</div>`
        + `<div class="mt">${d.title}</div><div class="mr">${d.region}</div>`
        + `<div class="mf"><span>${d.battery} kWh</span><span>${d.window} h daylight</span><span>${d.nodes.length - 1} sites</span>${b != null ? `<span class="best">best ${b}/${d.maxScore}</span>` : ''}</div></div>`;
    }).join('');
    $('missionList').querySelectorAll('.mcard').forEach(el => el.onclick = () => start(EXP[+el.dataset.i]));
  }

  // ---------- markers ----------
  function buildMarks() {
    group.clear(); marks = [];
    X.def.nodes.forEach((n, i) => {
      const w = wUV(n.u, n.v);
      if (i === 0) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(3.4, 4.4, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthWrite: false }));
        ring.rotation.x = -Math.PI / 2; ring.position.set(w.x, w.y + 0.4, w.z); group.add(ring); X.baseRing = ring;
        const el = document.createElement('div'); el.className = 'lmark'; el.textContent = 'BASE';
        const o = new CSS2DObject(el); o.position.set(w.x, w.y + 22, w.z); group.add(o); return;
      }
      const el = document.createElement('div'); el.className = 'tmark';
      el.innerHTML = `<span class="o" style="background:#ffb27a">${i}</span><span>${n.name}</span><span class="p">${n.value}</span>`;
      el.addEventListener('click', e => { e.stopPropagation(); setNav(i); });
      const o = new CSS2DObject(el); o.position.set(w.x, w.y + 14, w.z); group.add(o);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 14, 8), new THREE.MeshBasicMaterial({ color: 0xffb27a, transparent: true, opacity: 0.85 }));
      beam.geometry.translate(0, 7, 0); beam.position.set(w.x, w.y, w.z); group.add(beam);
      marks.push({ i, el, beam, label: o, y: w.y });
    });
  }
  function rebuildTrail() { /* 3D trail replaced by wheel tracks; the minimap keeps the full trail */ }


  // ---------- start / exit ----------
  function start(def) {
    exit();
    const L = def.nodes[0];
    X = { def, u: L.u, v: L.v, th: 0, speed: 0, battery: def.battery, kwh: 0, hours: 0, score: 0, km: 0, dose: 0,
      visited: [], results: [], log: [], lastLogKm: -1, nav: 1, paused: false, ended: false, moved: 0, retEst: null, retT: 0, warned: {}, trailPts: [{ u: L.u, v: L.v }], cur: { grade: 0, loose: false, ti: 0.5, P: 0 }, near: null };
    X.nav = nearestOpen();
    const t = def.nodes[X.nav]; X.th = Math.atan2(-(t.v - L.v) * HM, (t.u - L.u) * WM);
    document.body.classList.add('drive-on'); ctx.sceneMode(true); ctx.setLayer('imagery');
    for (const id of ['xPanel', 'telemetry', 'navBox', 'minimap', 'keys']) $(id).classList.remove('hidden');
    controls.enabled = false; rov.visible = true; tag.visible = true; arrow.visible = true;
    resetTracks(); for (const T of tracks) T.mesh.visible = true; dust.visible = true; dA.fill(0); dL.fill(0);
    ctx.shadows(true); camera.fov = 52; camera.updateProjectionMatrix();
    buildMarks(); renderPanel(); logPoint('start');
    const w = wUV(L.u, L.v); camera.position.set(w.x - 60, w.y + 160, w.z + 120); X.look = w.clone();   // swoop down into chase view
    document.querySelector('.key[data-k="w"]').classList.add('pulse');
    $('keys').classList.remove('faded'); $('xPanel').classList.remove('open'); document.body.classList.remove('hud-off');
    showPrompt('Hold W to drive · steer with A and D');
  }
  function exit() {
    if (!X) return;
    group.clear(); marks = []; if (routeLine) { scene.remove(routeLine); routeLine = null; }
    for (const id of ['xPanel', 'telemetry', 'navBox', 'minimap', 'keys', 'prompt', 'station', 'result']) $(id).classList.add('hidden');
    rov.visible = false; tag.visible = false; arrow.visible = false; controls.enabled = true;
    for (const T of tracks) T.mesh.visible = false; dust.visible = false; ctx.shadows(false); camera.fov = 45; camera.updateProjectionMatrix();
    controls.target.copy(rov.position); X = null; keys = {};
    document.body.classList.remove('drive-on', 'hud-off'); ctx.sceneMode(false);
  }
  $('btnXMore').onclick = () => $('xPanel').classList.toggle('open');
  let keysTimer = null;
  function showKeys() {
    $('keys').classList.remove('faded'); document.body.classList.remove('hud-off'); if (X) X.keysFaded = true;
    clearTimeout(keysTimer); keysTimer = setTimeout(() => { if (X && X.moved > 700) $('keys').classList.add('faded'); }, 8000);
  }

  // ---------- panel ----------
  function renderPanel() {
    const d = X.def, k = EXP.indexOf(d);
    $('xKicker').textContent = `Expedition ${k + 1} of ${EXP.length}`; $('xTitle').textContent = d.title; $('xRegion').textContent = d.region;
    $('xBrief').innerHTML = `Battery <b>${d.battery} kWh</b>, daylight <b>${d.window} h</b>. Drive to science sites, read the instruments, identify the rock — then dock at base. The clock only runs while you drive.`;
    const A = '<span class="tagA">assumed</span>';
    $('xSpec').innerHTML = `<table>
      <tr><td>Mass${A}</td><td>${ROVER.massKg} kg</td></tr><tr><td>Top speed${A}</td><td>${ROVER.vmaxKmh} km/h</td></tr>
      <tr><td>Climb limit${A}</td><td>${ROVER.maxSlopeDeg}°</td></tr><tr><td>Rolling resistance${A}</td><td>${ROVER.crrFirm} / ${ROVER.crrLoose}</td></tr>
      <tr><td>Drivetrain efficiency${A}</td><td>${ROVER.eta * 100}%</td></tr><tr><td>Life support load${A}</td><td>${ROVER.hotelKW} kW</td></tr>
      <tr><td>Crew time per site${A}</td><td>${ROVER.stopMin} min</td></tr><tr><td>Mars gravity</td><td>${ROVER.g} m/s²</td></tr>
      <tr><td>Slope · ground · samples</td><td>real data</td></tr></table>
      <p class="note fine">Power = m·g·(Crr·cosθ + sinθ)·v / η + life support. Loose ground = THEMIS night-IR index below ${LOOSE_T}.</p>`;
    renderSites();
  }
  function renderSites() {
    const d = X.def; $('xSiteCount').textContent = `${X.visited.length}/${d.nodes.length - 1}`;
    $('xSites').innerHTML = '';
    d.nodes.forEach((n, i) => {
      if (!i) return; const done = X.visited.includes(i), r = X.results.find(x => x.i === i);
      const el = document.createElement('div'); el.className = 'tgt' + (done ? ' done' : '') + (X.nav === i ? ' nav' : '');
      el.innerHTML = `<div class="ord">${done ? '✓' : i}</div><div><div class="tn">${n.name}</div><div class="tr">${done ? `<i style="background:${r.ok ? '#7ad79c' : '#ff6a5a'}"></i>${n.rock}` : `<span class="dst" data-i="${i}"></span>`}</div></div><div class="pts">${done ? '+' + r.pts : n.value}<small>pts</small></div>`;
      el.onclick = () => setNav(i); $('xSites').appendChild(el);
    });
    for (const m of marks) { m.el.classList.toggle('done', X.visited.includes(m.i)); m.el.classList.toggle('on', X.nav === m.i); m.beam.material.color.set(X.visited.includes(m.i) ? 0x7ad79c : X.nav === m.i ? 0x5fd6ff : 0xffb27a); }
  }
  function setNav(i) { if (!X) return; X.nav = i; renderSites(); if (routeLine) showRoute(); }
  function nearestOpen() {
    let bi = 0, bd = Infinity; X.def.nodes.forEach((n, i) => { if (!i || X.visited.includes(i)) return; const d = distM(X, n); if (d < bd) { bd = d; bi = i; } }); return bi;
  }

  // ---------- route help (R) ----------
  function routeTo(i) {
    const n = X.def.nodes[i];
    const r = findRoute(ctx.elev, GW, GH, MPX, MPY, { x: X.u * (GW - 1), y: X.v * (GH - 1) }, { x: n.u * (GW - 1), y: n.v * (GH - 1) }, { maxSlopeDeg: ROVER.maxSlopeDeg, slopeWeight: 6 });
    return r.found ? { path: r.path, ...pathCost(r.path, ctx.elev, ctx.therm(), GW, MPX, MPY) } : null;
  }
  function showRoute() {
    if (routeLine) { scene.remove(routeLine); routeLine.geometry.dispose(); routeLine = null; }
    const r = routeTo(X.nav); if (!r) return toast('No safe route from here');
    routeLine = makeLine(r.path.map(c => wUV(c.x / (GW - 1), c.y / (GH - 1), 1.4)), routeMat); scene.add(routeLine);
    toast(`Safe route · <b>${r.km.toFixed(2)} km</b> · ${r.kwh.toFixed(1)} kWh · ${hhmm(r.h)} h`);
  }
  function toggleRoute() { if (routeLine) { scene.remove(routeLine); routeLine = null; } else showRoute(); }
  $('btnNavRoute').onclick = () => X && toggleRoute();

  // ---------- simulation ----------
  function sim(dt) {
    const thr = (keys.w || keys.arrowup ? 1 : 0) - (keys.s || keys.arrowdown ? 1 : 0);
    const steer = (keys.a || keys.arrowleft ? 1 : 0) - (keys.d || keys.arrowright ? 1 : 0);
    const fE = Math.cos(X.th), fN = Math.sin(X.th), here = elevUV(X.u, X.v), P = 25;
    const gradeF = Math.atan2(elevUV(X.u + fE * P / WM, X.v - fN * P / HM) - here, P) * 180 / Math.PI;
    const dirSign = (thr < 0 && X.speed <= 0.1) || X.speed < -0.05 ? -1 : 1, gMove = gradeF * dirSign;
    const ti = thermAt(X.u, X.v), loose = ti < LOOSE_T, vmax = maxSpeed(gMove, loose);
    const target = thr > 0 ? vmax : thr < 0 ? -Math.min(4, vmax) : 0;
    const acc = (Math.abs(target) > Math.abs(X.speed) ? 7 : 16) * dt;
    X.speed += Math.max(-acc, Math.min(acc, target - X.speed));
    X.th += steer * dt * (0.4 + 0.5 * Math.min(1, Math.abs(X.speed) / 6)) * (X.speed < -0.1 ? -1 : 1);
    let blocked = '';
    if (Math.abs(X.speed) > 0.05 && Math.abs(gMove) > ROVER.maxSlopeDeg) { blocked = `Too steep ahead: ${Math.abs(gMove).toFixed(0)}° (limit ${ROVER.maxSlopeDeg}°)`; X.speed = 0; }
    const m = X.speed / 3.6 * dt * TS;
    const nu = X.u + fE * m / WM, nv = X.v - fN * m / HM;
    if (nu < 0.004 || nu > 0.996 || nv < 0.004 || nv > 0.996) { blocked = 'Edge of the high-resolution zone'; X.speed = 0; }
    else if (!blocked) { X.u = nu; X.v = nv; X.km += Math.abs(m) / 1000; X.moved += Math.abs(m); }
    const moving = Math.abs(X.speed) > 0.05 || thr !== 0;
    const Pw = Math.abs(X.speed) > 0.05 ? powerKW(Math.abs(X.speed), gMove, loose) : ROVER.hotelKW;
    if (moving) { const dtH = dt * TS / 3600; X.battery -= Pw * dtH; X.kwh += Pw * dtH; X.hours += dtH; X.dose += 0.64 / 24 * dtH * 1000; }
    X.cur = { grade: gMove, loose, ti, P: moving ? Pw : 0, here };
    if (X.km - X.lastLogKm >= 0.1) { X.lastLogKm = X.km; logPoint('drive'); X.trailPts.push({ u: X.u, v: X.v }); rebuildTrail(); }
    X.retT -= dt; if (X.retT <= 0 && moving) { X.retT = 5; X.retEst = routeTo(0); }
    if (X.moved > 60) document.querySelector('.key[data-k="w"]').classList.remove('pulse');
    if (X.moved > 120) tag.visible = false;                                         // label only while getting started
    if (!X.keysFaded && X.moved > 700) { X.keysFaded = true; $('keys').classList.add('faded'); }
    proximity(blocked);
    if (X.battery <= 0) return end('battery');
    if (X.hours >= X.def.window) return end('daylight');
    if (X.retEst && X.battery < X.retEst.kwh * 1.1 && !X.warned.ret) { X.warned.ret = 1; toast('Battery barely covers the drive back — head to base'); }
    if (X.def.window - X.hours < 0.75 && !X.warned.day) { X.warned.day = 1; toast('Less than 45 min of daylight left'); }
  }
  function proximity(blocked) {
    let near = null;
    X.def.nodes.forEach((n, i) => { if (!i || X.visited.includes(i)) return; if (distM(X, n) < 90) near = { kind: 'site', i }; });
    if (!near && X.moved > 300 && distM(X, X.def.nodes[0]) < 110) near = { kind: 'base', i: 0 };
    X.near = near;
    document.querySelector('.key[data-k="e"]').classList.toggle('pulse', !!near);
    if (blocked) return showPrompt(blocked, true);
    if (near && near.kind === 'site') return showPrompt(`Press E · deploy crew at ${X.def.nodes[near.i].name}`);
    if (near && near.kind === 'base') return showPrompt('Press E · dock at base and end the expedition');
    if (X.moved < 60) return showPrompt('Hold W to drive · steer with A and D');
    if (X.moved < 700) return showPrompt(`Follow the blue arrow to ${X.def.nodes[X.nav].name}`);
    showPrompt('');
  }
  function showPrompt(t, warn = false) { const p = $('prompt'); if (!t) { p.classList.add('hidden'); return; } p.textContent = t; p.classList.toggle('warn', warn); p.classList.remove('hidden'); }
  function logPoint(ev) {
    const { lat, lon } = ctx.latLonUV(X.u, X.v);
    X.log.push({ ev, t_h: X.hours, km: X.km, lat, lon, elev_m: elevUV(X.u, X.v), grade_deg: X.cur.grade, slope_deg: slopeAt(X.u, X.v), thermal_idx: thermAt(X.u, X.v), ground: thermAt(X.u, X.v) < LOOSE_T ? 'loose' : 'firm', speed_kmh: Math.abs(X.speed), power_kw: X.cur.P, battery_kwh: X.battery });
  }

  // ---------- field station ----------
  const OPTS = [
    { id: 'igneous', t: 'Igneous', d: 'Cooled lava or magma. Interlocking crystals such as olivine and pyroxene.' },
    { id: 'sedimentary', t: 'Sedimentary', d: 'Grains and mud laid down by water, often in layers.' },
    { id: 'altered', t: 'Water-altered', d: 'Rock chemically changed by water: carbonates, serpentine.' },
  ];
  function openStation(i) {
    const n = X.def.nodes[i], md = MEDIA[n.sol] || [];
    X.paused = true; X.station = i; showPrompt('');
    $('sKicker').textContent = `Field station · site ${i} of ${X.def.nodes.length - 1}`; $('sTitle').textContent = n.name; $('sRegion').textContent = `${n.location} · rock “${n.feature}”`;
    const { lat, lon } = ctx.latLonUV(n.u, n.v), ti = thermAt(n.u, n.v);
    $('sData').innerHTML = st('Elevation', `${elevUV(n.u, n.v).toFixed(0)} m<small>CTX DEM</small>`) + st('Local slope', `${slopeAt(n.u, n.v).toFixed(1)}°<small>DEM</small>`)
      + st('Night-IR index', `${ti.toFixed(2)}<small>${ti < LOOSE_T ? 'loose' : ti > 0.6 ? 'rocky' : 'mixed'}</small>`) + st('Position', `${lat.toFixed(3)}°N<small>${lon.toFixed(3)}°E</small>`)
      + st('From base', `${(distM(n, X.def.nodes[0]) / 1000).toFixed(2)} km`) + st('Mission dose', `${X.dose.toFixed(0)} µSv<small>RAD avg</small>`);
    // orbital chip, 1.2 km square
    const c = $('sOrbit'), g = c.getContext('2d'), iw = baseImg.naturalWidth, ih = baseImg.naturalHeight;
    const sw = 1200 / WM * iw, sh = 1200 / HM * ih;
    g.fillStyle = '#1f1611'; g.fillRect(0, 0, c.width, c.height);
    if (iw) g.drawImage(baseImg, n.u * iw - sw / 2, n.v * ih - sh / 2, sw, sh, 0, 0, c.width, c.height);
    g.strokeStyle = '#5fd6ff'; g.lineWidth = 1.5; g.beginPath(); g.arc(160, 160, 14, 0, 7); g.moveTo(160, 132); g.lineTo(160, 146); g.moveTo(160, 174); g.lineTo(160, 188); g.moveTo(132, 160); g.lineTo(146, 160); g.moveTo(174, 160); g.lineTo(188, 160); g.stroke();
    const bar = 200 / 1200 * c.width; g.fillStyle = '#fff'; g.fillRect(14, c.height - 18, bar, 3); g.font = '11px JetBrains Mono'; g.fillText('200 m', 14, c.height - 24);
    const pre = md.find(x => x.cam === 'MCZ_LEFT') || md.find(x => x.cam === 'NAVCAM_LEFT') || md[0];
    $('sPhoto').src = pre ? pre.url : ''; $('sPhotoK').textContent = pre ? `${CAM[pre.cam] || pre.cam} · sol ${pre.sol}` : 'No rover image';
    $('sOpts').innerHTML = OPTS.map(o => `<button data-id="${o.id}"><b>${o.t}</b><span>${o.d}</span></button>`).join('');
    $('sOpts').querySelectorAll('button').forEach(b => b.onclick = () => answer(b.dataset.id));
    $('sQuiz').classList.remove('hidden'); $('sReveal').classList.add('hidden'); $('btnCollect').classList.add('hidden');
    $('station').classList.remove('hidden');
    logPoint(`site:${n.name}`);
  }
  function answer(id) {
    const i = X.station, n = X.def.nodes[i], ok = id === n.cls, md = MEDIA[n.sol] || [];
    $('sOpts').querySelectorAll('button').forEach(b => { b.disabled = true; if (b.dataset.id === n.cls) b.classList.add('right'); else if (b.dataset.id === id) b.classList.add('wrong'); });
    const pts = Math.round(n.value * (ok ? 1.5 : 1));
    X.pending = { i, ok, pts, guess: id };
    $('sReveal').innerHTML = `${ok ? '<b class="ok">Correct.</b>' : '<b class="no">Not quite.</b>'} NASA's sample table lists <b>${n.rock}</b> for the core “${n.name}”, sealed by Perseverance on sol ${n.sol} (${n.date}). `
      + `${ctx.blurbFor(n.no)} <br><b>+${pts} pts</b>${ok ? ' (×1.5 for a correct ID)' : ''} · collecting takes ${ROVER.stopMin} min of crew time.`;
    $('sReveal').classList.remove('hidden'); $('btnCollect').classList.remove('hidden');
    const core = md.find(x => x.cam === 'CACHECAM'); if (core) { $('sPhoto').src = core.url; $('sPhotoK').textContent = `CacheCam · the real core in its tube · sol ${core.sol}`; }
  }
  $('btnCollect').onclick = () => {
    const p = X.pending, h = ROVER.stopMin / 60;
    X.hours += h; X.battery -= ROVER.hotelKW * h; X.kwh += ROVER.hotelKW * h; X.dose += 0.64 / 24 * h * 1000;
    X.visited.push(p.i); X.results.push(p); X.score += p.pts; X.paused = false; X.pending = null;
    $('station').classList.add('hidden'); toast(`Sample stored · <b>+${p.pts} pts</b>`);
    X.nav = X.visited.length < X.def.nodes.length - 1 ? nearestOpen() : 0;
    if (!X.nav) toast('All sites done — drive back to base');
    renderSites(); if (routeLine) showRoute();
    if (X.battery <= 0) end('battery'); else if (X.hours >= X.def.window) end('daylight');
  };

  // ---------- end of expedition ----------
  function end(reason) {
    if (X.ended) return; X.ended = true; X.speed = 0; showPrompt(''); logPoint(`end:${reason}`);
    const d = X.def, ok = reason === 'docked';
    const stars = !ok ? 0 : X.score >= d.best.score * 0.9 ? 3 : X.score >= d.best.score * 0.6 ? 2 : 1;
    if (ok && (best[d.id] == null || X.score > best[d.id])) { best[d.id] = X.score; store.set('jft-xbest', best); renderList(); }
    $('rKicker').textContent = `Expedition ${EXP.indexOf(d) + 1} · ${d.region}`;
    $('rTitle').textContent = { docked: ['Crew home safe', 'Crew home safe', 'Strong expedition', 'Flawless expedition'][stars], battery: 'Rover out of power', daylight: 'Caught by nightfall' }[reason];
    $('rStars').innerHTML = [0, 1, 2].map(k => `<svg viewBox="0 0 24 24" class="${k < stars ? 'on' : ''}"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>`).join('');
    const right = X.results.filter(r => r.ok).length;
    $('rStats').innerHTML = `<div><div class="k">Science</div><div class="v">${X.score}</div></div><div><div class="k">Rocks ID'd</div><div class="v">${right}/${X.results.length}</div></div><div><div class="k">Data points</div><div class="v">${X.log.length}</div></div>`;
    // you vs. planner over the same stops
    const seq = [0, ...X.visited, ...(ok ? [0] : [])]; let pk = 0, pe = 0, ph = 0;
    for (let k = 1; k < seq.length; k++) {
      const a = d.nodes[seq[k - 1]], b = d.nodes[seq[k]];
      const r = findRoute(ctx.elev, GW, GH, MPX, MPY, { x: a.u * (GW - 1), y: a.v * (GH - 1) }, { x: b.u * (GW - 1), y: b.v * (GH - 1) }, { maxSlopeDeg: ROVER.maxSlopeDeg, slopeWeight: 6 });
      if (r.found) { const c = pathCost(r.path, ctx.elev, ctx.therm(), GW, MPX, MPY); pk += c.km; pe += c.kwh; ph += c.h; }
    }
    pe += X.visited.length * ROVER.hotelKW * ROVER.stopMin / 60; ph += X.visited.length * ROVER.stopMin / 60;
    $('rCompare').innerHTML = st('Distance', `${X.km.toFixed(2)} km<small>planner ${pk.toFixed(2)}</small>`) + st('Energy', `${X.kwh.toFixed(1)} kWh<small>planner ${pe.toFixed(1)}</small>`)
      + st('Time', `${hhmm(X.hours)} h<small>planner ${hhmm(ph)}</small>`) + st('Radiation', `${X.dose.toFixed(0)} µSv<small>RAD avg</small>`)
      + `<div class="st full"><div class="msg">${seq.length > 1 ? `Same stops, same rover model: the A* planner on the real DEM ${pk < X.km ? `saves ${((1 - pk / X.km) * 100).toFixed(0)}% of the distance` : 'matches your driving'}.` : 'No sites visited.'} Best possible plan for this expedition: <b>${d.best.score} pts</b>.</div></div>`;
    // traverse profile
    const L = X.log.filter(p => p.ev === 'drive' || p.ev === 'start'); const svg = $('rProfile');
    if (L.length > 2) {
      const lo = Math.min(...L.map(p => p.elev_m)), hi = Math.max(...L.map(p => p.elev_m)), km = L[L.length - 1].km || 1;
      const Xp = (k) => (k / km) * 300, Yp = (e) => 76 - ((e - lo) / Math.max(hi - lo, 1)) * 70;
      let segs = ''; for (let k = 1; k < L.length; k++) segs += `<line x1="${Xp(L[k - 1].km)}" y1="${Yp(L[k - 1].elev_m)}" x2="${Xp(L[k].km)}" y2="${Yp(L[k].elev_m)}" stroke="${L[k].ground === 'loose' ? '#ff6a5a' : '#ffb27a'}" stroke-width="2" vector-effect="non-scaling-stroke"/>`;
      svg.innerHTML = segs; $('rProfLbl').innerHTML = `<span>${lo.toFixed(0)} … ${hi.toFixed(0)} m · <span style="color:#ff6a5a">red = loose ground</span></span><span>${km.toFixed(2)} km</span>`;
    } else { svg.innerHTML = ''; $('rProfLbl').textContent = ''; }
    const sols = X.visited.map(i => d.nodes[i].sol);
    $('rNote').innerHTML = (ok ? '' : reason === 'battery' ? 'The crew would have to wait for rescue. Watch the “back” estimate on the battery meter: it is the energy a safe route home needs. ' : 'Crew rovers must be home before the cold night. ')
      + (sols.length ? `Perseverance sealed the cores you visited between sol ${Math.min(...sols)} and sol ${Math.max(...sols)} — real decisions behind every site.` : '');
    $('btnNextX').textContent = EXP.indexOf(d) === EXP.length - 1 ? 'All expeditions' : 'Next expedition';
    setTimeout(() => $('result').classList.remove('hidden'), 500);
  }
  function csv() {
    const cols = ['ev', 't_h', 'km', 'lat', 'lon', 'elev_m', 'grade_deg', 'slope_deg', 'thermal_idx', 'ground', 'speed_kmh', 'power_kw', 'battery_kwh'];
    const rows = X.log.map(p => cols.map(c => typeof p[c] === 'number' ? +p[c].toFixed(5) : `"${p[c]}"`).join(','));
    const head = `# Jezero Field Tablet traverse log · ${X.def.title}\n# terrain: USGS CTX DEM 20 m; ground: THEMIS night IR (normalized); rover: concept model (assumed parameters)\n`;
    const blob = new Blob([head + cols.join(',') + '\n' + rows.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `jezero-${X.def.id}-traverse.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  $('btnCSV').onclick = () => X && csv();
  $('btnRetry').onclick = () => X && start(X.def);
  $('btnNextX').onclick = () => { if (!X) return; const k = EXP.indexOf(X.def); if (k < EXP.length - 1) start(EXP[k + 1]); else { exit(); ctx.onExit(); } };
  $('btnAbort').onclick = () => { exit(); ctx.onExit(); };

  // ---------- per-frame ----------
  const _v = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  function placeRover(dt, t) {
    const w = wUV(X.u, X.v); w.y = ctx.groundY(w.x, w.z); rov.position.copy(w);
    const e = 5 * S;   // body tilt from the best available surface (HiRISE where loaded, else CTX)
    const n = new THREE.Vector3(-(ctx.groundY(w.x + e, w.z) - ctx.groundY(w.x - e, w.z)) / (2 * e), 1, -(ctx.groundY(w.x, w.z + e) - ctx.groundY(w.x, w.z - e)) / (2 * e)).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(UP, n).multiply(new THREE.Quaternion().setFromAxisAngle(UP, X.th));
    rov.quaternion.slerp(q, 1 - Math.exp(-dt * 6));
    const k = Math.max(VIS, camera.position.distanceTo(rov.position) * 0.03); model.scale.setScalar(S * k);
    rov.updateMatrixWorld(true);
    tag.position.set(0, S * k * 5 + 1.2, 0);
    // wheels roll at the true ground speed and each one follows the terrain under it (±0.45 m travel)
    wheelSpin -= (X.speed / 3.6 * dt * TS) / (0.62 * k);
    const contacts = [];
    for (const wh of model.userData.wheels) {
      _v.set(wh.base.x, 0, wh.base.z); model.localToWorld(_v);
      const gy = ctx.groundY(_v.x, _v.z), target = wh.base.y + Math.max(-0.45, Math.min(0.45, (gy - _v.y) / (S * k)));
      wh.pivot.position.y += (target - wh.pivot.position.y) * (1 - Math.exp(-dt * 14));
      wh.spin.rotation.z = wheelSpin;
      contacts.push({ x: _v.x, y: gy, z: _v.z, rear: wh.base.x < 0, mid: wh.base.x === 0, left: wh.base.z < 0 });
    }
    // tyre tracks every ~2.5 m and dust from the rear wheels
    const fw = new THREE.Vector3(Math.cos(X.th), 0, -Math.sin(X.th)), side = new THREE.Vector3(Math.sin(X.th), 0, Math.cos(X.th));
    if (Math.abs(X.speed) > 0.2 && !X.paused) {
      const mids = contacts.filter(c => c.mid);
      if (!X.lastTrack || Math.hypot(mids[0].x - X.lastTrack.x, mids[0].z - X.lastTrack.z) > 2.5 * S) {
        X.lastTrack = { x: mids[0].x, z: mids[0].z };
        mids.forEach(c => addTrackPoint(tracks[c.left ? 0 : 1], new THREE.Vector3(c.x, c.y + 0.03, c.z), side, 0.28 * S * k));
      }
      const amount = X.cur.loose ? 2 : Math.random() < 0.45 ? 1 : 0;
      for (const c of contacts) if (c.rear) emitDust(c, fw.clone().multiplyScalar(-(0.6 + Math.abs(X.speed) / 10)), k, amount);
    }
    updateDust(dt);
    const tn = X.def.nodes[X.nav], tw = wUV(tn.u, tn.v);
    const brg = Math.atan2(-(tw.z - w.z), tw.x - w.x), as = S * k * 1.3;   // sized to the rover, floating right above it
    arrow.rotation.y = brg; arrow.scale.setScalar(as);
    arrow.position.copy(w).add(new THREE.Vector3(0, S * k * 4.6 + Math.sin(t * 3) * S * k * 0.25, 0));
    for (const m of marks) { const d = camera.position.distanceTo(m.beam.position), f = Math.min(1, Math.max(0.12, d / 160)); m.beam.scale.set(f, f, f); m.label.position.y = m.y + 14 * f + 1.2; }
    if (X.baseRing) { const f = Math.min(1, Math.max(0.08, camera.position.distanceTo(X.baseRing.position) / 200)); X.baseRing.scale.set(f, f, f); }
  }
  // free look: drag to orbit around the rover while driving; it eases back behind the rover after a moment
  const look = { yaw: 0, pitch: 0, drag: null, idle: 99, lock: false };
  ctx.canvas.addEventListener('pointerdown', e => { if (!X) return; look.drag = { x: e.clientX, y: e.clientY }; ctx.canvas.setPointerCapture?.(e.pointerId); });
  ctx.canvas.addEventListener('pointermove', e => {
    if (!X || !look.drag) return;
    look.yaw -= (e.clientX - look.drag.x) * 0.006; look.pitch = Math.max(-0.28, Math.min(1.1, look.pitch + (e.clientY - look.drag.y) * 0.004));
    look.drag = { x: e.clientX, y: e.clientY }; look.idle = 0;
  });
  addEventListener('pointerup', () => { look.drag = null; });
  ctx.canvas.addEventListener('dblclick', () => { if (X) { look.yaw = 0; look.pitch = 0; look.lock = false; } });
  function chase(dt) {
    const p = rov.position;
    look.idle += dt;
    if (!look.drag && !look.lock && look.idle > 2.5) { look.yaw *= Math.exp(-dt * 1.8); look.pitch *= Math.exp(-dt * 1.8); }
    const yaw = X.th + look.yaw, el = Math.max(0.04, Math.min(1.35, 0.33 + look.pitch));
    const fw = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const desired = p.clone().addScaledVector(fw, -camDist * Math.cos(el)).add(new THREE.Vector3(0, camDist * Math.sin(el) + 1.0, 0));
    const gy = ctx.groundY(desired.x, desired.z); if (desired.y < gy + 0.8) desired.y = gy + 0.8;   // never dip under a hill
    camera.position.lerp(desired, 1 - Math.exp(-dt * (look.drag ? 10 : 3)));
    const target = p.clone().addScaledVector(fw, camDist * 0.6 * Math.cos(el)).add(new THREE.Vector3(0, 0.6, 0));
    X.look.lerp(target, 1 - Math.exp(-dt * (look.drag ? 10 : 5))); camera.lookAt(X.look); controls.target.copy(X.look);
    ctx.sunFollow(p, camDist);
  }
  function setBar(id, frac, text, cls) {
    const el = $(id); el.querySelector('i').style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`; el.querySelector('.mv').textContent = text;
    el.classList.toggle('warn', cls === 'warn'); el.classList.toggle('bad', cls === 'bad');
  }
  function hud() {
    const d = X.def, bf = Math.max(0, X.battery) / d.battery, left = d.window - X.hours, c = X.cur;
    const ret = X.retEst ? X.retEst.kwh : null;
    setBar('tBattery', bf, `${Math.max(0, X.battery).toFixed(1)} kWh${ret != null ? ` · back ${ret.toFixed(1)}` : ''}`, bf < 0.1 || (ret != null && X.battery < ret) ? 'bad' : bf < 0.25 || (ret != null && X.battery < ret * 1.25) ? 'warn' : '');
    setBar('tClock', left / d.window, `${hhmm(left)} h left`, left < 0.5 ? 'bad' : left < 1.2 ? 'warn' : '');
    $('tSpeed').textContent = Math.abs(X.speed).toFixed(1);
    $('tGrade').textContent = `${Math.abs(c.grade).toFixed(1)}°`;
    $('tGradeU').textContent = `${Math.abs(c.grade) < 1.5 ? 'level' : c.grade > 0 ? 'uphill' : 'downhill'} · ${c.loose ? 'loose sand' : 'firm'}`;
    $('tTerrain').classList.toggle('warn', Math.abs(c.grade) > 15 || c.loose);
    $('tScore').textContent = X.score;
    const tn = X.def.nodes[X.nav], dm = distM(X, tn);
    $('navName').textContent = X.nav ? tn.name : 'Base (dock here)';
    $('navDist').textContent = `${(dm / 1000).toFixed(2)} km · ${X.nav ? `${tn.value} pts` : 'end expedition'}`;
    const brg = Math.atan2(-(tn.v - X.v) * HM, (tn.u - X.u) * WM), cd = new THREE.Vector3(); camera.getWorldDirection(cd);
    const yaw = Math.atan2(-cd.z, cd.x); $('navArrow').style.transform = `rotate(${-(brg - yaw) * 180 / Math.PI}deg)`;
    if (frame % 15 === 0) document.querySelectorAll('#xSites .dst').forEach(el => { const n = X.def.nodes[+el.dataset.i]; el.textContent = `${(distM(X, n) / 1000).toFixed(2)} km away`; });
  }
  function minimap() {
    const W = mm.width, H = mm.height; mmc.clearRect(0, 0, W, H);
    if (mmBase) mmc.drawImage(mmBase, 0, 0); mmc.fillStyle = 'rgba(10,6,4,.25)'; mmc.fillRect(0, 0, W, H);
    mmc.strokeStyle = '#ffb27a'; mmc.lineWidth = 1.5; mmc.beginPath(); X.trailPts.forEach((p, i) => i ? mmc.lineTo(p.u * W, p.v * H) : mmc.moveTo(p.u * W, p.v * H)); mmc.lineTo(X.u * W, X.v * H); mmc.stroke();
    const tn = X.def.nodes[X.nav]; mmc.setLineDash([3, 3]); mmc.strokeStyle = '#5fd6ff'; mmc.beginPath(); mmc.moveTo(X.u * W, X.v * H); mmc.lineTo(tn.u * W, tn.v * H); mmc.stroke(); mmc.setLineDash([]);
    X.def.nodes.forEach((n, i) => {
      const x = n.u * W, y = n.v * H;
      if (!i) { mmc.fillStyle = '#fff'; mmc.fillRect(x - 3.5, y - 3.5, 7, 7); return; }
      mmc.fillStyle = X.visited.includes(i) ? '#7ad79c' : i === X.nav ? '#5fd6ff' : '#ffb27a'; mmc.beginPath(); mmc.arc(x, y, 3.5, 0, 7); mmc.fill();
    });
    const x = X.u * W, y = X.v * H, a = -X.th; mmc.fillStyle = '#5fd6ff'; mmc.beginPath();
    mmc.moveTo(x + Math.cos(a) * 7, y + Math.sin(a) * 7); mmc.lineTo(x + Math.cos(a + 2.5) * 5, y + Math.sin(a + 2.5) * 5); mmc.lineTo(x + Math.cos(a - 2.5) * 5, y + Math.sin(a - 2.5) * 5); mmc.fill();
    mmc.fillStyle = 'rgba(255,255,255,.7)'; mmc.font = '10px JetBrains Mono'; mmc.fillText('HIGH-RES ZONE · CTX', 8, 14);
  }
  function update(dt, t) {
    if (!X) return; frame++;
    if (!X.paused && !X.ended) sim(dt);
    placeRover(dt, t); chase(dt); hud(); if (frame % 3 === 0) minimap();
  }

  // ---------- input ----------
  addEventListener('keydown', e => {
    if (!X || X.ended || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    const k = e.key.toLowerCase(); if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
    if (X.paused) return;
    keys[k] = true; const kc = document.querySelector(`.key[data-k="${k}"]`); if (kc) kc.classList.add('on');
    if (k === 'e' && X.near) { if (X.near.kind === 'site') openStation(X.near.i); else end('docked'); }
    if (k === 'r') toggleRoute();
    if (k === 'h') document.body.classList.toggle('hud-off');
    if (k === 'c') { look.lock = !look.lock; toast(look.lock ? 'Camera angle locked · press C to release' : 'Camera follows the rover'); }
  });
  addEventListener('keyup', e => { const k = e.key.toLowerCase(); keys[k] = false; const kc = document.querySelector(`.key[data-k="${k}"]`); if (kc) kc.classList.remove('on'); });
  addEventListener('blur', () => { keys = {}; document.querySelectorAll('.key.on').forEach(k => k.classList.remove('on')); });
  addEventListener('wheel', e => { if (!X) return; camDist = Math.min(90, Math.max(3, camDist * (1 + e.deltaY * 0.0012))); }, { passive: true });

  renderList();
  return { start, exit, update, renderList, showKeys, active: () => !!X, roverPos: () => (X ? rov.position : null), onExag: () => { if (X) { buildMarks(); rebuildTrail(); renderSites(); } },
    _test: { teleport(i) { const n = X.def.nodes[i]; X.u = n.u + 20 / WM; X.v = n.v; X.moved = Math.max(X.moved, 400); }, state: () => X } };
}
