// Tüftelinsel – die Insel: Gelände, Wasser, Werkstatt, Rampen, Bäume
import * as THREE from '../lib/three.module.min.js';
import { R } from './rapier.js';
import { toon, INK } from './parts.js';

export const WATER = 0;
export const SPAWN = [0, 3, 14];

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Geländehöhe
export function height(x, z) {
  const r = Math.hypot(x, z * 1.15);
  let h = 2.4 * (1 - smooth(70, 100, r)) - 4 * smooth(95, 140, r);
  h += 0.35 * Math.sin(x * 0.07) * Math.cos(z * 0.06) * (1 - smooth(20, 60, Math.hypot(x, z))) * 0; // Bauplatz bleibt flach
  h += 0.6 * Math.sin(x * 0.045 + 1) * Math.sin(z * 0.05) * smooth(35, 55, r) * (1 - smooth(80, 100, r));
  const hill = Math.hypot(x - 48, z + 38);
  h += 13 * (1 - smooth(0, 30, hill));
  const hill2 = Math.hypot(x + 55, z + 30);
  h += 6 * (1 - smooth(0, 20, hill2));
  return h;
}

const GRASS = new THREE.Color(0x7bc96f), GRASS2 = new THREE.Color(0x5fae5a), SAND = new THREE.Color(0xf0d99a), ROCK = new THREE.Color(0x9a93a8), SEABED = new THREE.Color(0xc9b47c);

export function buildMap(scene, world) {
  const ground = world.createRigidBody(R.RigidBodyDesc.fixed());
  const statics = new THREE.Group();
  scene.add(statics);

  // Gelände als Dreiecksnetz (gleiche Daten für Grafik und Physik)
  const N = 120, SIZE = 300, step = SIZE / N;
  const verts = [], cols = [], idx = [];
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    const x = -SIZE / 2 + i * step, z = -SIZE / 2 + j * step;
    const y = height(x, z);
    verts.push(x, y, z);
    const slope = Math.abs(height(x + 1, z) - y) + Math.abs(height(x, z + 1) - y);
    let c;
    if (y < -0.5) c = SEABED; else if (y < 0.9) c = SAND; else if (slope > 0.55 || y > 9) c = ROCK; else c = ((i + j) % 2 ? GRASS : GRASS2);
    cols.push(c.r, c.g, c.b);
  }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const terr = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  terr.receiveShadow = true;
  statics.add(terr);
  world.createCollider(R.ColliderDesc.trimesh(new Float32Array(verts), new Uint32Array(idx)).setFriction(0.9), ground);

  // Wasser
  const water = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), new THREE.MeshLambertMaterial({ color: 0x3fb6e0, transparent: true, opacity: 0.78 }));
  water.rotation.x = -Math.PI / 2; water.position.y = WATER; water.name = 'water';
  statics.add(water);
  // unsichtbare Wand weit draußen
  for (const [x, z, hx, hz] of [[0, 160, 170, 2], [0, -160, 170, 2], [160, 0, 2, 170], [-160, 0, 2, 170]])
    world.createCollider(R.ColliderDesc.cuboid(hx, 40, hz).setTranslation(x, 20, z), ground);

  const box = (pos, size, color, rotY, quat, noInk) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(...size), toon(color));
    const q = quat || new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY || 0);
    m.position.set(...pos); m.quaternion.copy(q);
    m.castShadow = true; m.receiveShadow = true;
    if (!noInk) {
      const o = new THREE.Mesh(m.geometry, new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide }));
      o.scale.set(...size.map(v => Math.min(1.3, 1 + 0.1 / v))); m.add(o);
    }
    statics.add(m);
    world.createCollider(R.ColliderDesc.cuboid(size[0] / 2, size[1] / 2, size[2] / 2).setTranslation(...pos).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }).setFriction(0.9), ground);
    return m;
  };

  // Bauplatz: helle Betonfläche in der Mitte
  const base = height(0, 0);
  box([0, base - 0.2 + 0.25, -6], [36, 0.5, 30], 0xd9d4c7);
  for (let i = -3; i <= 3; i++) box([i * 5, base + 0.51, -6], [0.25, 0.02, 29], 0xc4bdad, 0, null, true);

  // Werkstatt-Halle mit offenem Tor
  const hx = -30, hz = -8, hy = height(hx, hz);
  box([hx, hy - 0.1, hz], [16, 0.6, 14], 0x8a7f72);
  box([hx - 8, hy + 3, hz], [0.6, 6.2, 14], 0xe06a4a);
  box([hx, hy + 3, hz - 7], [16.6, 6.2, 0.6], 0xe06a4a);
  box([hx, hy + 3, hz + 7], [16.6, 6.2, 0.6], 0xe06a4a);
  box([hx, hy + 6.3, hz], [17.4, 0.5, 15.2], 0x5b4a6e);
  box([hx - 5, hy + 1, hz - 5.5], [4, 0.2, 1.8], 0xb98a52); // Werkbank
  box([hx - 6.8, hy + 0.5, hz - 5.5], [0.2, 1, 1.6], 0x7a5a36);
  box([hx - 3.2, hy + 0.5, hz - 5.5], [0.2, 1, 1.6], 0x7a5a36);

  // Rampen und Schanzen
  const rampAt = (x, z, len, hgt, wid, rotY, color) => {
    const y = height(x, z);
    const ang = Math.atan2(hgt, len);
    const L = Math.hypot(len, hgt);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(ang, rotY, 0, 'YXZ'));
    box([x, y + hgt / 2, z], [wid, 0.4, L], color || 0xf2c94c, 0, q);
  };
  rampAt(22, 18, 10, 3, 6, Math.PI, 0xf2c94c);
  rampAt(-10, 30, 12, 5, 5, Math.PI * 0.9, 0x6fc3df);
  rampAt(30, -10, 8, 2, 8, -Math.PI / 2, 0xff8a5c);

  // Steg ins Wasser
  for (let i = 0; i < 9; i++) box([8, 0.9, 92 + i * 2.2], [4, 0.3, 2], 0xa97c4f);
  for (let i = 0; i < 9; i += 2) { box([6, -0.6, 92 + i * 2.2], [0.35, 3.2, 0.35], 0x6b4a2e); box([10, -0.6, 92 + i * 2.2], [0.35, 3.2, 0.35], 0x6b4a2e); }

  // Treppe zum Aussichtsberg
  for (let i = 0; i < 10; i++) {
    const x = 26 + i * 1.6, z = -26 - i * 0.9;
    box([x, height(x, z) + 0.2, z], [2.4, 0.6, 2.4], 0xb7b0a0);
  }

  // Bäume und Felsen (feste Zufallsfolge, damit alle dasselbe sehen)
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const trunkMat = toon(0x8a5a33), leafA = toon(0x3e9e4f), leafB = toon(0x55b95c), rockMat = toon(0x9a93a8);
  for (let n = 0; n < 70; n++) {
    const a = rnd() * Math.PI * 2, r = 35 + rnd() * 55;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const y = height(x, z);
    if (y < 1.2 || Math.abs(x + 30) < 12 && Math.abs(z + 8) < 10) continue;
    if (rnd() < 0.75) {
      const s = 0.8 + rnd() * 0.7;
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.25 * s, 0.35 * s, 2.4 * s, 7), trunkMat);
      t.position.set(x, y + 1.2 * s, z); t.castShadow = true; statics.add(t);
      const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6 * s, 0), rnd() < 0.5 ? leafA : leafB);
      crown.position.set(x, y + 3.2 * s, z); crown.castShadow = true; statics.add(crown);
      const o = new THREE.Mesh(crown.geometry, new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide })); o.scale.setScalar(1.06); crown.add(o);
      world.createCollider(R.ColliderDesc.cylinder(1.2 * s, 0.3 * s).setTranslation(x, y + 1.2 * s, z), ground);
      world.createCollider(R.ColliderDesc.ball(1.4 * s).setTranslation(x, y + 3.2 * s, z), ground);
    } else {
      const s = 0.6 + rnd() * 1.4;
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rockMat);
      m.position.set(x, y + s * 0.4, z); m.rotation.set(rnd() * 3, rnd() * 3, 0); m.castShadow = true; statics.add(m);
      world.createCollider(R.ColliderDesc.ball(s * 0.9).setTranslation(x, y + s * 0.4, z), ground);
    }
  }
  return { ground, statics, water };
}
