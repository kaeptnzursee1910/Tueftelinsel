// Tüftelinsel – Spielfiguren: eigene Figur (Laufen, Springen, Schwimmen, Sitzen) und die Figuren der anderen
import * as THREE from '../lib/three.module.min.js';
import { R } from './rapier.js';
import { toon, INK } from './parts.js';
import { WATER, SPAWN } from './map.js';

export const COLORS = [0xff5a5a, 0x4a9fff, 0x5fd068, 0xffc93c, 0xb57bff, 0xff8a3c, 0x3cd6c8, 0xff6fb5];
export const COLOR_NAMES = ['Rot', 'Blau', 'Grün', 'Gelb', 'Lila', 'Orange', 'Türkis', 'Pink'];
const HALF = 0.45, RAD = 0.35, EYE = 0.65; // Kapsel: Mitte bei 0.8 über den Füßen, Augen 1.45 über den Füßen

// Runde Figur mit Augen im Stil der Horizon-Rush-Minispiele
export function avatarMesh(color, name) {
  const g = new THREE.Group();
  const ink = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
  const bodyGeo = new THREE.SphereGeometry(0.5, 18, 14);
  const body = new THREE.Mesh(bodyGeo, toon(color)); body.scale.set(1, 1.25, 1); body.position.y = 0.05; body.castShadow = true;
  const o = new THREE.Mesh(bodyGeo, ink); o.scale.setScalar(1.06); body.add(o);
  g.add(body);
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff }), black = new THREE.MeshBasicMaterial({ color: 0x15121f });
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), white); eye.position.set(s * 0.17, 0.32, -0.42); eye.scale.z = 0.6;
    const pup = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 6), black); pup.position.set(0, 0, -0.1); eye.add(pup);
    g.add(eye);
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), toon(0x2a2438)); foot.scale.set(1, 0.6, 1.4); foot.position.set(s * 0.2, -0.72, -0.05); foot.name = 'foot' + s;
    g.add(foot);
  }
  // Namensschild
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
  const c = cv.getContext('2d');
  c.font = 'bold 34px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.lineWidth = 7; c.strokeStyle = '#251f3a'; c.strokeText(name, 128, 32);
  c.fillStyle = '#' + color.toString(16).padStart(6, '0'); c.fillText(name, 128, 32);
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false, transparent: true }));
  tag.scale.set(1.6, 0.4, 1); tag.position.y = 1.15; tag.renderOrder = 10;
  g.add(tag);
  return g;
}

// Kapsel-Körper in der Physikwelt (kinematisch): schiebt Teile beim Gastgeber weg
export function avatarBody(world, pos) {
  const body = world.pw.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(pos[0], pos[1] + HALF + RAD, pos[2]));
  const col = world.pw.createCollider(R.ColliderDesc.capsule(HALF, RAD).setFriction(0.2), body);
  world.avatarColliders.add(col.handle);
  return { body, col };
}

// Die eigene Figur
export class Me {
  constructor(world, scene) {
    this.world = world;
    this.pos = new THREE.Vector3(SPAWN[0] + (Math.random() - 0.5) * 6, SPAWN[1], SPAWN[2] + (Math.random() - 0.5) * 3); // Füße
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = -0.1;
    this.onGround = false; this.swim = false;
    this.seat = 0;
    const { body, col } = avatarBody(world, this.pos.toArray());
    this.body = body; this.col = col;
    this.kcc = world.pw.createCharacterController(0.03);
    this.kcc.setUp({ x: 0, y: 1, z: 0 });
    this.kcc.setMaxSlopeClimbAngle(50 * Math.PI / 180);
    this.kcc.setMinSlopeSlideAngle(55 * Math.PI / 180);
    this.kcc.enableAutostep(0.45, 0.2, false);
    this.kcc.enableSnapToGround(0.35);
    this.kcc.setApplyImpulsesToDynamicBodies(true);
    this.kcc.setCharacterMass(3);
    this.ignore = null; // Teil, das ich halte: nicht dagegen laufen
  }

  eye(out) { return (out || new THREE.Vector3()).set(this.pos.x, this.pos.y + HALF + RAD + EYE, this.pos.z); }
  dir(out) {
    out = out || new THREE.Vector3();
    return out.set(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
  }

  respawn() { this.pos.set(SPAWN[0], SPAWN[1] + 1, SPAWN[2]); this.vel.set(0, 0, 0); this.seat = 0; }

  // mx/my: Stick (-1..1), jump: Taste gehalten
  update(dt, mx, my, jump) {
    const w = this.world;
    if (this.seat) {
      const s = w.parts.get(this.seat);
      if (!s) { this.leaveSeat(); }
      else {
        const m = s.mesh;
        const p = new THREE.Vector3(0, -0.25, 0.05).applyQuaternion(m.quaternion).add(m.position);
        this.pos.set(p.x, p.y - (HALF + RAD) + 0.15, p.z);
        this.body.setNextKinematicTranslation({ x: p.x, y: p.y, z: p.z });
        return;
      }
    }
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const speed = this.swim ? 4 : 6.5;
    const want = fwd.multiplyScalar(my * speed).addScaledVector(right, mx * speed);
    const acc = this.onGround ? 14 : 4;
    this.vel.x += (want.x - this.vel.x) * Math.min(1, acc * dt);
    this.vel.z += (want.z - this.vel.z) * Math.min(1, acc * dt);
    this.swim = this.pos.y + 0.9 < WATER;
    if (this.swim) {
      this.vel.y += (jump ? 6 : -2) * dt * 4;
      this.vel.y *= Math.max(0, 1 - 3 * dt);
      this.vel.y = Math.max(-3, Math.min(4, this.vel.y));
    } else {
      this.vel.y -= 22 * dt;
      if (jump && this.onGround) { this.vel.y = 8; this.onGround = false; }
    }
    const delta = this.vel.clone().multiplyScalar(dt);
    const ign = this.ignore;
    this.kcc.computeColliderMovement(this.col, { x: delta.x, y: delta.y, z: delta.z }, R.QueryFilterFlags.EXCLUDE_SENSORS, undefined,
      ign ? (c => !ign.colliders.some(x => x.handle === c.handle)) : undefined);
    const mv = this.kcc.computedMovement();
    this.onGround = this.kcc.computedGrounded();
    if (this.onGround && this.vel.y < 0) this.vel.y = -1;
    if (Math.abs(mv.y) < Math.abs(delta.y) * 0.5 && this.vel.y > 0 && !this.swim) this.vel.y = 0; // Kopf gestoßen
    const t = this.body.translation();
    const np = { x: t.x + mv.x, y: t.y + mv.y, z: t.z + mv.z };
    this.body.setNextKinematicTranslation(np);
    // setNextKinematicTranslation wirkt erst nach dem Physikschritt -> Position direkt mitführen
    this.body.setTranslation(np, true);
    this.pos.set(np.x, np.y - HALF - RAD, np.z);
    if (this.pos.y < -30) this.respawn(), this.body.setTranslation({ x: this.pos.x, y: this.pos.y + HALF + RAD, z: this.pos.z }, true);
  }

  sit(id) { this.seat = id; this.col.setEnabled(false); this.vel.set(0, 0, 0); }
  leaveSeat() {
    const s = this.world.parts.get(this.seat);
    this.seat = 0; this.col.setEnabled(true);
    if (s) {
      const p = new THREE.Vector3(1.2, 0.6, 0).applyQuaternion(s.mesh.quaternion).add(s.mesh.position);
      this.pos.set(p.x, p.y, p.z);
      this.body.setTranslation({ x: p.x, y: p.y + HALF + RAD, z: p.z }, true);
    }
  }
}

// Die Figuren der anderen Spieler
export class Others {
  constructor(world, scene) { this.world = world; this.scene = scene; this.map = new Map(); }

  ensure(pl) {
    let o = this.map.get(pl.id);
    if (!o) {
      const mesh = avatarMesh(COLORS[pl.color % COLORS.length], pl.name || 'Spieler');
      this.scene.add(mesh);
      const { body, col } = avatarBody(this.world, pl.p || SPAWN);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 6).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ color: COLORS[pl.color % COLORS.length], transparent: true, opacity: 0.7 }));
      beam.visible = false; this.scene.add(beam);
      o = { id: pl.id, mesh, body, col, beam, p: new THREE.Vector3(...(pl.p || SPAWN)), yaw: 0, pitch: 0, seat: 0, grab: null, t: 0 };
      this.map.set(pl.id, o);
    }
    return o;
  }

  setState(id, s) {
    const o = this.map.get(id); if (!o) return;
    o.tp = s.p; o.tyaw = s.yaw; o.pitch = s.pitch || 0; o.seat = s.seat || 0; o.grab = s.grab || null;
    o.col.setEnabled(!o.seat);
  }

  remove(id) {
    const o = this.map.get(id); if (!o) return;
    this.scene.remove(o.mesh); this.scene.remove(o.beam);
    this.world.avatarColliders.delete(o.col.handle);
    this.world.pw.removeRigidBody(o.body);
    this.map.delete(id);
  }

  update(dt) {
    const k = Math.min(1, dt * 14);
    for (const o of this.map.values()) {
      if (o.tp) o.p.lerp(new THREE.Vector3(o.tp[0], o.tp[1], o.tp[2]), k);
      if (o.tyaw !== undefined) { let d = o.tyaw - o.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); o.yaw += d * k; }
      o.mesh.position.set(o.p.x, o.p.y + 0.8, o.p.z);
      o.mesh.rotation.y = o.yaw;
      const moving = o.tp ? Math.hypot(o.tp[0] - o.p.x, o.tp[2] - o.p.z) > 0.05 : false;
      o.t += dt * (moving ? 12 : 0);
      for (const s of [-1, 1]) { const f = o.mesh.getObjectByName('foot' + s); if (f) f.position.z = -0.05 + (moving ? Math.sin(o.t + (s > 0 ? Math.PI : 0)) * 0.15 : 0); }
      o.body.setNextKinematicTranslation({ x: o.p.x, y: o.p.y + 0.8, z: o.p.z });
      // Greifstrahl der anderen
      if (o.grab && o.grab.target) {
        const a = new THREE.Vector3(o.p.x, o.p.y + 1.3, o.p.z), b = new THREE.Vector3(...o.grab.target);
        const len = a.distanceTo(b);
        o.beam.visible = len > 0.1; o.beam.position.copy(a); o.beam.scale.set(1, len, 1);
        if (len > 0.1) o.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).divideScalar(len));
      } else o.beam.visible = false;
    }
  }
}
