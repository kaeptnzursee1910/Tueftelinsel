// Tüftelinsel – die Blockwelt im Spiel: Chunks laden und zeigen, Blöcke lesen und setzen, Zielstrahl
import * as THREE from '../lib/three.module.min.js';
import { CS, CH, SEA, idx, ckey, makeGen } from './gen.js';
import { B, BLOCKS, SOLID } from './blocks.js';
import { getAtlas } from './textures.js';

let worker = null, nextWid = 1, mats = null;

function materials() {
  if (mats) return mats;
  const tex = new THREE.CanvasTexture(getAtlas());
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  mats = {
    s: new THREE.MeshBasicMaterial({ map: tex, vertexColors: true }),
    c: new THREE.MeshBasicMaterial({ map: tex, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide }),
    w: new THREE.MeshBasicMaterial({ map: tex, vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
  };
  return mats;
}

export class World {
  constructor(scene, seed, edits) {
    this.scene = scene;
    this.seed = String(seed);
    this.gen = makeGen(this.seed);
    this.chunks = new Map();   // ckey -> {cx, cz, data, meshes}
    this.pending = new Set();
    this.edits = new Map();    // ckey -> Map(index -> block)
    this.dirty = false;
    this.radius = 5;
    this.group = new THREE.Group(); scene.add(this.group);
    for (const k in (edits || {})) { const a = edits[k], m = new Map(); for (let i = 0; i < a.length; i += 2) m.set(a[i], a[i + 1]); this.edits.set(k, m); }
    if (!worker) {
      worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
      worker.onerror = e => console.error('Worker', e);
    }
    this.wid = nextWid++;
    worker.onmessage = e => this.onWorker(e.data);
    worker.postMessage({ t: 'init', wid: this.wid, seed: this.seed, edits: this.editsObject() });
  }

  editsObject() {
    const o = {};
    for (const [k, m] of this.edits) { const a = []; for (const [i, b] of m) a.push(i, b); if (a.length) o[k] = a; }
    return o;
  }
  editCount() { let n = 0; for (const m of this.edits.values()) n += m.size; return n; }

  onWorker(m) {
    if (m.wid !== this.wid) return;
    const k = ckey(m.cx, m.cz);
    if (m.t === 'chunk') {
      this.pending.delete(k);
      if (!this.wanted(m.cx, m.cz)) { worker.postMessage({ t: 'unload', wid: this.wid, keys: [k], keep: 400 }); return; }
      // Änderungen, die seit dem Auftrag dazukamen, nachtragen
      const e = this.edits.get(k);
      if (e) for (const [i, b] of e) m.data[i] = b;
      const c = { cx: m.cx, cz: m.cz, data: m.data, meshes: [] };
      this.chunks.set(k, c);
      this.setMeshes(c, m.m);
    } else if (m.t === 'mesh') {
      const c = this.chunks.get(k);
      if (c) this.setMeshes(c, m.m);
    }
  }

  setMeshes(c, m) {
    for (const o of c.meshes) { this.group.remove(o); o.geometry.dispose(); }
    c.meshes = [];
    const M = materials();
    for (const key of ['s', 'c', 'w']) {
      const g = m[key];
      if (!g.idx.length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(g.pos, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(g.uv, 2));
      geo.setAttribute('color', new THREE.BufferAttribute(g.col, 3));
      geo.setIndex(new THREE.BufferAttribute(g.idx, 1));
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, M[key]);
      mesh.position.set(c.cx * CS, 0, c.cz * CS);
      mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      if (key === 'w') mesh.renderOrder = 2;
      this.group.add(mesh);
      c.meshes.push(mesh);
    }
  }

  wanted(cx, cz) {
    if (!this.center) return true;
    const dx = cx - this.center[0], dz = cz - this.center[1];
    return dx * dx + dz * dz <= (this.radius + 1.5) * (this.radius + 1.5);
  }

  // Chunks um die Position nachladen und weit entfernte entfernen
  update(x, z) {
    const ccx = Math.floor(x / CS), ccz = Math.floor(z / CS);
    this.center = [ccx, ccz];
    const R = this.radius;
    if (this.pending.size < 3) {
      let best = null, bd = Infinity;
      for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
        const d = dx * dx + dz * dz;
        if (d > R * R + 1 || d >= bd) continue;
        const k = ckey(ccx + dx, ccz + dz);
        if (this.chunks.has(k) || this.pending.has(k)) continue;
        best = [ccx + dx, ccz + dz, k]; bd = d;
      }
      if (best) { this.pending.add(best[2]); worker.postMessage({ t: 'load', wid: this.wid, cx: best[0], cz: best[1] }); }
    }
    if ((this._unT = (this._unT || 0) + 1) % 30 === 0) {
      const gone = [];
      for (const [k, c] of this.chunks) if (!this.wanted(c.cx, c.cz)) { for (const o of c.meshes) { this.group.remove(o); o.geometry.dispose(); } this.chunks.delete(k); gone.push(k); }
      if (gone.length) worker.postMessage({ t: 'unload', wid: this.wid, keys: gone, keep: (2 * R + 6) * (2 * R + 6) });
    }
  }

  loadedAround(x, z) { return this.chunks.has(ckey(Math.floor(x / CS), Math.floor(z / CS))); }
  progress() { const R = this.radius; let need = 0, have = 0; const [cx, cz] = this.center || [0, 0]; for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) { need++; if (this.chunks.has(ckey(cx + dx, cz + dz))) have++; } return R ? have / need : 1; }

  // -1 = noch nicht geladen
  get(x, y, z) {
    if (y < 0) return B.BEDROCK;
    if (y >= CH) return B.AIR;
    const cx = Math.floor(x / CS), cz = Math.floor(z / CS);
    const c = this.chunks.get(ckey(cx, cz));
    if (!c) return -1;
    return c.data[idx(x - cx * CS, y, z - cz * CS)];
  }
  solidAt(x, y, z) { const b = this.get(x, y, z); return b < 0 || SOLID[b] === 1; }

  // Block setzen (lokal), gibt true zurück, wenn sich etwas geändert hat
  set(x, y, z, b) {
    if (y < 1 || y >= CH) return false;
    const cx = Math.floor(x / CS), cz = Math.floor(z / CS);
    const k = ckey(cx, cz), i = idx(x - cx * CS, y, z - cz * CS);
    const c = this.chunks.get(k);
    if (c && c.data[i] === b) return false;
    if (c) c.data[i] = b;
    let e = this.edits.get(k); if (!e) this.edits.set(k, e = new Map());
    e.set(i, b);
    this.dirty = true;
    worker.postMessage({ t: 'set', wid: this.wid, list: [x, y, z, b] });
    return true;
  }

  setMany(list) {
    if (!list.length) return;
    for (let n = 0; n < list.length; n += 4) {
      const [x, y, z, b] = [list[n], list[n + 1], list[n + 2], list[n + 3]];
      const cx = Math.floor(x / CS), cz = Math.floor(z / CS);
      const k = ckey(cx, cz), i = idx(x - cx * CS, y, z - cz * CS);
      const c = this.chunks.get(k); if (c) c.data[i] = b;
      let e = this.edits.get(k); if (!e) this.edits.set(k, e = new Map());
      e.set(i, b);
    }
    this.dirty = true;
    worker.postMessage({ t: 'set', wid: this.wid, list });
  }

  // Schritt für Schritt durch das Blockgitter (Amanatides & Woo)
  raycast(o, d, max) {
    let x = Math.floor(o.x), y = Math.floor(o.y), z = Math.floor(o.z);
    const sx = Math.sign(d.x), sy = Math.sign(d.y), sz = Math.sign(d.z);
    const tdx = sx ? Math.abs(1 / d.x) : Infinity, tdy = sy ? Math.abs(1 / d.y) : Infinity, tdz = sz ? Math.abs(1 / d.z) : Infinity;
    let tmx = sx > 0 ? (x + 1 - o.x) * tdx : sx < 0 ? (o.x - x) * tdx : Infinity;
    let tmy = sy > 0 ? (y + 1 - o.y) * tdy : sy < 0 ? (o.y - y) * tdy : Infinity;
    let tmz = sz > 0 ? (z + 1 - o.z) * tdz : sz < 0 ? (o.z - z) * tdz : Infinity;
    let nx = 0, ny = 0, nz = 0, t = 0;
    for (let i = 0; i < 200 && t <= max; i++) {
      const b = this.get(x, y, z);
      if (b < 0) return null;
      if (b > 0 && BLOCKS[b].pick) return { x, y, z, b, nx, ny, nz, t };
      if (tmx < tmy && tmx < tmz) { x += sx; t = tmx; tmx += tdx; nx = -sx; ny = 0; nz = 0; }
      else if (tmy < tmz) { y += sy; t = tmy; tmy += tdy; nx = 0; ny = -sy; nz = 0; }
      else { z += sz; t = tmz; tmz += tdz; nx = 0; ny = 0; nz = -sz; }
    }
    return null;
  }

  // Was beim Abbauen übrig bleibt: unter dem Meeresspiegel fließt Wasser nach, wenn es daneben Wasser gibt
  afterBreak(x, y, z) {
    if (y > SEA) return B.AIR;
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]]) if (this.get(x + dx, y + dy, z + dz) === B.WATER) return B.WATER;
    return B.AIR;
  }

  dispose() {
    for (const c of this.chunks.values()) for (const o of c.meshes) o.geometry.dispose();
    this.scene.remove(this.group);
    this.chunks.clear();
    this.wid = -1;
  }
}
