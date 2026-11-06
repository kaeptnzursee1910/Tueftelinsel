// Tüftelinsel – Spielfiguren: die eigene (Laufen, Springen, Schwimmen, Fliegen in der Blockwelt) und die der anderen
import * as THREE from '../lib/three.module.min.js';
import { B } from './blocks.js';

export const COLORS = [0xff5a5a, 0x4a9fff, 0x5fd068, 0xffc93c, 0xb57bff, 0xff8a3c, 0x3cd6c8, 0xff6fb5];
export const INK = 0x251f3a;
export const HW = 0.3, HEIGHT = 1.8, EYE = 1.62;

const matCache = new Map();
function toon(color) {
  if (!matCache.has(color)) matCache.set(color, new THREE.MeshLambertMaterial({ color, flatShading: true }));
  return matCache.get(color);
}

// Runde Figur mit Augen im Stil der Horizon-Rush-Minispiele
export function avatarMesh(color, name) {
  const g = new THREE.Group();
  const inner = new THREE.Group(); inner.position.y = 0.95; g.add(inner);
  const ink = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
  const bodyGeo = new THREE.SphereGeometry(0.5, 18, 14);
  const body = new THREE.Mesh(bodyGeo, toon(color)); body.scale.set(0.9, 1.4, 0.9); body.position.y = 0.05;
  const o = new THREE.Mesh(bodyGeo, ink); o.scale.setScalar(1.06); body.add(o);
  inner.add(body);
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff }), black = new THREE.MeshBasicMaterial({ color: 0x15121f });
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), white); eye.position.set(s * 0.16, 0.42, -0.38); eye.scale.z = 0.6;
    const pup = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 6), black); pup.position.set(0, 0, -0.1); eye.add(pup);
    eye.name = 'eye' + s;
    inner.add(eye);
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), toon(0x2a2438)); foot.scale.set(1, 0.6, 1.4); foot.position.set(s * 0.2, -0.85, -0.05); foot.name = 'foot' + s;
    inner.add(foot);
  }
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
  const c = cv.getContext('2d');
  c.font = 'bold 34px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.lineWidth = 7; c.strokeStyle = '#251f3a'; c.strokeText(name, 128, 32);
  c.fillStyle = '#' + color.toString(16).padStart(6, '0'); c.fillText(name, 128, 32);
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false, transparent: true }));
  tag.scale.set(1.6, 0.4, 1); tag.position.y = 2.25; tag.renderOrder = 10;
  g.add(tag);
  return g;
}

// Die eigene Figur. pos = Mitte der Füße
export class Me {
  constructor(world, p) {
    this.world = world;
    this.pos = new THREE.Vector3(p[0], p[1], p[2]);
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = -0.15;
    this.onGround = false; this.swim = false; this.fly = false; this.headWater = false;
  }

  eye(out) { return (out || new THREE.Vector3()).set(this.pos.x, this.pos.y + EYE, this.pos.z); }
  dir(out) {
    out = out || new THREE.Vector3();
    return out.set(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
  }

  // Berührt die Figur an Position (x, y, z) einen festen Block?
  hits(x, y, z) {
    const w = this.world;
    const x0 = Math.floor(x - HW), x1 = Math.floor(x + HW), y0 = Math.floor(y), y1 = Math.floor(y + HEIGHT - 0.001), z0 = Math.floor(z - HW), z1 = Math.floor(z + HW);
    for (let by = y0; by <= y1; by++) for (let bz = z0; bz <= z1; bz++) for (let bx = x0; bx <= x1; bx++) if (w.solidAt(bx, by, bz)) return true;
    return false;
  }

  // Überlappt ein Block die Figur? (zum Bauen)
  overlaps(bx, by, bz) {
    const p = this.pos;
    return bx + 1 > p.x - HW && bx < p.x + HW && bz + 1 > p.z - HW && bz < p.z + HW && by + 1 > p.y && by < p.y + HEIGHT;
  }

  // mx/my: Stick (-1..1), up/down: Springen bzw. Runter gehalten
  update(dt, mx, my, up, down, autoJump) {
    const w = this.world, p = this.pos, v = this.vel;
    if (!w.loadedAround(p.x, p.z)) return;
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const feet = w.get(Math.floor(p.x), Math.floor(p.y + 0.3), Math.floor(p.z));
    this.swim = feet === B.WATER;
    this.headWater = w.get(Math.floor(p.x), Math.floor(p.y + EYE), Math.floor(p.z)) === B.WATER;
    const speed = this.fly ? 10 : this.swim ? 3.2 : 4.6;
    const want = fwd.multiplyScalar(my * speed).addScaledVector(right, mx * speed);
    const acc = this.fly ? 8 : this.onGround ? 18 : this.swim ? 6 : 5;
    v.x += (want.x - v.x) * Math.min(1, acc * dt);
    v.z += (want.z - v.z) * Math.min(1, acc * dt);
    if (this.fly) {
      const vy = (up ? 8 : 0) - (down ? 8 : 0);
      v.y += (vy - v.y) * Math.min(1, 10 * dt);
    } else if (this.swim) {
      v.y += (up ? 14 : -8) * dt;
      v.y *= Math.max(0, 1 - 2.5 * dt);
      v.y = Math.max(-3, Math.min(up && !this.headWater ? 6.5 : 3.2, v.y));
    } else {
      v.y -= 28 * dt;
      if (v.y < -40) v.y = -40;
      if (up && this.onGround) { v.y = 8.6; this.onGround = false; }
    }
    // Bewegung Achse für Achse, in kleinen Schritten
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z)) * dt / 0.4));
    const h = dt / steps;
    let blockedH = false;
    this.onGround = false;
    for (let s = 0; s < steps; s++) {
      // y
      let ny = p.y + v.y * h;
      if (this.hits(p.x, ny, p.z)) {
        if (v.y < 0) { ny = Math.floor(ny) + 1; this.onGround = true; if (this.hits(p.x, ny, p.z)) ny = p.y; }
        else { ny = Math.floor(ny + HEIGHT) - HEIGHT - 0.001; if (this.hits(p.x, ny, p.z)) ny = p.y; }
        v.y = 0;
      }
      p.y = ny;
      // x
      let nx = p.x + v.x * h;
      if (this.hits(nx, p.y, p.z)) {
        nx = v.x > 0 ? Math.floor(nx + HW) - HW - 0.001 : Math.floor(nx - HW) + 1 + HW + 0.001;
        if (this.hits(nx, p.y, p.z)) nx = p.x;
        v.x = 0; blockedH = true;
      }
      p.x = nx;
      // z
      let nz = p.z + v.z * h;
      if (this.hits(p.x, p.y, nz)) {
        nz = v.z > 0 ? Math.floor(nz + HW) - HW - 0.001 : Math.floor(nz - HW) + 1 + HW + 0.001;
        if (this.hits(p.x, p.y, nz)) nz = p.z;
        v.z = 0; blockedH = true;
      }
      p.z = nz;
    }
    if (this.fly && this.onGround && !up) this.fly = false; // gelandet
    // Automatisch eine Stufe hochspringen (für das iPad)
    if (autoJump && blockedH && this.onGround && !this.fly && (Math.abs(mx) + Math.abs(my)) > 0.3) {
      const ahead = new THREE.Vector3(want.x, 0, want.z).normalize().multiplyScalar(0.6);
      if (this.hits(p.x + ahead.x, p.y + 0.01, p.z + ahead.z) && !this.hits(p.x + ahead.x, p.y + 1.05, p.z + ahead.z) && !this.hits(p.x, p.y + 1.05, p.z)) v.y = 8.6;
    }
    // Feststecken (z. B. Block in der Figur): nach oben schieben
    if (this.hits(p.x, p.y, p.z) && !this.hits(p.x, Math.floor(p.y) + 1, p.z)) p.y = Math.floor(p.y) + 1;
    if (p.y < -10) return 'fell';
  }
}

// Die Figuren der anderen Spieler
export class Others {
  constructor(scene) { this.scene = scene; this.map = new Map(); }

  ensure(pl) {
    let o = this.map.get(pl.id);
    if (!o) {
      const mesh = avatarMesh(COLORS[pl.color % COLORS.length], pl.name || 'Spieler');
      this.scene.add(mesh);
      o = { id: pl.id, mesh, p: new THREE.Vector3(...(pl.p || [0, -100, 0])), yaw: 0, pitch: 0, t: 0, seen: false };
      this.map.set(pl.id, o);
    }
    return o;
  }

  setState(id, s) {
    const o = this.map.get(id); if (!o || !s || !s.p) return;
    o.tp = s.p; o.tyaw = s.yaw; o.pitch = s.pitch || 0; o.fly = !!s.fly;
    if (!o.seen) { o.p.set(s.p[0], s.p[1], s.p[2]); o.yaw = s.yaw || 0; o.seen = true; }
  }

  remove(id) {
    const o = this.map.get(id); if (!o) return;
    this.scene.remove(o.mesh);
    this.map.delete(id);
  }

  clear() { for (const id of [...this.map.keys()]) this.remove(id); }

  // Steht eine andere Figur in diesem Block?
  blocks(bx, by, bz) {
    for (const o of this.map.values()) {
      if (!o.seen) continue;
      const p = o.p;
      if (bx + 1 > p.x - HW && bx < p.x + HW && bz + 1 > p.z - HW && bz < p.z + HW && by + 1 > p.y && by < p.y + HEIGHT) return true;
    }
    return false;
  }

  update(dt) {
    const k = Math.min(1, dt * 14);
    for (const o of this.map.values()) {
      if (o.tp) o.p.lerp(new THREE.Vector3(o.tp[0], o.tp[1], o.tp[2]), k);
      if (o.tyaw !== undefined) { let d = o.tyaw - o.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); o.yaw += d * k; }
      o.mesh.visible = o.seen;
      o.mesh.position.copy(o.p);
      o.mesh.rotation.y = o.yaw;
      const moving = o.tp ? Math.hypot(o.tp[0] - o.p.x, o.tp[2] - o.p.z) > 0.04 : false;
      o.t += dt * (moving ? 12 : 0);
      for (const s of [-1, 1]) { const f = o.mesh.getObjectByName('foot' + s); if (f) f.position.z = -0.05 + (moving && !o.fly ? Math.sin(o.t + (s > 0 ? Math.PI : 0)) * 0.15 : 0); }
    }
  }
}
