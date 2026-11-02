// Tüftelinsel – Bauteile: Form, Gewicht, Aussehen
import * as THREE from '../lib/three.module.min.js';
import { R } from './rapier.js';

export const INK = 0x251f3a;

// mat: Holz schwimmt, Metall geht unter (float = Auftrieb im Wasser)
export const PARTS = {
  box:      { name: 'Kiste',        icon: '📦', shape: 'box', size: [1, 1, 1], density: 0.5, color: 0xd99a55, float: 1.7 },
  bigbox:   { name: 'Große Kiste',  icon: '🟫', shape: 'box', size: [2, 2, 2], density: 0.35, color: 0xc07a3c, float: 2.2 },
  plank:    { name: 'Brett',        icon: '🪵', shape: 'box', size: [3, 0.16, 0.8], density: 0.5, color: 0xe8b46a, float: 1.8 },
  beam:     { name: 'Balken',       icon: '📏', shape: 'box', size: [4, 0.3, 0.3], density: 1.2, color: 0x8e9bb0, float: 0.6 },
  plate:    { name: 'Platte',       icon: '⬜', shape: 'box', size: [4, 0.16, 4], density: 0.7, color: 0xb7c2cf, float: 1.2 },
  ball:     { name: 'Kugel',        icon: '🔴', shape: 'ball', r: 0.5, density: 0.6, color: 0xff5a5a, float: 1.6, bounce: 0.55 },
  barrel:   { name: 'Fass',         icon: '🛢️', shape: 'cyl', r: 0.45, h: 1.2, density: 0.6, color: 0x3d8f6a, float: 1.5 },
  ramp:     { name: 'Rampe',        icon: '📐', shape: 'ramp', size: [2, 1, 2.4], density: 0.6, color: 0xf2c94c, float: 1.6 },
  wheel:    { name: 'Rad',          icon: '⚙️', shape: 'wheel', r: 0.6, h: 0.35, density: 0.6, color: 0x34343f, float: 1.2, friction: 2.2 },
  seat:     { name: 'Fahrersitz',   icon: '💺', shape: 'seat', density: 0.6, color: 0x4a7fe0, float: 1.6 },
  thruster: { name: 'Schubdüse',    icon: '🚀', shape: 'thruster', r: 0.25, h: 0.7, density: 0.8, color: 0xd0d6e0, float: 1.0 },
  balloon:  { name: 'Ballon',       icon: '🎈', shape: 'ball', r: 0.6, density: 0.03, color: 0xff6fb5, float: 3, lift: 6.5 },
  domino:   { name: 'Dominostein',  icon: '🁢', shape: 'box', size: [0.5, 1.6, 0.18], density: 0.6, color: 0xf4f1ea, float: 1.6 },
};

// Reihenfolge im Bauteile-Menü
export const SPAWN_ORDER = ['box', 'bigbox', 'plank', 'beam', 'plate', 'ball', 'barrel', 'ramp', 'domino', 'wheel', 'seat', 'thruster', 'balloon'];

const q0 = { x: 0, y: 0, z: 0, w: 1 };

// halbe Höhe über dem Boden, damit neue Teile nicht im Boden stecken
export function partHalfHeight(type) {
  const d = PARTS[type];
  switch (d.shape) {
    case 'box': case 'ramp': return d.size[1] / 2;
    case 'ball': return d.r;
    case 'cyl': return d.h / 2;
    case 'wheel': return d.r;
    case 'seat': return 0.6;
    case 'thruster': return d.h / 2;
  }
  return 0.5;
}

const RAMP_PTS = s => {
  const [x, y, z] = s.map(v => v / 2);
  return [-x, -y, -z, x, -y, -z, -x, -y, z, x, -y, z, -x, y, z, x, y, z];
};

// Colliders eines Teils. sq: zusätzliche Drehung der Form im Körper (für Räder an Achsen)
export function colliderDescs(type, sq) {
  const d = PARTS[type];
  const out = [];
  const add = (desc, t, r) => {
    let tv = new THREE.Vector3(...(t || [0, 0, 0]));
    let rq = new THREE.Quaternion(...(r || [0, 0, 0, 1]));
    if (sq) { const s = new THREE.Quaternion(sq[0], sq[1], sq[2], sq[3]); tv.applyQuaternion(s); rq.premultiply(s); }
    desc.setTranslation(tv.x, tv.y, tv.z).setRotation({ x: rq.x, y: rq.y, z: rq.z, w: rq.w });
    desc.setDensity(d.density).setFriction(d.friction || 0.8).setRestitution(d.bounce || 0.05);
    out.push(desc);
  };
  const cylX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2).toArray();
  switch (d.shape) {
    case 'box': add(R.ColliderDesc.cuboid(d.size[0] / 2, d.size[1] / 2, d.size[2] / 2)); break;
    case 'ball': add(R.ColliderDesc.ball(d.r)); break;
    case 'cyl': add(R.ColliderDesc.cylinder(d.h / 2, d.r)); break;
    case 'wheel': add(R.ColliderDesc.roundCylinder(d.h / 2 - 0.05, d.r - 0.05, 0.05), null, cylX); break;
    case 'thruster': add(R.ColliderDesc.cylinder(d.h / 2, d.r)); break;
    case 'ramp': add(R.ColliderDesc.convexHull(new Float32Array(RAMP_PTS(d.size)))); break;
    case 'seat':
      add(R.ColliderDesc.cuboid(0.45, 0.12, 0.45), [0, -0.48, 0]);
      add(R.ColliderDesc.cuboid(0.45, 0.4, 0.08), [0, -0.0, 0.37]);
      break;
  }
  return out;
}

// --- Aussehen: kräftige Farben mit dunklem Umriss (umgedrehte Hülle) ---
const matCache = new Map();
export function toon(color) {
  if (!matCache.has(color)) matCache.set(color, new THREE.MeshLambertMaterial({ color, flatShading: true }));
  return matCache.get(color);
}
const inkMat = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });

function outlined(geo, mat, k) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true;
  const o = new THREE.Mesh(geo, inkMat);
  if (Array.isArray(k)) o.scale.set(...k); else o.scale.setScalar(k || 1.06);
  g.add(m, o);
  return g;
}

function rampGeo(s) {
  const p = RAMP_PTS(s);
  const v = i => [p[i * 3], p[i * 3 + 1], p[i * 3 + 2]];
  const tris = [[0, 2, 1], [1, 2, 3], [2, 4, 3], [3, 4, 5], [0, 1, 5], [0, 5, 4], [0, 4, 2], [1, 3, 5]];
  const pos = [];
  for (const t of tris) for (const i of [t[0], t[2], t[1]]) pos.push(...v(i));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

export function partMesh(type, sq, color) {
  const d = PARTS[type];
  const c = color || d.color;
  const root = new THREE.Group();
  const inner = new THREE.Group();
  if (sq) inner.quaternion.set(sq[0], sq[1], sq[2], sq[3]);
  root.add(inner);
  switch (d.shape) {
    case 'box': {
      const g = outlined(new THREE.BoxGeometry(...d.size), toon(c), d.size.map(v => 1 + 0.07 / v));
      inner.add(g);
      if (type === 'box' || type === 'bigbox') { // Brettermuster
        const s = d.size[0];
        const strip = new THREE.Mesh(new THREE.BoxGeometry(s * 1.01, s * 0.12, s * 1.01), toon(0xa86a2e));
        strip.position.y = s * 0.3; inner.add(strip);
        const strip2 = strip.clone(); strip2.position.y = -s * 0.3; inner.add(strip2);
      }
      break;
    }
    case 'ball': {
      inner.add(outlined(new THREE.IcosahedronGeometry(d.r, 2), toon(c)));
      if (type === 'balloon') {
        const knot = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.16, 8), toon(c)); knot.position.y = -d.r - 0.04; knot.rotation.x = Math.PI; inner.add(knot);
        const shine = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }));
        shine.position.set(-0.22, 0.25, 0.3); inner.add(shine);
      }
      break;
    }
    case 'cyl': {
      inner.add(outlined(new THREE.CylinderGeometry(d.r, d.r, d.h, 16), toon(c)));
      for (const y of [-0.3, 0.3]) { const ring = new THREE.Mesh(new THREE.CylinderGeometry(d.r * 1.03, d.r * 1.03, 0.07, 16), toon(0x24543e)); ring.position.y = y * d.h; inner.add(ring); }
      break;
    }
    case 'wheel': {
      const w = new THREE.Group();
      w.add(outlined(new THREE.CylinderGeometry(d.r, d.r, d.h, 20), toon(c), 1.05));
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(d.r * 0.45, d.r * 0.45, d.h * 1.06, 12), toon(0xf2c94c)); w.add(hub);
      const sp = new THREE.Mesh(new THREE.BoxGeometry(d.r * 1.5, d.h * 1.1, 0.1), toon(0xf2c94c)); w.add(sp);
      w.rotation.z = Math.PI / 2;
      inner.add(w);
      break;
    }
    case 'thruster': {
      inner.add(outlined(new THREE.CylinderGeometry(d.r * 0.8, d.r, d.h, 14), toon(c)));
      const noz = new THREE.Mesh(new THREE.CylinderGeometry(d.r * 0.7, d.r * 1.1, 0.22, 14), toon(0x555a66)); noz.position.y = -d.h / 2 - 0.08; inner.add(noz);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(d.r * 0.8, 1.1, 10), new THREE.MeshBasicMaterial({ color: 0xffa020, transparent: true, opacity: 0.85 }));
      flame.rotation.x = Math.PI; flame.position.y = -d.h / 2 - 0.75; flame.visible = false; flame.name = 'flame';
      inner.add(flame);
      break;
    }
    case 'ramp': inner.add(outlined(rampGeo(d.size), toon(c), 1.04)); break;
    case 'seat': {
      const b = outlined(new THREE.BoxGeometry(0.9, 0.24, 0.9), toon(c), [1.08, 1.3, 1.08]); b.position.y = -0.48; inner.add(b);
      const back = outlined(new THREE.BoxGeometry(0.9, 0.8, 0.16), toon(c), [1.08, 1.08, 1.4]); back.position.set(0, 0, 0.37); inner.add(back);
      const cush = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.06, 0.8), toon(0x2c56b0)); cush.position.y = -0.34; inner.add(cush);
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.3, 3), toon(0xf2c94c)); arrow.rotation.x = -Math.PI / 2; arrow.position.set(0, -0.32, -0.5); inner.add(arrow);
      break;
    }
  }
  return root;
}

export { q0 };
