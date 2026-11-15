// Load NASA 3D Resources GLB models and normalise them to our convention:
// metres, +x forward, +y up, wheels on y = 0, centred on the origin.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

// NASA's GLBs are Draco-compressed
const draco = new DRACOLoader().setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/gltf/');
const loader = new GLTFLoader().setDRACOLoader(draco);

export function loadModel(url, { length, zUp = 'auto', yaw = 0 }) {
  return new Promise((resolve, reject) => loader.load(url, (g) => {
    const obj = g.scene, wrap = new THREE.Group(), inner = new THREE.Group();
    inner.add(obj); wrap.add(inner);
    let size = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3());
    if (zUp === true || (zUp === 'auto' && size.z < size.y * 0.8 && size.y > size.x)) inner.rotation.x = -Math.PI / 2;
    inner.updateMatrixWorld(true); size = new THREE.Box3().setFromObject(inner).getSize(new THREE.Vector3());
    if (size.z > size.x) inner.rotation.y += Math.PI / 2;          // longest horizontal axis -> x
    inner.rotation.y += yaw;
    inner.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(inner); size = box.getSize(new THREE.Vector3());
    const s = length / Math.max(size.x, size.z); inner.scale.multiplyScalar(s); inner.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(inner); const c = box.getCenter(new THREE.Vector3());
    inner.position.set(-c.x, -box.min.y, -c.z);
    obj.traverse(o => {
      if (!o.isMesh) return; o.castShadow = true; o.receiveShadow = true;
      for (const m of [].concat(o.material || [])) { m.side = THREE.FrontSide; if (m.metalness > 0.5) m.metalness = 0.5; m.envMapIntensity = 1.2; }
    });
    resolve(wrap);
  }, undefined, reject));
}
