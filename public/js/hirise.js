// HiRISE high-resolution tiles (1 m/px imagery, 4 m height grid) streamed around a focus point.
// Where a tile is loaded, the coarse CTX surface underneath is cut out in the shader (no z-fighting).
export function createHiRes(ctx) {
  const { THREE, scene, S, EC, NC, renderer, detailMat } = ctx;
  const MAXH = 16;
  const holes = { value: Array.from({ length: MAXH }, () => new THREE.Vector4(1e9, 1e9, -1e9, -1e9)) }, holeN = { value: 0 };
  detailMat.onBeforeCompile = (sh) => {
    sh.uniforms.holes = holes; sh.uniforms.holeN = holeN;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vHW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvHW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vHW; uniform vec4 holes[${MAXH}]; uniform int holeN;`)
      .replace('void main() {', `void main() {\n for (int i = 0; i < ${MAXH}; i++) { if (i >= holeN) break; vec4 r = holes[i]; if (vHW.x > r.x && vHW.x < r.z && vHW.z > r.y && vHW.z < r.w) discard; }`);
  };
  detailMat.needsUpdate = true;

  let M = null;
  fetch('data/hirise/manifest.json').then(r => r.ok ? r.json() : null).then(m => { if (m) { M = m; M.ok = new Map(m.tiles.filter(t => t.ok).map(t => [`${t.tx}_${t.ty}`, t])); } }).catch(() => {});
  const TL = new THREE.TextureLoader(), group = new THREE.Group(); scene.add(group);
  const tiles = new Map();
  let enabled = false;

  function buildMesh(rec) {
    const n = M.dtm_n, step = M.tile_m / (n - 1), xL = M.origin.minX + rec.tx * M.tile_m, yT = M.origin.maxY - rec.ty * M.tile_m;
    const g = new THREE.BufferGeometry(), p = new Float32Array(n * n * 3), uv = new Float32Array(n * n * 2), idx = new Uint32Array((n - 1) * (n - 1) * 6);
    let q = 0;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = j * n + i;
      p[k * 3] = (xL + i * step - EC) * S; p[k * 3 + 1] = ctx.yOf(rec.h[k]); p[k * 3 + 2] = (NC - (yT - j * step)) * S;
      uv[k * 2] = i / (n - 1); uv[k * 2 + 1] = 1 - j / (n - 1);
      if (i < n - 1 && j < n - 1) { idx[q++] = k; idx[q++] = k + n; idx[q++] = k + 1; idx[q++] = k + 1; idx[q++] = k + n; idx[q++] = k + n + 1; }
    }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals(); g.computeBoundingSphere();
    if (rec.mesh) { rec.mesh.geometry.dispose(); rec.mesh.geometry = g; return; }
    rec.mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: rec.tex, roughness: 0.95, metalness: 0, envMapIntensity: 0.15 }));
    rec.mesh.receiveShadow = true; group.add(rec.mesh);
  }
  async function load(key, t) {
    const rec = { key, tx: t.tx, ty: t.ty, t, state: 'loading' }; tiles.set(key, rec);
    try {
      const [buf, tex] = await Promise.all([fetch(`data/hirise/t_${key}.u16`).then(r => r.arrayBuffer()), TL.loadAsync(`data/hirise/t_${key}.jpg`)]);
      if (tiles.get(key) !== rec) { tex.dispose(); return; }
      const u = new Uint16Array(buf); rec.h = new Float32Array(u.length); for (let i = 0; i < u.length; i++) rec.h[i] = t.min + u[i] * t.scale;
      tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = renderer.capabilities.getMaxAnisotropy(); rec.tex = tex;
      buildMesh(rec); rec.state = 'ready'; updateHoles();
    } catch { tiles.delete(key); }
  }
  function unload(key) {
    const r = tiles.get(key); tiles.delete(key); if (!r) return;
    if (r.mesh) { group.remove(r.mesh); r.mesh.geometry.dispose(); r.mesh.material.dispose(); }
    if (r.tex) r.tex.dispose();
  }
  function updateHoles() {
    let i = 0;
    for (const r of tiles.values()) {
      if (r.state !== 'ready' || i >= MAXH || !enabled) continue;
      const xL = M.origin.minX + r.tx * M.tile_m, yT = M.origin.maxY - r.ty * M.tile_m, e = 0.02;
      holes.value[i++].set((xL - EC) * S + e, (NC - yT) * S + e, (xL + M.tile_m - EC) * S - e, (NC - (yT - M.tile_m)) * S - e);
    }
    holeN.value = i; group.visible = enabled;
  }
  // keep the 3x3 tiles around the focus point (world coords) loaded
  let lastKey = '';
  function update(focus, on) {
    if (!M) return;
    if (!on || !focus) { if (enabled || tiles.size) { enabled = false; for (const k of [...tiles.keys()]) unload(k); lastKey = ''; updateHoles(); } return; }
    enabled = true;
    const E = focus.x / S + EC, N = NC - focus.z / S, tx = Math.floor((E - M.origin.minX) / M.tile_m), ty = Math.floor((M.origin.maxY - N) / M.tile_m), key = `${tx}_${ty}`;
    if (key === lastKey) return; lastKey = key;
    const want = new Set();
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const k = `${tx + dx}_${ty + dy}`; if (M.ok.has(k)) want.add(k); }
    for (const k of [...tiles.keys()]) if (!want.has(k)) unload(k);
    for (const k of want) if (!tiles.has(k)) load(k, M.ok.get(k));
    updateHoles();
  }
  // HiRISE height (m) at a CTX-frame easting/northing, or null where no tile is loaded
  function heightAt(E, N) {
    if (!M || !enabled) return null;
    const fx = (E - M.origin.minX) / M.tile_m, fy = (M.origin.maxY - N) / M.tile_m, tx = Math.floor(fx), ty = Math.floor(fy);
    const r = tiles.get(`${tx}_${ty}`); if (!r || r.state !== 'ready') return null;
    const n = M.dtm_n, x = (fx - tx) * (n - 1), y = (fy - ty) * (n - 1), x0 = Math.min(Math.floor(x), n - 2), y0 = Math.min(Math.floor(y), n - 2), a = x - x0, b = y - y0, h = r.h;
    return (h[y0 * n + x0] * (1 - a) + h[y0 * n + x0 + 1] * a) * (1 - b) + (h[(y0 + 1) * n + x0] * (1 - a) + h[(y0 + 1) * n + x0 + 1] * a) * b;
  }
  function rebuild() { for (const r of tiles.values()) if (r.state === 'ready') buildMesh(r); }
  return { update, heightAt, rebuild, stats: () => ({ manifest: !!M, loaded: [...tiles.values()].filter(r => r.state === 'ready').length, enabled }) };
}
